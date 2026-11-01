// src/features/search/services/embeddingClient.ts
// 쿼리 임베딩 요청 (재시도 포함).
const LLAMA_SERVER_URL = 'http://127.0.0.1:8080/v1/embeddings';
const SEARCH_QUERY_PREFIX = 'task: search result | query: ';
const EMBEDDING_RETRY_COUNT = 20;
const EMBEDDING_RETRY_DELAY_MS = 300;

export async function requestQueryEmbedding(
  query: string,
  signal: AbortSignal,
): Promise<Response> {
  let lastError: unknown = new Error('EmbeddingGemma is not ready yet.');
  for (let attempt = 0; attempt < EMBEDDING_RETRY_COUNT; attempt += 1) {
    if (signal.aborted) throw new DOMException('Search was cancelled.', 'AbortError');
    try {
      const response = await fetch(LLAMA_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: `${SEARCH_QUERY_PREFIX}${query}` }),
        signal,
      });
      if (response.ok) return response;
      lastError = new Error(`EmbeddingGemma request failed: ${response.status}`);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      lastError = error;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, EMBEDDING_RETRY_DELAY_MS);
      signal.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('Search was cancelled.', 'AbortError'));
      }, { once: true });
    });
  }
  throw lastError;
}
