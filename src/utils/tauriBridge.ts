// src/utils/tauriBridge.ts
// Tauri IPC 래퍼 배럴. 실제 구현은 `./tauri/*` 모듈에 있다.
export type {
  IndexSyncStatus,
  BatchIndexResult,
  MediaIndexProgress,
  EmbeddingEngineStatus,
  ModelBundleStatus,
  ModelDownloadProgress,
  DiskSpaceStatus,
} from './tauri/types';

export type { NativePdfPage } from './tauri/fileAccess';

export {
  getFileSrc,
  readFileBytes,
  checkFileAccess,
  renderNativePdfPage,
  openFileInOS,
  revealFileInOS,
  hideDesktopWindow,
  showSearchWindow,
  hideSettingsWindow,
  hideInstallerWindow,
  setTrayInstalling,
  setTrayInstallRequired,
  restoreTrayMenu,
} from './tauri/fileAccess';

export { getApplicationIcon, getFolderIcon } from './tauri/icons';

export {
  listApplications,
  listIndexedFolders,
  getIndexStatus,
  getEmbeddingStatus,
  waitForEmbeddingServer,
  getModelStatus,
  downloadModelBundle,
  cancelModelDownload,
  pauseModelDownload,
  resumeModelDownload,
  resetModelDownload,
  syncIndexManifest,
  syncSavedIndexManifest,
  pickIndexFolder,
  loadRuntimeIndex,
  upsertRuntimeIndex,
  markIndexFilesReady,
  resetIndex,
  indexPendingMedia,
  cancelMediaIndexing,
  setIndexOptions,
  setIndexingBusy,
  getIndexDiskSpace,
  getIndexError,
  clearIndexError,
  deleteAppData,
} from './tauri/indexing';
