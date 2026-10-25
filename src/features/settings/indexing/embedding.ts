// src/features/settings/indexing/embedding.ts
// 텍스트 배치 임베딩 요청 (타임아웃/중단 전파 포함).
const LLAMA_SERVER_URL = 'http://127.0.0.1:8080/v1/embeddings';
const EMBEDDING_TIMEOUT_MS = 15_000;

export class EmbeddingTimeoutError extends Error {
  constructor() {
    super(`EmbeddingGemma 응답 시간 초과 (${EMBEDDING_TIMEOUT_MS / 1000}초)`);
    this.name = 'EmbeddingTimeoutError';
  }
}

export async function embedTextBatch(
  texts: string[],
  title: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  const requestController = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, EMBEDDING_TIMEOUT_MS);
  const forwardAbort = () => requestController.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(LLAMA_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: texts.map((text) => `title: ${title} | text: ${text}`),
      }),
      signal: requestController.signal,
    });
    if (!response.ok) throw new Error(`EmbeddingGemma 응답 오류: ${response.status}`);
    const json = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const vectors = json.data?.map((item) => item.embedding ?? []) ?? [];
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) {
      throw new Error(`EmbeddingGemma 벡터 개수 불일치 (${vectors.length}/${texts.length})`);
    }
    return vectors;
  } catch (error) {
    if (timedOut) throw new EmbeddingTimeoutError();
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
