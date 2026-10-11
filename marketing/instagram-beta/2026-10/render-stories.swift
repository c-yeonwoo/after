import AppKit
import CoreGraphics

guard CommandLine.arguments.count >= 2 else {
    fputs("Usage: swift render-stories.swift <output-directory>\n", stderr)
    exit(2)
}
let outDir = CommandLine.arguments[1]
let photoPath = outDir + "/story-afterwork-dusk.png"
let width = 1080
let height = 1920
let ink = NSColor(calibratedRed: 23/255, green: 32/255, blue: 51/255, alpha: 1)
let cream = NSColor(calibratedRed: 246/255, green: 241/255, blue: 233/255, alpha: 1)
let muted = NSColor(calibratedRed: 82/255, green: 90/255, blue: 104/255, alpha: 1)
let blush = NSColor(calibratedRed: 215/255, green: 183/255, blue: 178/255, alpha: 1)
let coral = NSColor(calibratedRed: 164/255, green: 45/255, blue: 34/255, alpha: 1)
let white = NSColor(calibratedRed: 1, green: 250/255, blue: 244/255, alpha: 1)

func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {
    if weight == .bold {
        return NSFont(name: "AppleSDGothicNeo-Bold", size: size) ?? NSFont.systemFont(ofSize: size, weight: .bold)
    }
    if weight == .semibold {
        return NSFont.systemFont(ofSize: size, weight: .semibold)
    }
    return NSFont(name: "AppleSDGothicNeo-Regular", size: size) ?? NSFont.systemFont(ofSize: size, weight: .regular)
}

func render(_ name: String, _ body: (NSGraphicsContext) throws -> Void) throws {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { fatalError("Could not allocate story canvas") }
    guard let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else { fatalError("Could not create graphics context") }
    let cg = graphics.cgContext
    cg.setFillColor(cream.cgColor)
    cg.fill(CGRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    try body(graphics)
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else { fatalError("PNG encoding failed") }
    try data.write(to: URL(fileURLWithPath: outDir + "/" + name))
}

func drawPhoto() throws {
    guard let image = NSImage(contentsOfFile: photoPath) else {
        throw NSError(domain: "AfterStoryRenderer", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Missing background image: \(photoPath)"])
    }
    let size = image.size
    let scale = max(CGFloat(width) / size.width, CGFloat(height) / size.height)
    let drawSize = NSSize(width: size.width * scale, height: size.height * scale)
    image.draw(in: NSRect(x: (CGFloat(width) - drawSize.width) / 2, y: (CGFloat(height) - drawSize.height) / 2,
        width: drawSize.width, height: drawSize.height), from: .zero, operation: .sourceOver, fraction: 1)
}

func text(_ value: String, x: CGFloat, y: CGFloat, size: CGFloat, color: NSColor,
          weight: NSFont.Weight = .regular, centered: Bool = false) {
    let p = NSMutableParagraphStyle()
    p.alignment = centered ? .center : .left
    let attrs: [NSAttributedString.Key: Any] = [.font: font(size, weight), .foregroundColor: color, .paragraphStyle: p]
    let attributed = NSAttributedString(string: value, attributes: attrs)
    let textHeight = size * 1.55
    attributed.draw(in: NSRect(x: x, y: CGFloat(height) - y - textHeight,
                              width: CGFloat(width) - x * 2, height: textHeight))
}

func rounded(_ rect: NSRect, radius: CGFloat, color: NSColor) {
    color.setFill()
    let converted = NSRect(x: rect.minX, y: CGFloat(height) - rect.minY - rect.height,
                           width: rect.width, height: rect.height)
    NSBezierPath(roundedRect: converted, xRadius: radius, yRadius: radius).fill()
}

func filledRect(_ rect: NSRect, color: NSColor) {
    color.setFill()
    let converted = NSRect(x: rect.minX, y: CGFloat(height) - rect.minY - rect.height,
                           width: rect.width, height: rect.height)
    NSBezierPath(rect: converted).fill()
}

try render("story-01-question.png") { _ in
    try drawPhoto()
    filledRect(NSRect(x: 0, y: 0, width: width, height: height), color: NSColor(calibratedWhite: 0.04, alpha: 0.16))
    text("AFTER  /  BETA", x: 84, y: 115, size: 31, color: white)
    text("소개팅에서", x: 84, y: 1180, size: 72, color: white, weight: .bold)
    text("더 지치는 건?", x: 84, y: 1270, size: 72, color: white, weight: .bold)
    text("어떤 과정이 더 피곤하게 느껴지세요", x: 84, y: 1372, size: 32, color: blush)
    rounded(NSRect(x: 84, y: 1500, width: 912, height: 116), radius: 32, color: white)
}

try render("story-02-one-at-a-time.png") { _ in
    blush.withAlphaComponent(0.4).setFill()
    NSBezierPath(ovalIn: NSRect(x: 665, y: CGFloat(height) - 80 - 490, width: 490, height: 490)).fill()
    text("AFTER  /  BETA", x: 84, y: 115, size: 31, color: coral)
    filledRect(NSRect(x: 84, y: 340, width: 110, height: 7), color: coral)
    text("많이 보기보다,", x: 84, y: 650, size: 72, color: ink, weight: .bold)
    text("한 사람씩.", x: 84, y: 748, size: 72, color: ink, weight: .bold)
    text("강남·역삼권 직장인을 위한", x: 84, y: 900, size: 35, color: muted)
    text("소개 서비스, 애프터", x: 84, y: 950, size: 35, color: muted)
    filledRect(NSRect(x: 84, y: 1440, width: 912, height: 2), color: NSColor(calibratedRed: 210/255, green: 201/255, blue: 189/255, alpha: 1))
    text("탐색에 쓰는 시간은 줄이고", x: 84, y: 1500, size: 31, color: ink)
    text("대화를 시작할 기회에 집중하도록.", x: 84, y: 1550, size: 31, color: ink)
    text("자세한 내용은 프로필 링크에서 →", x: 84, y: 1760, size: 29, color: coral, weight: .semibold)
}

try render("story-03-beta-link.png") { _ in
    try drawPhoto()
    filledRect(NSRect(x: 0, y: 0, width: width, height: height), color: NSColor(calibratedWhite: 0.04, alpha: 0.16))
    text("AFTER  /  BETA", x: 84, y: 115, size: 31, color: white)
    text("퇴근 후,", x: 84, y: 1220, size: 72, color: white, weight: .bold)
    text("가까운 곳에서.", x: 84, y: 1310, size: 72, color: white, weight: .bold)
    text("강남·역삼권 직장인 무료 베타", x: 84, y: 1410, size: 34, color: blush)
    rounded(NSRect(x: 84, y: 1510, width: 912, height: 116), radius: 32, color: white)
    text("프로필 링크에서 참여 방법 보기", x: 84, y: 1548, size: 32, color: ink, weight: .semibold, centered: true)
}
