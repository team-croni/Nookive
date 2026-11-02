import { describe, expect, it } from 'vitest';
import { highlightCodeLines, splitHighlightedLines } from './codeHighlight';

describe('splitHighlightedLines', () => {
  it('closes and reopens tokens that span lines', () => {
    const html = 'a <span class="hljs-comment">/* one\ntwo */</span> b\n\nc';
    expect(splitHighlightedLines(html)).toEqual([
      'a <span class="hljs-comment">/* one</span>',
      '<span class="hljs-comment">two */</span> b',
      '',
      'c',
    ]);
  });
});

describe('highlightCodeLines', () => {
  it('keeps one entry per line and highlights known languages', async () => {
    const lines = ['const a = "x";', '/* multi', 'line */', 'a < b'];
    const html = await highlightCodeLines(lines, 'ts');
    expect(html).toHaveLength(lines.length);
    expect(html[0]).toContain('hljs-keyword');
    expect(html[2]).toMatch(/^<span class="hljs-comment">line \*\/<\/span>$/);
    expect(html[3]).toContain('&lt;');
  });

  it('escapes unknown languages', async () => {
    expect(await highlightCodeLines(['<b>'], 'unknown')).toEqual(['&lt;b&gt;']);
  });
});
