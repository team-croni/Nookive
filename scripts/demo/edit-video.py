#!/usr/bin/env python3
# scripts/demo/edit-video.py
# record.sh로 찍은 녹화본을 README용 영상으로 편집한다.
# 컷·배속, PDF 장면 줌, 자막, 페이드를 넣는다. ffmpeg로 프레임을 읽어 Pillow로 그린 뒤 다시 ffmpeg로 인코딩한다.
#
# 사용법: python3 scripts/demo/edit-video.py <녹화본.mov> <출력.mp4> [가로 폭, 기본 1440]
# 필요: ffmpeg, Pillow (pip install pillow)
#
# 시각과 영역 값은 3456x2234(Retina 메인 디스플레이) 60fps 녹화 기준이다.
# 콘티(storyboard.applescript)나 화면 해상도를 바꾸면 아래 값을 다시 맞춘다.
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
OUT_W = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
OUT_H = OUT_W * 5 // 8
FPS, SRC_FPS = 30, 60
# 원본에서 잘라 읽을 영역 (검색창 + 약간의 여백, 16:10)
RX, RY, RW, RH = 808, 545, 1840, 1150

# (원본 시작, 끝, 배속)
SEGMENTS = [
    (1.35, 5.0, 1.0),    # 창 등장, cal -> Calculator
    (5.0, 5.5, 2.0),     # 전체 선택
    (5.5, 8.0, 1.8),     # 긴 질문 입력
    (8.0, 13.6, 1.0),    # PDF p.3, ↓ 2024
    (13.6, 15.4, 1.8),   # 전체 선택 + sunset 입력
    (15.4, 19.6, 1.0),   # 사진, ↓
    (19.6, 22.0, 1.8),   # apollo 입력
    (22.0, 25.6, 1.0),   # 오디오 0:10 재생
    (25.6, 27.3, 1.6),   # tokyo weather 입력
    (27.3, 30.0, 1.0),   # 날씨
    (30.0, 31.4, 1.4),   # 3pm PST in KST 입력
    (31.4, 33.4, 1.0),   # 시간대 변환
    (33.4, 34.9, 1.4),   # 100 usd in krw 입력
    (34.9, 36.8, 1.0),   # 환율
    (36.8, 38.4, 1.4),   # 100 days from today 입력
    (38.4, 40.4, 1.0),   # 날짜
    (40.4, 42.4, 1.4),   # Q3 마케팅 예산 입력
    (42.4, 44.9, 1.0),   # 한국어로 찾은 영어 문서
]

FULL = (RX + RW / 2, RY + RH / 2, 1.0)
PREVIEW = (2084, 1090, 1.55)  # 미리보기 패널 (중심 x, y, 배율)
# (원본 시각, 카메라) - 사이는 ease-in-out 보간. ↓로 선택을 옮기기 전에 빠져나와 목록이 보이게 한다.
KEYS = [
    (0.0, FULL), (8.1, FULL), (8.9, PREVIEW), (10.2, PREVIEW), (10.9, FULL),
]

CAPTIONS = [
    (1.35, 5.5, 'Launch apps in a few keystrokes'),
    (5.5, 13.6, 'Ask in plain language — it opens the right page'),
    (13.6, 19.6, "Find photos by what's in them"),
    (19.6, 25.6, 'Jump to the moment it was said'),
    (25.6, 40.4, 'Weather, time zones, currency, and dates'),
    (40.4, 45.0, 'Search in any language'),
]

FADE_IN, FADE_OUT, CAPTION_FADE = 0.4, 0.5, 0.3


def out_duration():
    return sum((end - start) / speed for start, end, speed in SEGMENTS)


def src_time(t):
    for start, end, speed in SEGMENTS:
        length = (end - start) / speed
        if t < length:
            return start + t * speed
        t -= length
    return SEGMENTS[-1][1]


def ease(x):
    return x * x * (3 - 2 * x)


def camera(ts):
    for (t0, k0), (t1, k1) in zip(KEYS, KEYS[1:]):
        if t0 <= ts <= t1:
            p = ease((ts - t0) / (t1 - t0)) if t1 > t0 else 1
            return tuple(a + (b - a) * p for a, b in zip(k0, k1))
    return KEYS[-1][1]


FONT = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', round(OUT_W * 0.026))
try:
    FONT.set_variation_by_name('Semibold')
except (OSError, ValueError):
    pass


def caption_layer(text, alpha):
    layer = Image.new('RGBA', (OUT_W, OUT_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=FONT)
    pad_x, pad_y = round(OUT_W * 0.022), round(OUT_W * 0.011)
    box_w, box_h = right - left + pad_x * 2, bottom - top + pad_y * 2
    x0 = (OUT_W - box_w) // 2
    y0 = OUT_H - box_h - round(OUT_H * 0.035)
    draw.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h], radius=box_h // 2, fill=(12, 12, 16, round(200 * alpha)))
    draw.text((x0 + pad_x - left, y0 + pad_y - top), text, font=FONT, fill=(255, 255, 255, round(255 * alpha)))
    return layer


def caption_at(ts):
    for start, end, text in CAPTIONS:
        if start <= ts < end:
            alpha = min(1, (ts - start) / CAPTION_FADE, (end - ts) / CAPTION_FADE)
            return text, max(0, alpha)
    return None, 0


def main():
    decoder = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-i', SRC, '-vf', f'crop={RW}:{RH}:{RX}:{RY}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
        stdout=subprocess.PIPE)
    encoder = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OUT_W}x{OUT_H}', '-r', str(FPS), '-i', '-',
         '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT],
        stdin=subprocess.PIPE)
    frame_bytes = RW * RH * 3
    current_index, current = -1, None
    total = out_duration()
    captions = {}
    for k in range(int(total * FPS)):
        t = k / FPS
        ts = src_time(t)
        # 출력 시각은 원본에서 항상 앞으로만 가므로 필요한 프레임까지 순서대로 읽는다.
        while current_index < round(ts * SRC_FPS):
            buffer = decoder.stdout.read(frame_bytes)
            if len(buffer) < frame_bytes:
                break
            current, current_index = buffer, current_index + 1
        frame = Image.frombuffer('RGB', (RW, RH), current)
        cx, cy, zoom = camera(ts)
        w, h = RW / zoom, RH / zoom
        x0 = min(max(cx - w / 2, RX), RX + RW - w) - RX
        y0 = min(max(cy - h / 2, RY), RY + RH - h) - RY
        # box에 소수 좌표를 넘겨 줌 중에도 화면이 픽셀 단위로 떨리지 않게 한다.
        image = frame.resize((OUT_W, OUT_H), Image.LANCZOS, box=(x0, y0, x0 + w, y0 + h))
        text, alpha = caption_at(ts)
        if text and alpha > 0:
            key = (text, round(alpha, 2))
            if key not in captions:
                captions[key] = caption_layer(text, alpha)
            image = Image.alpha_composite(image.convert('RGBA'), captions[key]).convert('RGB')
        fade = max(0, min(1, t / FADE_IN, (total - t) / FADE_OUT))
        if fade < 1:
            image = Image.eval(image, lambda v, f=fade: int(v * f))
        encoder.stdin.write(image.tobytes())
    encoder.stdin.close()
    encoder.wait()
    decoder.kill()
    print(f'{OUT}: {total:.2f}s')


main()
