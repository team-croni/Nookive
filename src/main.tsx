import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import './i18n'
import { initGlobalImageFade } from './utils/imageFade'
import { initializeTheme } from './hooks/useTheme'
import App from './App.tsx'
import SettingsApp from './features/settings/SettingsApp.tsx'

// 모든 이미지가 로드 완료 시 부드럽게 페이드인되도록 전역 처리
initGlobalImageFade()

const isSettingsWindow = new URLSearchParams(window.location.search).get('window') === 'settings'

initializeTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSettingsWindow ? <SettingsApp /> : <App />}
  </StrictMode>,
)
