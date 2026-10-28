// scripts/eval/render-media.swift
// 검색 평가 코퍼스용 합성 PDF/이미지/비디오를 만든다. (macOS CoreGraphics/CoreText/AVFoundation)
//
// 사용법: swift scripts/eval/render-media.swift <jobs.json>
// jobs.json: [{ "type": "pdf" | "image" | "video", "output": "...", ... }]
import AVFoundation
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct TextSpec: Decodable {
  let text: String
  let x: Double
  let y: Double
  let size: Double
  let color: [Double]?
  let bold: Bool?
}

struct RectSpec: Decodable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
  let color: [Double]
}

struct ImageSpec: Decodable {
  let width: Int
  let height: Int
  let background: [Double]
  let gradientTo: [Double]?
  let rects: [RectSpec]?
  let texts: [TextSpec]?
}

struct FrameSpec: Decodable {
  let image: ImageSpec
  let seconds: Double
}

struct Job: Decodable {
  let type: String
  let output: String
  let pages: [String]?
  let image: ImageSpec?
  let frames: [FrameSpec]?
  let audio: String?
}

func color(_ rgb: [Double]?, fallback: [Double] = [0, 0, 0]) -> CGColor {
  let c = rgb ?? fallback
  return CGColor(red: c[0], green: c[1], blue: c[2], alpha: c.count > 3 ? c[3] : 1)
}

/// PDF에는 TrueType인 AppleGothic을 쓴다. AppleSDGothicNeo(CFF)는 ToUnicode 없이 임베드되어
/// pdf-parse가 텍스트를 추출하지 못한다.
func font(size: Double, bold: Bool, pdf: Bool) -> CTFont {
  let name = pdf ? "AppleGothic" : bold ? "AppleSDGothicNeo-Bold" : "AppleSDGothicNeo-Regular"
  return CTFontCreateWithName(name as CFString, size, nil)
}

/// 좌상단 원점 좌표계 기준으로 한 줄 텍스트를 그린다.
func drawText(_ spec: TextSpec, in context: CGContext, height: Double, pdf: Bool = false) {
  let attributes =
    [
      kCTFontAttributeName: font(size: spec.size, bold: spec.bold ?? false, pdf: pdf),
      kCTForegroundColorAttributeName: color(spec.color),
    ] as CFDictionary
  let line = CTLineCreateWithAttributedString(
    CFAttributedStringCreate(nil, spec.text as CFString, attributes)!)
  context.textPosition = CGPoint(x: spec.x, y: height - spec.y - spec.size)
  CTLineDraw(line, context)
}

func renderImage(_ spec: ImageSpec) -> CGImage {
  let width = spec.width
  let height = spec.height
  let context = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  let bounds = CGRect(x: 0, y: 0, width: width, height: height)
  if let gradientTo = spec.gradientTo {
    let gradient = CGGradient(
      colorsSpace: CGColorSpaceCreateDeviceRGB(),
      colors: [color(spec.background), color(gradientTo)] as CFArray, locations: [0, 1])!
    context.drawLinearGradient(
      gradient, start: CGPoint(x: 0, y: Double(height)), end: .zero, options: [])
  } else {
    context.setFillColor(color(spec.background))
    context.fill(bounds)
  }
  for rect in spec.rects ?? [] {
    context.setFillColor(color(rect.color))
    context.fill(
      CGRect(
        x: rect.x, y: Double(height) - rect.y - rect.height, width: rect.width,
        height: rect.height))
  }
  for text in spec.texts ?? [] {
    drawText(text, in: context, height: Double(height))
  }
  return context.makeImage()!
}

func writePNG(_ image: CGImage, to path: String) throws {
  guard
    let destination = CGImageDestinationCreateWithURL(
      URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)
  else { throw NSError(domain: "render", code: 1) }
  CGImageDestinationAddImage(destination, image, nil)
  if !CGImageDestinationFinalize(destination) { throw NSError(domain: "render", code: 1) }
}

/// A4 크기 PDF. 각 페이지 문자열은 줄 단위로 그린다.
func writePDF(pages: [String], to path: String) {
  var box = CGRect(x: 0, y: 0, width: 595, height: 842)
  let context = CGContext(URL(fileURLWithPath: path) as CFURL, mediaBox: &box, nil)!
  for page in pages {
    context.beginPDFPage(nil)
    var y = 60.0
    for line in page.components(separatedBy: "\n") {
      let isTitle = y == 60.0
      drawText(
        TextSpec(text: line, x: 50, y: y, size: isTitle ? 18 : 12, color: nil, bold: isTitle),
        in: context, height: 842, pdf: true)
      y += isTitle ? 32 : 20
    }
    context.endPDFPage()
  }
  context.closePDF()
}

func pixelBuffer(from image: CGImage) -> CVPixelBuffer {
  var buffer: CVPixelBuffer?
  CVPixelBufferCreate(
    nil, image.width, image.height, kCVPixelFormatType_32ARGB,
    [kCVPixelBufferCGImageCompatibilityKey: true, kCVPixelBufferCGBitmapContextCompatibilityKey: true]
      as CFDictionary, &buffer)
  let pixel = buffer!
  CVPixelBufferLockBaseAddress(pixel, [])
  let context = CGContext(
    data: CVPixelBufferGetBaseAddress(pixel), width: image.width, height: image.height,
    bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixel),
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  CVPixelBufferUnlockBaseAddress(pixel, [])
  return pixel
}

/// 프레임 이미지를 정해진 길이만큼 보여 주는 무음 영상을 만든다.
func writeSilentVideo(frames: [FrameSpec], to url: URL) throws {
  let first = frames[0].image
  let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
  let input = AVAssetWriterInput(
    mediaType: .video,
    outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: first.width,
      AVVideoHeightKey: first.height,
    ])
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input, sourcePixelBufferAttributes: nil)
  writer.add(input)
  writer.startWriting()
  writer.startSession(atSourceTime: .zero)
  var time = 0.0
  for frame in frames {
    let buffer = pixelBuffer(from: renderImage(frame.image))
    // 프레임 하나를 1초 간격으로 반복해 길이를 만든다.
    var shown = 0.0
    while shown < frame.seconds {
      while !input.isReadyForMoreMediaData { usleep(1000) }
      adaptor.append(buffer, withPresentationTime: CMTime(seconds: time + shown, preferredTimescale: 600))
      shown += 1
    }
    time += frame.seconds
  }
  input.markAsFinished()
  writer.endSession(atSourceTime: CMTime(seconds: time, preferredTimescale: 600))
  let done = DispatchSemaphore(value: 0)
  writer.finishWriting { done.signal() }
  done.wait()
  if writer.status != .completed { throw writer.error ?? NSError(domain: "render", code: 2) }
}

func writeVideo(frames: [FrameSpec], audio: String?, to path: String) async throws {
  let output = URL(fileURLWithPath: path)
  try? FileManager.default.removeItem(at: output)
  guard let audio else {
    try writeSilentVideo(frames: frames, to: output)
    return
  }
  let silent = output.deletingPathExtension().appendingPathExtension("silent.mp4")
  try? FileManager.default.removeItem(at: silent)
  try writeSilentVideo(frames: frames, to: silent)
  defer { try? FileManager.default.removeItem(at: silent) }

  let composition = AVMutableComposition()
  let videoAsset = AVURLAsset(url: silent)
  let audioAsset = AVURLAsset(url: URL(fileURLWithPath: audio))
  let videoTrack = try await videoAsset.loadTracks(withMediaType: .video)[0]
  let audioTrack = try await audioAsset.loadTracks(withMediaType: .audio)[0]
  let duration = try await videoAsset.load(.duration)
  let audioDuration = try await audioAsset.load(.duration)
  try composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
    .insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: videoTrack, at: .zero)
  try composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    .insertTimeRange(
      CMTimeRange(start: .zero, duration: CMTimeMinimum(duration, audioDuration)), of: audioTrack,
      at: .zero)
  let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)!
  export.outputURL = output
  export.outputFileType = .mp4
  await export.export()
  if export.status != .completed { throw export.error ?? NSError(domain: "render", code: 3) }
}

let arguments = CommandLine.arguments
guard arguments.count == 2 else {
  FileHandle.standardError.write("usage: render-media.swift <jobs.json>\n".data(using: .utf8)!)
  exit(2)
}
let jobs = try JSONDecoder().decode([Job].self, from: Data(contentsOf: URL(fileURLWithPath: arguments[1])))
for job in jobs {
  switch job.type {
  case "pdf":
    writePDF(pages: job.pages ?? [], to: job.output)
  case "image":
    try writePNG(renderImage(job.image!), to: job.output)
  case "video":
    try await writeVideo(frames: job.frames ?? [], audio: job.audio, to: job.output)
  default:
    FileHandle.standardError.write("unknown job type: \(job.type)\n".data(using: .utf8)!)
    exit(2)
  }
  print("rendered \(job.output)")
}
