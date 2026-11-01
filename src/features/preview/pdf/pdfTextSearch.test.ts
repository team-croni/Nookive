import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { findMatchRects } from './pdfTextSearch';

/** 페이지마다 한 줄씩 텍스트가 있는 최소 PDF를 만든다. (Helvetica 기본 글꼴) */
function buildPdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, index) => {
    const pageId = pageIds[index];
    const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

const load = (pages: string[]) => pdfjs.getDocument({ data: buildPdf(pages) }).promise;

describe('findMatchRects', () => {
  it('ignores stopwords and picks the page with the most query terms', async () => {
    const doc = await load([
      'A year of building what our customers asked for',
      'Domestic business grew 8 percent',
      'Overseas sales grew 35 percent last year',
    ]);
    const result = await findMatchRects('report-a', doc, 'how much did overseas sales grow last year');
    expect(result.targetPage).toBe(3);
    expect(result.matched).toBe(true);
  });

  it('prefers the page chosen by search when pages tie', async () => {
    const doc = await load(['Overseas sales summary', 'Overseas sales by region']);
    expect((await findMatchRects('report-b', doc, 'overseas sales')).targetPage).toBe(1);
    expect((await findMatchRects('report-b', doc, 'overseas sales', 2)).targetPage).toBe(2);
  });

  it('falls back to the first page when nothing matches', async () => {
    const doc = await load(['Lease agreement', 'Security deposit']);
    const result = await findMatchRects('report-c', doc, 'quarterly revenue');
    expect(result).toMatchObject({ targetPage: 1, matched: false });
  });
});
