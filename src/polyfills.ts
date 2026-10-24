// src/polyfills.ts
// 구형 WebKit(WKWebView) / Safari 17.4 미만 환경 대응 폴리필
// pdf.js v5 가 Promise.withResolvers() 를 사용하여 "undefined is not a function" 이 발생하는 것을 방지

interface WithResolversResult<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

type PromiseWithResolvers = <T>() => WithResolversResult<T>;

const promiseCtor = Promise as unknown as { withResolvers?: PromiseWithResolvers };

if (typeof promiseCtor.withResolvers !== 'function') {
  promiseCtor.withResolvers = function withResolvers<T>(): WithResolversResult<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// ReadableStream async iterator (구형 WebKit)
// pdf.js 의 getTextContent() 가 `for await (const v of readableStream)` 를 사용하는데,
// 이 WebKit 버전에는 ReadableStream[Symbol.asyncIterator] 가 없어 실패한다.
const ReadableStreamCtor = (globalThis as unknown as {
  ReadableStream?: { prototype: Record<PropertyKey, unknown> };
}).ReadableStream;

if (
  ReadableStreamCtor &&
  typeof ReadableStreamCtor.prototype[Symbol.asyncIterator] !== 'function'
) {
  ReadableStreamCtor.prototype[Symbol.asyncIterator] = function asyncIterator(this: {
    getReader: () => {
      read: () => Promise<{ done: boolean; value: unknown }>;
      cancel: (reason?: unknown) => Promise<void>;
    };
  }) {
    const reader = this.getReader();
    return {
      next() {
        return reader.read().then((r) => ({ done: r.done, value: r.value }));
      },
      return(value?: unknown) {
        return reader.cancel(value).then(() => ({ done: true, value }));
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
}

// Array.prototype.at (구형 엔진)
if (typeof Array.prototype.at !== 'function') {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'at', {
    value: function at<T>(this: T[], index: number): T | undefined {
      const len = this.length;
      const i = Math.trunc(index) || 0;
      const k = i < 0 ? len + i : i;
      return k < 0 || k >= len ? undefined : this[k];
    },
    writable: true,
    configurable: true,
  });
}
