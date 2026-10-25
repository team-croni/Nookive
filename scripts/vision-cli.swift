import Foundation
import Vision
import CoreImage

// 주요 Vision 분류 라벨 한국어 매핑 사전
let KOREAN_LABEL_MAP: [String: String] = [
    "chair": "의자",
    "swivel_chair": "회전의자",
    "armchair": "안락의자",
    "folding_chair": "접이식 의자",
    "rocking_chair": "흔들의자",
    "seat": "좌석 의자",
    "bench": "벤치 의자",
    "stool": "스툴 의자",
    "couch": "소파",
    "sofa": "소파",
    "furniture": "가구",
    "table": "탁자 테이블",
    "desk": "책상",
    "coffee_table": "티테이블",
    "dining_table": "식탁",
    "cabinet": "수납장 캐비닛",
    "shelf": "선반 책장",
    "bed": "침대",
    "pillow": "베개",
    "cushion": "쿠션",
    "computer": "컴퓨터",
    "laptop": "노트북",
    "computer_keyboard": "키보드",
    "computer_monitor": "모니터 화면",
    "computer_mouse": "마우스",
    "mouse": "마우스",
    "computer_tower": "본체 데스크탑",
    "television": "TV 텔레비전",
    "screen": "화면 디스플레이",
    "smartphone": "스마트폰 핸드폰",
    "cellular_telephone": "핸드폰 전화기",
    "tablet_computer": "태블릿 아이패드",
    "consumer_electronics": "전자제품",
    "screenshot": "스크린샷 캡처",
    "document": "문서 서류",
    "printed_page": "인쇄물 서류",
    "book": "책 도서",
    "receipt": "영수증",
    "business_card": "명함",
    "paper": "종이 문서",
    "car": "자동차 차",
    "automobile": "자동차 차량",
    "bicycle": "자전거",
    "cat": "고양이",
    "dog": "강아지 개",
    "food": "음식 요리",
    "dish": "요리 음식",
    "beverage": "음료 커피",
    "coffee": "커피",
    "cup": "컵 찻잔",
    "bottle": "병 물병",
    "person": "사람 인물",
    "face": "얼굴 인물",
    "indoor": "실내 방",
    "room": "방 공간",
    "building": "건물 외관",
    "plant": "식물 화분",
    "flower": "꽃",
    "clothing": "옷 의류",
    "shoe": "신발 구두 운동화"
]

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: vision-cli <image-path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

guard let ciImage = CIImage(contentsOf: url) else {
    // 이미지를 열 수 없으면 빈 JSON 출력
    print("{\"labels\":[],\"koreanTags\":[],\"ocr\":\"\"}")
    exit(0)
}

let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])

// 1. 사물 분류
var detectedLabels: [String] = []
var koreanTags: [String] = []

let classifyRequest = VNClassifyImageRequest()
do {
    try handler.perform([classifyRequest])
    if let observations = classifyRequest.results {
        let topObs = observations
            .sorted(by: { $0.confidence > $1.confidence })
            .prefix(15)
        
        for obs in topObs {
            if obs.confidence >= 0.05 {
                let id = obs.identifier
                detectedLabels.append(id)
                if let ko = KOREAN_LABEL_MAP[id] {
                    koreanTags.append(ko)
                }
            }
        }
    }
} catch {
    // ignore
}

// 2. OCR 텍스트 인식 (한글 / 영어)
var ocrText = ""
let textRequest = VNRecognizeTextRequest()
textRequest.recognitionLevel = .fast
textRequest.recognitionLanguages = ["ko-KR", "en-US"]
textRequest.usesLanguageCorrection = true

do {
    try handler.perform([textRequest])
    if let textObs = textRequest.results {
        let recognized = textObs.compactMap { $0.topCandidates(1).first?.string }.filter { !$0.isEmpty }
        ocrText = recognized.prefix(30).joined(separator: " ")
    }
} catch {
    // ignore
}

// 중복 태그 제거
let uniqueKorean = Array(NSOrderedSet(array: koreanTags)) as? [String] ?? koreanTags
let topLabels = Array(detectedLabels.prefix(10))
let uniqueLabels = Array(NSOrderedSet(array: topLabels)) as? [String] ?? topLabels

struct VisionResult: Codable {
    let labels: [String]
    let koreanTags: [String]
    let ocr: String
}

let result = VisionResult(labels: uniqueLabels, koreanTags: uniqueKorean, ocr: ocrText)
if let jsonData = try? JSONEncoder().encode(result), let jsonStr = String(data: jsonData, encoding: .utf8) {
    print(jsonStr)
} else {
    print("{\"labels\":[],\"koreanTags\":[],\"ocr\":\"\"}")
}
