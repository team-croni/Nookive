// src-tauri/src/mask_png.rs
// 둥근 모서리 마스크(RGBA PNG) 생성. 외부 crate 없이 std만 사용한다.
//
// 마스크는 `(2 * radius + stretch)` 크기의 정사각형이며 네 모서리만 반원이고
// 가운데 십자 영역은 완전 불투명이다. NSImage의 capInsets(=radius)와 stretch
// 리사이즈 모드를 함께 쓰면, 가운데 영역만 늘어나므로 어떤 창 크기에서도
// 모서리 반경이 그대로 유지된다.

/// 둥근 모서리 마스크의 RGBA 픽셀을 만든다. 반환값은 (한 변의 픽셀 수, RGBA 버퍼).
/// RGB는 0(검정)이고 알파 채널만 모양을 결정한다. 모서리는 안티앨리어싱한다.
pub fn rounded_mask_rgba(radius_px: u32, stretch_px: u32) -> (u32, Vec<u8>) {
    let size = radius_px * 2 + stretch_px;
    let radius = radius_px as f32;
    let extent = size as f32;
    let mut rgba = vec![0u8; (size * size * 4) as usize];

    for y in 0..size {
        for x in 0..size {
            let cx = x as f32 + 0.5;
            let cy = y as f32 + 0.5;
            // 가장 가까운 모서리 원의 중심까지의 거리. 십자 영역에서는 0이다.
            let dx = if cx < radius {
                radius - cx
            } else if cx > extent - radius {
                cx - (extent - radius)
            } else {
                0.0
            };
            let dy = if cy < radius {
                radius - cy
            } else if cy > extent - radius {
                cy - (extent - radius)
            } else {
                0.0
            };
            let coverage = (radius - (dx * dx + dy * dy).sqrt() + 0.5).clamp(0.0, 1.0);
            let index = ((y * size + x) * 4) as usize;
            rgba[index + 3] = (coverage * 255.0).round() as u8;
        }
    }

    (size, rgba)
}

/// 둥근 모서리 마스크를 PNG 바이트로 만든다. 반환값은 (한 변의 픽셀 수, PNG).
pub fn rounded_mask_png(radius_px: u32, stretch_px: u32) -> (u32, Vec<u8>) {
    let (size, rgba) = rounded_mask_rgba(radius_px, stretch_px);
    (size, encode_png_rgba(size, size, &rgba))
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in bytes {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

fn adler32(bytes: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &byte in bytes {
        a = (a + byte as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

fn push_chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let mut body = Vec::with_capacity(4 + data.len());
    body.extend_from_slice(kind);
    body.extend_from_slice(data);
    out.extend_from_slice(&body);
    out.extend_from_slice(&crc32(&body).to_be_bytes());
}

/// 8비트 RGBA PNG 인코더. 압축 없이 zlib "stored" 블록을 사용한다. (마스크는 수십 KB 이하)
pub fn encode_png_rgba(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    assert_eq!(
        rgba.len(),
        (width * height * 4) as usize,
        "RGBA 버퍼 크기 불일치"
    );

    // 스캔라인마다 필터 타입 0(None)을 앞에 붙인다.
    let mut raw = Vec::with_capacity(((width * 4 + 1) * height) as usize);
    for row in rgba.chunks((width * 4) as usize) {
        raw.push(0);
        raw.extend_from_slice(row);
    }

    // zlib 스트림: 헤더 + stored 블록들 + Adler-32
    let mut zlib = vec![0x78, 0x01];
    let mut blocks = raw.chunks(65535).peekable();
    while let Some(block) = blocks.next() {
        let is_last = blocks.peek().is_none();
        let len = block.len() as u16;
        zlib.push(if is_last { 1 } else { 0 });
        zlib.extend_from_slice(&len.to_le_bytes());
        zlib.extend_from_slice(&(!len).to_le_bytes());
        zlib.extend_from_slice(block);
    }
    zlib.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]); // 8비트, RGBA, 기본 압축/필터/비인터레이스
    push_chunk(&mut png, b"IHDR", &ihdr);
    push_chunk(&mut png, b"IDAT", &zlib);
    push_chunk(&mut png, b"IEND", &[]);
    png
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_matches_known_vector() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
    }

    #[test]
    fn adler32_matches_known_vector() {
        assert_eq!(adler32(b"Wikipedia"), 0x11E6_0398);
    }

    /// stored 블록 PNG를 직접 파싱해 CRC/Adler/구조를 검증하고 원본 RGBA를 복원한다.
    fn decode_stored_png(png: &[u8]) -> (u32, u32, Vec<u8>) {
        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
        let (mut pos, mut width, mut height) = (8usize, 0u32, 0u32);
        let mut idat = Vec::new();
        let mut saw_iend = false;
        while pos < png.len() {
            let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
            let kind = &png[pos + 4..pos + 8];
            let data = &png[pos + 8..pos + 8 + len];
            let crc = u32::from_be_bytes(png[pos + 8 + len..pos + 12 + len].try_into().unwrap());
            assert_eq!(crc, crc32(&png[pos + 4..pos + 8 + len]), "청크 CRC 불일치");
            if kind == b"IHDR" {
                width = u32::from_be_bytes(data[0..4].try_into().unwrap());
                height = u32::from_be_bytes(data[4..8].try_into().unwrap());
                assert_eq!(&data[8..], &[8, 6, 0, 0, 0]);
            } else if kind == b"IDAT" {
                idat.extend_from_slice(data);
            } else if kind == b"IEND" {
                saw_iend = true;
            }
            pos += 12 + len;
        }
        assert!(saw_iend, "IEND 없음");

        assert_eq!(&idat[..2], &[0x78, 0x01], "zlib 헤더");
        let mut p = 2usize;
        let mut raw = Vec::new();
        loop {
            let header = idat[p];
            let len = u16::from_le_bytes([idat[p + 1], idat[p + 2]]);
            let nlen = u16::from_le_bytes([idat[p + 3], idat[p + 4]]);
            assert_eq!(nlen, !len, "stored 블록 NLEN");
            p += 5;
            raw.extend_from_slice(&idat[p..p + len as usize]);
            p += len as usize;
            if header & 1 == 1 {
                break;
            }
        }
        let adler = u32::from_be_bytes(idat[p..p + 4].try_into().unwrap());
        assert_eq!(adler, adler32(&raw), "Adler-32 불일치");

        let stride = (width * 4 + 1) as usize;
        assert_eq!(raw.len(), stride * height as usize);
        let mut rgba = Vec::new();
        for row in raw.chunks(stride) {
            assert_eq!(row[0], 0, "필터 타입은 None이어야 한다");
            rgba.extend_from_slice(&row[1..]);
        }
        (width, height, rgba)
    }

    #[test]
    fn png_round_trips_pixels() {
        let (size, rgba) = rounded_mask_rgba(54, 3);
        let png = encode_png_rgba(size, size, &rgba);
        let (w, h, decoded) = decode_stored_png(&png);
        assert_eq!((w, h), (size, size));
        assert_eq!(decoded, rgba);
    }

    #[test]
    fn multi_block_png_round_trips() {
        // 65535바이트를 넘겨 stored 블록이 여러 개 나오는 경우
        let (size, rgba) = rounded_mask_rgba(100, 3);
        assert!(size * size * 4 > 65535);
        let png = encode_png_rgba(size, size, &rgba);
        let (_, _, decoded) = decode_stored_png(&png);
        assert_eq!(decoded, rgba);
    }

    fn alpha(rgba: &[u8], size: u32, x: u32, y: u32) -> u8 {
        rgba[((y * size + x) * 4 + 3) as usize]
    }

    #[test]
    fn mask_shape_is_rounded_rect() {
        let (size, rgba) = rounded_mask_rgba(54, 3);
        assert_eq!(size, 111);
        // 모서리 끝 픽셀은 투명, 중앙과 직선 변은 불투명
        assert_eq!(alpha(&rgba, size, 0, 0), 0);
        assert_eq!(alpha(&rgba, size, size - 1, 0), 0);
        assert_eq!(alpha(&rgba, size, 0, size - 1), 0);
        assert_eq!(alpha(&rgba, size, size - 1, size - 1), 0);
        assert_eq!(alpha(&rgba, size, size / 2, size / 2), 255);
        assert_eq!(alpha(&rgba, size, size / 2, 0), 255);
        assert_eq!(alpha(&rgba, size, 0, size / 2), 255);
        // 네 모서리가 대칭이어야 한다
        for y in 0..size {
            for x in 0..size {
                let a = alpha(&rgba, size, x, y);
                assert_eq!(a, alpha(&rgba, size, size - 1 - x, y));
                assert_eq!(a, alpha(&rgba, size, x, size - 1 - y));
            }
        }
        // RGB는 항상 0
        assert!(
            rgba.chunks(4)
                .all(|px| px[0] == 0 && px[1] == 0 && px[2] == 0)
        );
    }

    /// `MASK_PNG_DUMP=/tmp/mask.png`로 실행하면 생성된 PNG를 파일로 저장해 눈으로 확인할 수 있다.
    #[test]
    fn dump_png_when_requested() {
        if let Ok(path) = std::env::var("MASK_PNG_DUMP") {
            let (_, png) = rounded_mask_png(54, 3);
            std::fs::write(path, png).unwrap();
        }
    }
}
