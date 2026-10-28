import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { orderResultsBySection } from './orderResults';

const item = (name: string, extension: string, similarityScore: number): SearchResultItem => ({
  id: name,
  file: { path: `/r/${name}`, name, extension, sizeBytes: 0, modifiedAt: '' },
  similarityScore,
  bestChunk: { chunkIndex: 0, textSnippet: '' },
  category: 'document',
});

describe('orderResultsBySection', () => {
  it('orders sections by their best score and keeps order inside a section', () => {
    const ordered = orderResultsBySection([
      item('a.md', 'md', 0.5),
      item('song.mp3', 'mp3', 0.9),
      item('b.md', 'md', 0.7),
      item('clip.mp3', 'mp3', 0.4),
    ]);
    expect(ordered.map((result) => result.id)).toEqual([
      'song.mp3',
      'clip.mp3',
      'a.md',
      'b.md',
    ]);
  });

  it('falls back to the default section order on ties', () => {
    const ordered = orderResultsBySection([
      item('photo.png', 'png', 0.6),
      item('notes.md', 'md', 0.6),
    ]);
    expect(ordered.map((result) => result.id)).toEqual(['notes.md', 'photo.png']);
  });
});
