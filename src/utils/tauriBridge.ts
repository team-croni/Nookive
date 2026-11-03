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
  openSettingsWindow,
  SETTINGS_TAB_REQUEST_KEY,
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
  isIndexingBusy,
  getIndexDiskSpace,
  getIndexError,
  clearIndexError,
  deleteAppData,
} from './tauri/indexing';

export {
  getCodeIndexStatus,
  isCodeIndexBuilding,
  listCodeEditors,
  openCodeFile,
  refreshCodeFiles,
  searchCodeFiles,
  sendCodeSearchEnabled,
  syncCodeIndex,
} from './tauri/codeSearch';
export type { CodeEditor, CodeIndexStatus } from './tauri/codeSearch';

export { loadSearchFeedback, saveSearchFeedback, resetSearchFeedback } from './tauri/searchFeedback';
export {
  applyLaunchAtLoginDefault,
  getLaunchAtLogin,
  openLoginItemsSettings,
  setLaunchAtLogin,
} from './tauri/loginItem';
export type { LoginItemStatus } from './tauri/loginItem';
