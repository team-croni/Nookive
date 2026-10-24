// scripts/media-cli.swift
// 비디오에서 일정 간격으로 프레임을 추출해 JPEG로 저장하고, [{ time, path }] JSON을 출력한다.
// (DigUp 방식: 프레임을 이미지 임베딩해 영상 "내용" 검색에 사용)

import Foundation
import AVFoundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: media-cli <video> <outdir> [intervalSec]\n".data(using: .utf8)!)
    exit(2)
}

let videoPath = args[1]
let outDirPath = args[2]
let interval = args.count >= 4 ? (Double(args[3]) ?? 4.0) : 4.0

let fm = FileManager.default
try? fm.createDirectory(atPath: outDirPath, withIntermediateDirectories: true)

let asset = AVURLAsset(url: URL(fileURLWithPath: videoPath))

var durationSec: Double = CMTimeGetSeconds(asset.duration)
if !durationSec.isFinite || durationSec <= 0 { durationSec = 0 }

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
gen.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)
gen.maximumSize = CGSize(width: 1024, height: 1024)

var results: [[String: Any]] = []
var idx = 0
var t = 0.0
while t < durationSec {
    let time = CMTime(seconds: t, preferredTimescale: 600)
    if let cg = try? gen.copyCGImage(at: time, actualTime: nil) {
        let filename = String(format: "frame_%05d.jpg", idx)
        let url = URL(fileURLWithPath: outDirPath).appendingPathComponent(filename)
        if let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) {
            CGImageDestinationAddImage(dest, cg, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
            if CGImageDestinationFinalize(dest) {
                results.append(["time": t, "path": url.path])
                idx += 1
            }
        }
    }
    t += interval
}

if let data = try? JSONSerialization.data(withJSONObject: results),
   let s = String(data: data, encoding: .utf8) {
    print(s)
} else {
    print("[]")
}
