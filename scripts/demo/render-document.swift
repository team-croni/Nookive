// scripts/demo/render-document.swift
// README 시연 영상용 PDF를 실제 보고서·계약서처럼 그린다. (CoreGraphics/CoreText, A4)
// 텍스트는 검색과 하이라이트가 되도록 Helvetica Neue(텍스트 추출 가능)로 그린다.
//
// 사용법: swift scripts/demo/render-document.swift <documents.json>
// documents.json: [{ "output": "...", "header": "...", "accent": [r,g,b], "pages": [{ "blocks": [...] }] }]
// 블록 종류: title, subtitle, eyebrow, heading, paragraph, bullets, facts, kpis, table, bars, callout, spacer
import CoreText
import Foundation

struct KPI: Decodable { let label: String; let value: String; let delta: String? }
struct Bar: Decodable { let label: String; let value: Double; let display: String }

struct Block: Decodable {
  let kind: String
  let text: String?
  let items: [String]?
  let kpis: [KPI]?
  let columns: [String]?
  let rows: [[String]]?
  let bars: [Bar]?
  let height: Double?
}

struct Page: Decodable { let blocks: [Block] }

struct Document: Decodable {
  let output: String
  let header: String
  let accent: [Double]
  let pages: [Page]
}

let pageWidth = 595.0
let pageHeight = 842.0
let margin = 56.0
let contentWidth = pageWidth - margin * 2

func rgb(_ c: [Double], _ alpha: Double = 1) -> CGColor {
  CGColor(red: c[0], green: c[1], blue: c[2], alpha: alpha)
}

let ink = [0.11, 0.12, 0.15]
let muted = [0.42, 0.45, 0.5]
let hairline = [0.86, 0.87, 0.9]
let panel = [0.96, 0.97, 0.98]

func font(_ size: Double, _ weight: String = "") -> CTFont {
  CTFontCreateWithName((weight.isEmpty ? "HelveticaNeue" : "HelveticaNeue-\(weight)") as CFString, size, nil)
}

func attributed(_ text: String, _ font: CTFont, _ color: [Double], lineHeight: Double? = nil) -> CFAttributedString {
  let string = CFAttributedStringCreateMutable(nil, 0)!
  CFAttributedStringReplaceString(string, CFRange(location: 0, length: 0), text as CFString)
  let range = CFRange(location: 0, length: CFAttributedStringGetLength(string))
  CFAttributedStringSetAttribute(string, range, kCTFontAttributeName, font)
  CFAttributedStringSetAttribute(string, range, kCTForegroundColorAttributeName, rgb(color))
  if let lineHeight {
    var height = CGFloat(lineHeight)
    let settings = [
      CTParagraphStyleSetting(spec: .minimumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: &height),
      CTParagraphStyleSetting(spec: .maximumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: &height),
    ]
    CFAttributedStringSetAttribute(string, range, kCTParagraphStyleAttributeName, CTParagraphStyleCreate(settings, settings.count))
  }
  return string
}

/// 위에서부터 내려오며 그리는 간단한 레이아웃 커서. y는 페이지 위쪽에서 잰 거리다.
final class Canvas {
  let context: CGContext
  var y = 0.0
  init(_ context: CGContext) { self.context = context }

  func fill(_ rect: CGRect, _ color: [Double], alpha: Double = 1) {
    context.setFillColor(rgb(color, alpha))
    context.fill(CGRect(x: rect.minX, y: pageHeight - rect.maxY, width: rect.width, height: rect.height))
  }

  /// 한 줄 텍스트. 반환값은 너비.
  @discardableResult
  func line(_ text: String, x: Double, top: Double, font: CTFont, color: [Double], alignRight: Bool = false, width: Double = 0) -> Double {
    let ctLine = CTLineCreateWithAttributedString(attributed(text, font, color))
    let lineWidth = CTLineGetTypographicBounds(ctLine, nil, nil, nil)
    let ascent = CTFontGetAscent(font)
    context.textPosition = CGPoint(x: alignRight ? x + width - lineWidth : x, y: pageHeight - top - ascent)
    CTLineDraw(ctLine, context)
    return lineWidth
  }

  /// 줄바꿈 문단. 반환값은 높이.
  @discardableResult
  func paragraph(_ text: String, x: Double, top: Double, width: Double, font: CTFont, color: [Double], lineHeight: Double) -> Double {
    let string = attributed(text, font, color, lineHeight: lineHeight)
    let framesetter = CTFramesetterCreateWithAttributedString(string)
    let size = CTFramesetterSuggestFrameSizeWithConstraints(
      framesetter, CFRange(location: 0, length: 0), nil, CGSize(width: width, height: 10_000), nil)
    let height = ceil(size.height)
    let path = CGPath(rect: CGRect(x: x, y: pageHeight - top - height, width: width, height: height), transform: nil)
    CTFrameDraw(CTFramesetterCreateFrame(framesetter, CFRange(location: 0, length: 0), path, nil), context)
    return height
  }
}

func draw(_ block: Block, on canvas: Canvas, accent: [Double]) {
  switch block.kind {
  case "eyebrow":
    canvas.line((block.text ?? "").uppercased(), x: margin, top: canvas.y, font: font(9, "Bold"), color: accent)
    canvas.y += 20
  case "title":
    canvas.y += canvas.paragraph(block.text ?? "", x: margin, top: canvas.y, width: contentWidth, font: font(30, "Bold"), color: ink, lineHeight: 36) + 10
  case "subtitle":
    canvas.y += canvas.paragraph(block.text ?? "", x: margin, top: canvas.y, width: contentWidth, font: font(13), color: muted, lineHeight: 19) + 22
  case "heading":
    canvas.fill(CGRect(x: margin, y: canvas.y + 3, width: 4, height: 16), accent)
    canvas.line(block.text ?? "", x: margin + 14, top: canvas.y, font: font(17, "Bold"), color: ink)
    canvas.y += 34
  case "paragraph":
    canvas.y += canvas.paragraph(block.text ?? "", x: margin, top: canvas.y, width: contentWidth, font: font(10.5), color: ink, lineHeight: 16) + 12
  case "bullets":
    for item in block.items ?? [] {
      canvas.fill(CGRect(x: margin + 2, y: canvas.y + 6, width: 4, height: 4), accent)
      canvas.y += canvas.paragraph(item, x: margin + 16, top: canvas.y, width: contentWidth - 16, font: font(10.5), color: ink, lineHeight: 16) + 6
    }
    canvas.y += 8
  case "facts":
    // "항목|값" 형식의 두 칸 목록
    for item in block.items ?? [] {
      let parts = item.components(separatedBy: "|")
      canvas.line(parts[0], x: margin, top: canvas.y, font: font(10, "Medium"), color: muted)
      canvas.line(parts.count > 1 ? parts[1] : "", x: margin + 130, top: canvas.y, font: font(10.5), color: ink)
      canvas.y += 20
      canvas.fill(CGRect(x: margin, y: canvas.y - 6, width: contentWidth, height: 0.6), hairline)
    }
    canvas.y += 16
  case "callout":
    let text = block.text ?? ""
    let probe = CTFramesetterSuggestFrameSizeWithConstraints(
      CTFramesetterCreateWithAttributedString(attributed(text, font(12, "Medium"), ink, lineHeight: 18)),
      CFRange(location: 0, length: 0), nil, CGSize(width: contentWidth - 40, height: 10_000), nil)
    let height = ceil(probe.height) + 28
    canvas.fill(CGRect(x: margin, y: canvas.y, width: contentWidth, height: height), accent, alpha: 0.08)
    canvas.fill(CGRect(x: margin, y: canvas.y, width: 3, height: height), accent)
    canvas.paragraph(text, x: margin + 20, top: canvas.y + 14, width: contentWidth - 40, font: font(12, "Medium"), color: ink, lineHeight: 18)
    canvas.y += height + 18
  case "kpis":
    let kpis = block.kpis ?? []
    let gap = 10.0
    let width = (contentWidth - gap * Double(kpis.count - 1)) / Double(kpis.count)
    for (index, kpi) in kpis.enumerated() {
      let x = margin + Double(index) * (width + gap)
      canvas.fill(CGRect(x: x, y: canvas.y, width: width, height: 74), panel)
      canvas.line(kpi.label, x: x + 12, top: canvas.y + 12, font: font(8.5, "Medium"), color: muted)
      canvas.line(kpi.value, x: x + 12, top: canvas.y + 28, font: font(19, "Bold"), color: ink)
      if let delta = kpi.delta {
        canvas.line(delta, x: x + 12, top: canvas.y + 54, font: font(8.5, "Bold"), color: accent)
      }
    }
    canvas.y += 74 + 22
  case "table":
    let columns = block.columns ?? []
    let first = contentWidth * 0.4
    let other = (contentWidth - first) / Double(max(columns.count - 1, 1))
    let x = { (index: Int) in index == 0 ? margin : margin + first + Double(index - 1) * other }
    let width = { (index: Int) in index == 0 ? first : other }
    for (index, column) in columns.enumerated() {
      canvas.line(column, x: x(index) + (index == 0 ? 0 : -6), top: canvas.y, font: font(8.5, "Bold"), color: muted,
                  alignRight: index != 0, width: width(index))
    }
    canvas.y += 18
    canvas.fill(CGRect(x: margin, y: canvas.y, width: contentWidth, height: 1), ink, alpha: 0.6)
    canvas.y += 8
    for row in block.rows ?? [] {
      for (index, cell) in row.enumerated() {
        canvas.line(cell, x: x(index) + (index == 0 ? 0 : -6), top: canvas.y, font: font(10, index == 0 ? "" : "Medium"),
                    color: ink, alignRight: index != 0, width: width(index))
      }
      canvas.y += 20
      canvas.fill(CGRect(x: margin, y: canvas.y - 6, width: contentWidth, height: 0.6), hairline)
    }
    canvas.y += 16
  case "bars":
    let bars = block.bars ?? []
    let maxValue = bars.map(\.value).max() ?? 1
    let labelWidth = 120.0
    let trackWidth = contentWidth - labelWidth - 70
    for bar in bars {
      canvas.line(bar.label, x: margin, top: canvas.y + 2, font: font(10), color: ink)
      canvas.fill(CGRect(x: margin + labelWidth, y: canvas.y, width: trackWidth, height: 16), panel)
      canvas.fill(CGRect(x: margin + labelWidth, y: canvas.y, width: trackWidth * bar.value / maxValue, height: 16), accent)
      canvas.line(bar.display, x: margin + labelWidth + trackWidth + 10, top: canvas.y + 2, font: font(10, "Bold"), color: ink)
      canvas.y += 26
    }
    canvas.y += 12
  case "spacer":
    canvas.y += block.height ?? 12
  default:
    FileHandle.standardError.write("unknown block: \(block.kind)\n".data(using: .utf8)!)
  }
}

func render(_ document: Document) {
  var box = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
  let context = CGContext(URL(fileURLWithPath: document.output) as CFURL, mediaBox: &box, nil)!
  for (index, page) in document.pages.enumerated() {
    context.beginPDFPage(nil)
    let canvas = Canvas(context)
    canvas.fill(CGRect(x: 0, y: 0, width: pageWidth, height: 6), document.accent)
    canvas.line(document.header, x: margin, top: 30, font: font(8.5, "Medium"), color: muted)
    canvas.fill(CGRect(x: margin, y: 50, width: contentWidth, height: 0.6), hairline)
    canvas.y = 78
    for block in page.blocks { draw(block, on: canvas, accent: document.accent) }
    canvas.fill(CGRect(x: margin, y: pageHeight - 46, width: contentWidth, height: 0.6), hairline)
    canvas.line("Confidential — for illustration only", x: margin, top: pageHeight - 36, font: font(8), color: muted)
    canvas.line("Page \(index + 1) of \(document.pages.count)", x: margin, top: pageHeight - 36, font: font(8), color: muted,
                alignRight: true, width: contentWidth)
    context.endPDFPage()
  }
  context.closePDF()
}

let arguments = CommandLine.arguments
guard arguments.count == 2 else {
  FileHandle.standardError.write("usage: render-document.swift <documents.json>\n".data(using: .utf8)!)
  exit(2)
}
let documents = try JSONDecoder().decode([Document].self, from: Data(contentsOf: URL(fileURLWithPath: arguments[1])))
for document in documents {
  render(document)
  print("rendered \(document.output)")
}
