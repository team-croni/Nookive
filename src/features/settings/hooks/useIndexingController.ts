// src/features/settings/hooks/useIndexingController.ts
// 설정 창의 인덱스 상태/진행률/색인 실행 로직을 캡슐화한다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import {
  cancelMediaIndexing,
  clearIndexError,
  getEmbeddingStatus,
  getIndexDiskSpace,
  getIndexError,
  getIndexStatus,
  indexPendingMedia,
  isIndexingBusy,
  pickIndexFolder,
  resetIndex,
  setIndexOptions,
  setIndexingBusy,
  syncIndexManifest,
  syncSavedIndexManifest,
  type IndexSyncStatus,
  type MediaIndexProgress,
  waitForEmbeddingServer,
} from '../../../utils/tauriBridge';
import {
  indexPendingTextFiles,
  isStorageSpaceError,
  isTextIndexablePath,
  type IndexProgress,
} from '../indexingWorker';
import i18n from '../../../i18n';

export function useIndexingController() {
  const [status, setStatus] = useState<IndexSyncStatus | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const [useAligner, setUseAlignerState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nookive.useAligner') !== 'false';
    } catch {
      return true;
    }
  });
  const abortRef = useRef<AbortController | null>(null);
  // Rust가 앱 시작이나 파일 변경 때 직접 시작한 자동 색인을 따라가는 중인지
  const autoRunRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);
  const queuedProgressRef = useRef<IndexProgress | null>(null);

  const publishProgress = useCallback((nextProgress: IndexProgress) => {
    queuedProgressRef.current = nextProgress;
    if (progressTimerRef.current !== null) return;
    progressTimerRef.current = window.setTimeout(() => {
      progressTimerRef.current = null;
      const queuedProgress = queuedProgressRef.current;
      queuedProgressRef.current = null;
      if (queuedProgress) setProgress(queuedProgress);
    }, 100);
  }, []);

  const flushProgress = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const queuedProgress = queuedProgressRef.current;
    queuedProgressRef.current = null;
    if (queuedProgress) setProgress(queuedProgress);
  }, []);

  useEffect(() => () => {
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
  }, []);

  const refresh = useCallback(async () => {
    const [nextStatus, , lastError] = await Promise.all([
      syncSavedIndexManifest(),
      getEmbeddingStatus(),
      getIndexError(),
    ]);
    setStatus(nextStatus);
    setIndexMessage(lastError
      ? isStorageSpaceError(lastError)
        ? i18n.t('messages.storageFull', { ns: 'settings' })
        : i18n.t('messages.autoIndexFailed', { ns: 'settings' })
      : null);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>('index-auto-failed', ({ payload }) => {
      setIndexMessage(isStorageSpaceError(payload)
        ? i18n.t('messages.storageFull', { ns: 'settings' })
        : i18n.t('messages.autoIndexFailed', { ns: 'settings' }));
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 Rust 인덱서 상태를 초기 동기화한다.
    void refresh();
  }, [refresh]);

  // 자동 색인도 수동 색인과 같은 진행률로 보여준다. Rust는 자동 색인의 시작(index-auto-started),
  // 파일별 진행(index-progress, runId가 auto-로 시작), 끝(index-updated / index-auto-failed)을 알린다.
  useEffect(() => {
    let total = 0;
    let indexed = 0;
    let skipped = 0;
    const show = (completed: number, currentPath?: string) => {
      publishProgress({
        total,
        completed,
        indexed,
        skipped,
        errors: skipped,
        phase: 'media',
        overallTotal: total,
        overallCompleted: completed,
        textTotal: 0,
        textCompleted: 0,
        mediaTotal: total,
        mediaCompleted: completed,
        pendingMedia: Math.max(total - completed, 0),
        currentPath,
      });
    };
    const begin = (pendingPaths: string[]) => {
      // 수동 색인 중이면 그쪽 진행률을 그대로 쓴다.
      if (abortRef.current) return;
      autoRunRef.current = true;
      total = pendingPaths.length;
      indexed = 0;
      skipped = 0;
      setIsBusy(true);
      setIndexMessage(null);
      show(0, pendingPaths[0]);
    };
    const finish = async () => {
      if (!autoRunRef.current) return;
      autoRunRef.current = false;
      flushProgress();
      setProgress(null);
      setIsBusy(false);
      const latest = await getIndexStatus();
      if (latest) setStatus(latest);
    };

    let cancelled = false;
    const stops: Array<() => void> = [];
    void Promise.all([
      listen<IndexSyncStatus>('index-auto-started', ({ payload }) => begin(payload.pending_paths)),
      listen<MediaIndexProgress>('index-progress', ({ payload }) => {
        if (!autoRunRef.current || !payload.runId?.startsWith('auto-')) return;
        if (payload.indexed) indexed += 1;
        else skipped += 1;
        total = payload.total;
        show(payload.completed, payload.path);
      }),
      listen('index-updated', () => void finish()),
      listen('index-auto-failed', () => void finish()),
    ]).then((unlisteners) => {
      if (cancelled) unlisteners.forEach((stop) => stop());
      else stops.push(...unlisteners);
    });

    // 설정 창을 열었을 때 이미 자동 색인이 돌고 있으면 남은 파일 수로 진행 표시를 시작한다.
    void Promise.all([isIndexingBusy(), getIndexStatus()]).then(([busy, current]) => {
      if (!cancelled && busy && current && !abortRef.current && !autoRunRef.current) {
        begin(current.pending_paths);
      }
    });

    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [flushProgress, publishProgress]);

  // "정확한 시점 표시" 설정을 Rust 자동 색인 워처에도 반영한다.
  useEffect(() => {
    void setIndexOptions(useAligner);
  }, [useAligner]);

  const startIndexing = useCallback(async (nextStatus: IndexSyncStatus | null = status) => {
    if (!nextStatus || nextStatus.pending_paths.length === 0 || abortRef.current) return;
    if (autoRunRef.current) {
      setIndexMessage(i18n.t('messages.indexBusy', { ns: 'settings' }));
      return;
    }
    const diskSpace = await getIndexDiskSpace();
    if (diskSpace && diskSpace.available_bytes < diskSpace.minimum_required_bytes) {
      setIndexMessage(i18n.t('messages.storageFull', { ns: 'settings' }));
      return;
    }
    const textPaths = nextStatus.pending_paths.filter(isTextIndexablePath);
    const mediaPaths = nextStatus.pending_paths.filter((filePath) => !isTextIndexablePath(filePath));
    const overallTotal = textPaths.length + mediaPaths.length;
    setIndexMessage(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setIsBusy(true);
    // 파일 감시자가 자동 색인을 시작하기 전에 네이티브 busy 상태를 먼저
    // 설정해야 수동 색인과 진행률 이벤트가 서로 섞이지 않는다.
    const acquired = await setIndexingBusy(true);
    if (!acquired) {
      abortRef.current = null;
      setIsBusy(false);
      setIndexMessage(i18n.t('messages.indexBusy', { ns: 'settings' }));
      return;
    }
    try {
      const engine = await waitForEmbeddingServer();
      if (!engine?.ready) {
        // Rust가 보내는 엔진 상태 문구는 번역되지 않으므로 화면에는 번역된 안내만 보여준다.
        console.warn('[Settings] 임베딩 엔진 준비 실패:', engine?.message);
        setIndexMessage(i18n.t(engine ? 'messages.engineNotReady' : 'messages.indexFailed', { ns: 'settings' }));
        return;
      }
      let indexedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      let stopReason: string | null = null;
      let mediaErrorHint: string | null = null;
      let storageError = false;
      let textResult: IndexProgress | null = null;
      publishProgress({
        total: overallTotal,
        completed: 0,
        indexed: 0,
        skipped: 0,
        errors: 0,
        phase: textPaths.length > 0 ? 'text' : 'media',
        overallTotal,
        overallCompleted: 0,
        textTotal: textPaths.length,
        textCompleted: 0,
        mediaTotal: mediaPaths.length,
        mediaCompleted: 0,
        pendingMedia: mediaPaths.length,
        currentPath: textPaths[0] || mediaPaths[0] || '',
      });
      flushProgress();
      if (textPaths.length > 0) {
        const onTextProgress = (nextProgress: IndexProgress) => {
          publishProgress({
            ...nextProgress,
            phase: 'text',
            overallTotal,
            overallCompleted: nextProgress.completed,
            textTotal: textPaths.length,
            textCompleted: nextProgress.completed,
            mediaTotal: mediaPaths.length,
            mediaCompleted: 0,
            pendingMedia: mediaPaths.length,
          });
        };
        textResult = await indexPendingTextFiles(textPaths, onTextProgress, controller.signal);
        indexedCount += textResult.indexed;
        skippedCount += textResult.skipped;
        errorCount += textResult.errors;
        stopReason = textResult.stopReason ?? null;
        storageError = Boolean(textResult.storageError);
        flushProgress();
        const latest = await getIndexStatus();
        if (latest) setStatus(latest);
      }

      if (!controller.signal.aborted && !textResult?.stopped && mediaPaths.length > 0) {
        publishProgress({
          total: mediaPaths.length,
          completed: 0,
          indexed: textResult?.indexed ?? 0,
          skipped: textResult?.skipped ?? 0,
          errors: textResult?.errors ?? 0,
          phase: 'media',
          overallTotal,
          overallCompleted: textPaths.length,
          textTotal: textPaths.length,
          textCompleted: textPaths.length,
          mediaTotal: mediaPaths.length,
          mediaCompleted: 0,
          pendingMedia: mediaPaths.length,
          currentPath: mediaPaths[0],
        });
        flushProgress();
        let mediaIndexedCount = textResult?.indexed ?? 0;
        let mediaSkippedCount = textResult?.skipped ?? 0;
        let mediaErrorCount = textResult?.errors ?? 0;
        const mediaRunId = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const stopListeningToMediaProgress = await listen<MediaIndexProgress>('index-progress', ({ payload }) => {
          if (payload.runId !== mediaRunId) return;
          if (payload.indexed) {
            mediaIndexedCount += 1;
          } else {
            mediaSkippedCount += 1;
            mediaErrorCount += 1;
          }
          publishProgress({
            total: mediaPaths.length,
            completed: payload.completed,
            indexed: mediaIndexedCount,
            skipped: mediaSkippedCount,
            errors: mediaErrorCount,
            phase: 'media',
            overallTotal,
            overallCompleted: textPaths.length + payload.completed,
            textTotal: textPaths.length,
            textCompleted: textPaths.length,
            mediaTotal: mediaPaths.length,
            mediaCompleted: payload.completed,
            pendingMedia: Math.max(mediaPaths.length - payload.completed, 0),
            currentPath: payload.path,
          });
        });
        let result: Awaited<ReturnType<typeof indexPendingMedia>> | null = null;
        try {
          result = await indexPendingMedia(mediaPaths, useAligner, mediaRunId);
        } catch (error) {
          console.warn('[Indexer] 미디어 색인 실행 실패:', error);
          storageError = isStorageSpaceError(error);
          mediaErrorHint = i18n.t('messages.indexFailed', { ns: 'settings' });
        } finally {
          stopListeningToMediaProgress();
        }
        if (!result) {
          if (controller.signal.aborted) {
            stopReason = 'user';
          } else {
            errorCount += mediaPaths.length;
            // 미디어 색인 전체 실패를 ASR 문제로 단정하지 않는다. ASR은 선택 기능이며,
            // 실제 원인은 번들 Node/PDF/이미지 처리기 등 여러 가지일 수 있다.
            mediaErrorHint = i18n.t('messages.indexFailed', { ns: 'settings' });
          }
        } else {
          setStatus(result.status);
          publishProgress({
            total: mediaPaths.length,
            completed: mediaPaths.length,
            indexed: (textResult?.indexed ?? 0) + result.indexed_files,
            skipped: (textResult?.skipped ?? 0) + Math.max(mediaPaths.length - result.indexed_files, 0),
            errors: (textResult?.errors ?? 0) + Math.max(mediaPaths.length - result.indexed_files, 0),
            phase: 'media',
            overallTotal,
            overallCompleted: overallTotal,
            textTotal: textPaths.length,
            textCompleted: textPaths.length,
            mediaTotal: mediaPaths.length,
            mediaCompleted: mediaPaths.length,
            pendingMedia: 0,
          });
          indexedCount += result.indexed_files;
          skippedCount += Math.max(mediaPaths.length - result.indexed_files, 0);
          errorCount += Math.max(mediaPaths.length - result.indexed_files, 0);
        }
      }

      const refreshed = await getIndexStatus();
      if (refreshed) setStatus(refreshed);
      const messages: string[] = [];
      if (indexedCount > 0) {
        messages.push(i18n.t('messages.indexed', { ns: 'settings', count: indexedCount }));
      }
      if (errorCount > 0) {
        messages.push(i18n.t('messages.errors', { ns: 'settings', count: errorCount }));
      } else if (skippedCount > 0) {
        messages.push(i18n.t('messages.skipped', { ns: 'settings', count: skippedCount }));
      }
      if (stopReason && !storageError) messages.push(i18n.t('messages.aborted', { ns: 'settings' }));
      if (mediaErrorHint) messages.push(mediaErrorHint);
      if (storageError) messages.unshift(i18n.t('messages.storageFull', { ns: 'settings' }));
      setIndexMessage(messages.join(' ') || i18n.t('messages.completed', { ns: 'settings' }));
      if (!storageError) await clearIndexError();
      void emit('index-updated').catch(() => { });
    } finally {
      flushProgress();
      abortRef.current = null;
      setIsBusy(false);
      setProgress(null);
      await setIndexingBusy(false);
    }
  }, [flushProgress, publishProgress, status, useAligner]);

  const setUseAligner = useCallback((enabled: boolean) => {
    setUseAlignerState(enabled);
    try {
      localStorage.setItem('nookive.useAligner', String(enabled));
    } catch {
      // localStorage를 쓸 수 없는 환경에서는 메모리 상태만 유지한다.
    }
  }, []);

  const updateRoots = async (roots: string[], startWorker = false) => {
    setIsBusy(true);
    const next = await syncIndexManifest(roots);
    if (next) setStatus(next);
    void emit('index-updated').catch(() => { });
    if (startWorker && next && next.pending_paths.length > 0) {
      void startIndexing(next);
    } else {
      setIsBusy(false);
    }
  };

  const addFolder = async (): Promise<string | null> => {
    const folder = await pickIndexFolder();
    if (!folder) return null;
    const roots = Array.from(new Set([...(status?.roots ?? []), folder]));
    await updateRoots(roots, true);
    return folder;
  };

  const removeFolder = async (folder: string) => {
    await updateRoots((status?.roots ?? []).filter((root) => root !== folder));
  };

  const requestReset = () => {
    if (isBusy) return;
    setIndexMessage(null);
    setIsResetConfirming(true);
  };

  const cancelReset = () => {
    if (isBusy) return;
    setIsResetConfirming(false);
  };

  const confirmReset = async () => {
    if (isBusy) return;
    setIsResetConfirming(false);
    setIsBusy(true);
    setIndexMessage(null);
    await clearIndexError();
    const acquired = await setIndexingBusy(true);
    if (!acquired) {
      setIsBusy(false);
      return;
    }
    try {
      const next = await resetIndex();
      if (next) {
        setStatus(next);
        setResetMessage(i18n.t('messages.reset', { ns: 'settings' }));
      } else {
        setResetMessage(i18n.t('messages.resetFailed', { ns: 'settings' }));
      }
      setProgress(null);
      void emit('index-updated').catch(() => { });
    } finally {
      await setIndexingBusy(false);
      setIsBusy(false);
    }
  };

  const abortIndexing = () => {
    abortRef.current?.abort();
    // 미디어 인덱싱은 Rust/Node 프로세스에서 실행되므로 별도로 종료한다.
    void cancelMediaIndexing();
  };

  return {
    status,
    isBusy,
    progress,
    indexMessage,
    resetMessage,
    isResetConfirming,
    useAligner,
    setUseAligner,
    refresh,
    startIndexing,
    addFolder,
    removeFolder,
    requestReset,
    cancelReset,
    confirmReset,
    abortIndexing,
  };
}
