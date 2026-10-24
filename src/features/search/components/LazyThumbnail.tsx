// src/features/search/components/LazyThumbnail.tsx
// 화면에 들어올 때만 미디어를 로드하는 지연 썸네일.
import React, { useEffect, useRef, useState } from 'react';
import styles from './ResultItem.module.css';

interface LazyThumbnailProps {
  src: string;
  alt: string;
  onError: () => void;
}

// 화면에 들어올 때만 이미지를 로드하는 지연 썸네일 (목록 스크롤/재렌더 시 디코딩 폭주 방지)
export const LazyThumbnail: React.FC<LazyThumbnailProps> = ({ src, alt, onError }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.thumbnailSlot}>
      {show && (
        <img
          src={src}
          alt={alt}
          className={styles.thumbnail}
          decoding="async"
          loading="lazy"
          onError={onError}
        />
      )}
    </div>
  );
};

export const LazyVideoThumbnail: React.FC<LazyThumbnailProps> = ({ src, alt, onError }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.thumbnailSlot}>
      {show && (
        <video
          src={src}
          className={styles.videoThumbnail}
          muted
          playsInline
          // metadata만 받으면 브라우저가 첫 프레임을 디코드하지 않아 검은 화면이
          // 남을 수 있다. 화면 근처에 들어온 비디오만 auto로 첫 프레임을 읽는다.
          preload="auto"
          aria-label={alt}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            // 자동 재생은 하지 않고, 첫 프레임만 디코드하도록 아주 짧게 seek한다.
            if (video.duration > 0) {
              video.currentTime = Math.min(0.01, video.duration);
            }
          }}
          onLoadedData={(event) => {
            event.currentTarget.pause();
          }}
          onError={onError}
        />
      )}
    </div>
  );
};
