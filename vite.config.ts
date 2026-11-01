import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // pdf.js는 워커를 module 타입으로 생성하므로 워커 번들도 ES 모듈로 만든다.
  worker: { format: 'es' },
})
