// src/features/preview/pdf/pdfWorker.ts
// pdf.js 워커 진입점. 워커는 메인 화면과 전역 객체가 달라 main.tsx에서 불러온
// src/polyfills.ts가 적용되지 않는다. pdf.js 6.4부터 워커가 Promise.withResolvers를 써서
// Safari 17.4 미만 WebKit에서 렌더링이 멈추므로, 폴리필을 먼저 불러온 뒤 워커를 실행한다.
import '../../../polyfills';
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
