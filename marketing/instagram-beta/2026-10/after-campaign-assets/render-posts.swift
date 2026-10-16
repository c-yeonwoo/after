import AppKit
import CoreGraphics

guard CommandLine.arguments.count >= 2 else {
    fputs("Usage: swift render-posts.swift <asset-directory>\n", stderr)
    exit(2)
}

let directory = CommandLine.arguments[1]
let width = 1080
let height = 1350
let ink = NSColor(calibratedRed: 37/255, green: 42/255, blue: 52/255, alpha: 1)
let cream = NSColor(calibratedRed: 247/255, green: 245/255, blue: 240/255, alpha: 1)
let apricot = NSColor(calibratedRed: 213/255, green: 138/255, blue: 100/255, alpha: 1)
let white = NSColor(calibratedRed: 1, green: 250/255, blue: 244/255, alpha: 1)
let muted = NSColor(calibratedRed: 101/255, green: 106/255, blue: 112/255, alpha: 1)

func font(_ size: CGFloat, bold: Bool = false) -> NSFont {
    let name = bold ? "AppleSDGothicNeo-Bold" : "AppleSDGothicNeo-Regular"
    return NSFont(name: name, size: size) ?? NSFont.systemFont(ofSize: size, weight: bold ? .bold : .regular)
}

func render(_ filename: String, _ draw: () throws -> Void) throws {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
        let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Could not create Instagram post canvas")
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    graphics.cgContext.setFillColor(cream.cgColor)
    graphics.cgContext.fill(CGRect(x: 0, y: 0, width: width, height: height))
    try draw()
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else { fatalError("PNG encoding failed") }
    try data.write(to: URL(fileURLWithPath: directory + "/" + filename))
}

func drawPhoto(_ filename: String) throws {
    guard let image = NSImage(contentsOfFile: directory + "/" + filename) else {
        throw NSError(domain: "AfterPostRenderer", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Missing background image: \(filename)"])
    }
    let scale = max(CGFloat(width) / image.size.width, CGFloat(height) / image.size.height)
    let drawWidth = image.size.width * scale
    let drawHeight = image.size.height * scale
    image.draw(in: NSRect(x: (CGFloat(width) - drawWidth) / 2, y: (CGFloat(height) - drawHeight) / 2,
        width: drawWidth, height: drawHeight), from: .zero, operation: .sourceOver, fraction: 1)
}

func rect(_ x: CGFloat, _ top: CGFloat, _ w: CGFloat, _ h: CGFloat, color: NSColor) {
    color.setFill()
    NSBezierPath(rect: NSRect(x: x, y: CGFloat(height) - top - h, width: w, height: h)).fill()
}

func roundRect(_ x: CGFloat, _ top: CGFloat, _ w: CGFloat, _ h: CGFloat, radius: CGFloat, color: NSColor) {
    color.setFill()
    NSBezierPath(roundedRect: NSRect(x: x, y: CGFloat(height) - top - h, width: w, height: h),
                 xRadius: radius, yRadius: radius).fill()
}

func circle(_ x: CGFloat, _ top: CGFloat, _ diameter: CGFloat, color: NSColor) {
    color.setFill()
    NSBezierPath(ovalIn: NSRect(x: x, y: CGFloat(height) - top - diameter,
                               width: diameter, height: diameter)).fill()
}

func text(_ value: String, x: CGFloat, top: CGFloat, width textWidth: CGFloat,
          size: CGFloat, color: NSColor, bold: Bool = false, lineHeight: CGFloat? = nil) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = lineHeight ?? size * 0.16
    paragraph.lineBreakMode = .byWordWrapping
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font(size, bold: bold), .foregroundColor: color, .paragraphStyle: paragraph,
        .kern: -0.8,
    ]
    let value = NSAttributedString(string: value, attributes: attrs)
    value.draw(in: NSRect(x: x, y: CGFloat(height) - top - size * 1.65 * CGFloat(value.string.components(separatedBy: "\n").count),
                          width: textWidth, height: size * 1.65 * CGFloat(value.string.components(separatedBy: "\n").count)))
}

func header(color: NSColor) {
    text("애프터", x: 74, top: 62, width: 150, size: 32, color: color, bold: true)
    circle(182, 69, 9, color: apricot)
}

func footer(_ label: String = "퇴근 후, 한 사람과의 약속.", color: NSColor = white) {
    rect(76, 1220, 928, 1.5, color: color.withAlphaComponent(0.6))
    text(label, x: 78, top: 1244, width: 930, size: 25, color: color)
}

try render("post-01-intro-fatigue.png") {
    try drawPhoto("bg-v2-01-generic-cafe.png")
    rect(0, 0, CGFloat(width), CGFloat(height), color: NSColor(calibratedWhite: 0.035, alpha: 0.25))
    header(color: white)
    text("연애는 하고 싶은데,\n소개팅까지 또 하나의\n일이 되진 않았으면.", x: 74, top: 400, width: 930, size: 76, color: white, bold: true, lineHeight: 12)
    text("탐색보다, 한 사람을 알아가는 소개.", x: 78, top: 760, width: 920, size: 31, color: white)
    footer()
}

try render("post-02-familiar-neighborhood.png") {
    try drawPhoto("bg-v2-02-neighborhood.png")
    rect(0, 0, CGFloat(width), CGFloat(height), color: NSColor(calibratedWhite: 0.025, alpha: 0.22))
    header(color: white)
    text("새로운 사람을,\n익숙한 동네에서.", x: 76, top: 390, width: 930, size: 84, color: white, bold: true, lineHeight: 14)
    text("늘 지나던 퇴근길에, 새로운 인연.", x: 80, top: 625, width: 910, size: 30, color: white)
    text("강남·역삼권 직장인을 위한 소개", x: 80, top: 1136, width: 920, size: 27, color: white)
    footer("퇴근 후, 한 사람과의 약속.", color: white)
}

try render("post-03-coffee-first.png") {
    try drawPhoto("bg-07-coffee.png")
    header(color: ink)
    roundRect(58, 170, 964, 372, radius: 26, color: cream.withAlphaComponent(0.91))
    text("퇴근 후,\n커피 한 잔부터.", x: 100, top: 225, width: 875, size: 84, color: ink, bold: true, lineHeight: 14)
    text("처음부터 거창할 필요는 없으니까요.", x: 102, top: 438, width: 870, size: 29, color: muted)
    footer("애프터 · 강남·역삼권 직장인 소개", color: white)
}

try render("post-04-workday-understanding.png") {
    try drawPhoto("bg-v2-03-end-of-work.png")
    rect(0, 0, CGFloat(width), 900, color: NSColor(calibratedWhite: 0.03, alpha: 0.31))
    header(color: white)
    text("서로의 바쁜\n평일을 이해하는 사람.", x: 76, top: 385, width: 930, size: 77, color: white, bold: true, lineHeight: 14)
    text("바쁜 하루가 끝난 뒤,\n서로의 이야기를 나눌 수 있도록.", x: 80, top: 625, width: 900, size: 30, color: white, lineHeight: 8)
    footer()
}

try render("post-05-date-planning.png") {
    try drawPhoto("bg-04-plan.png")
    rect(0, 0, CGFloat(width), 670, color: NSColor(calibratedWhite: 0.025, alpha: 0.43))
    header(color: white)
    text("“언제 한번 봐요”\n다음은요?", x: 78, top: 350, width: 920, size: 83, color: white, bold: true, lineHeight: 16)
    text("마음이 맞으면, 만날 시간을 정해요.", x: 82, top: 585, width: 910, size: 30, color: white)
    footer("소개 다음의 약속 조율까지, 애프터.", color: white)
}

try render("post-06-know-the-person.png") {
    try drawPhoto("bg-05-introduction.png")
    header(color: ink)
    circle(822, 234, 142, color: apricot.withAlphaComponent(0.18))
    text("어디 다니는지 다음으로,\n어떤 사람인지.", x: 76, top: 280, width: 920, size: 78, color: ink, bold: true, lineHeight: 13)
    text("사진과 짧은 답변이\n첫 대화의 실마리가 돼요.", x: 80, top: 528, width: 900, size: 34, color: ink, bold: true, lineHeight: 8)
    footer("회사 이메일은 상대에게 공개되지 않아요.", color: white)
}

try render("post-07-one-at-a-time.png") {
    try drawPhoto("bg-v2-04-meeting.png")
    roundRect(54, 164, 972, 450, radius: 22, color: cream.withAlphaComponent(0.92))
    header(color: ink)
    text("연애도\n내 속도에 맞게.", x: 94, top: 235, width: 890, size: 86, color: ink, bold: true, lineHeight: 14)
    text("한 번에 한 사람씩, 순서대로 소개해요.", x: 98, top: 454, width: 875, size: 29, color: muted)
    footer("많이 보기보다, 한 사람을 알아가는 시간.", color: white)
}

try render("post-08-beta-invitation.png") {
    ink.setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
    circle(580, 160, 610, color: apricot.withAlphaComponent(0.17))
    circle(724, 310, 360, color: apricot.withAlphaComponent(0.15))
    header(color: white)
    text("애프터의\n첫 베타에\n초대합니다.", x: 76, top: 350, width: 920, size: 88, color: white, bold: true, lineHeight: 12)
    text("강남·역삼권 직장인 소개", x: 82, top: 720, width: 910, size: 31, color: cream)
    text("지금은 결제 없이 참여할 수 있어요.", x: 82, top: 785, width: 910, size: 29, color: cream)
    roundRect(76, 1080, 510, 64, radius: 32, color: cream)
    text("프로필 링크에서 참여 방법 보기", x: 103, top: 1097, width: 470, size: 25, color: ink, bold: true)
    footer("소개는 참여 상황과 서로의 선택에 따라 진행돼요.", color: white)
}

try render("post-09-brand-note.png") {
    cream.setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
    circle(685, 150, 470, color: apricot.withAlphaComponent(0.12))
    circle(782, 265, 250, color: apricot.withAlphaComponent(0.12))
    header(color: ink)
    text("별일 없는 하루도\n들려주고 싶은\n사람을 만나길.", x: 76, top: 354, width: 930, size: 79, color: ink, bold: true, lineHeight: 13)
    rect(80, 720, 114, 5, color: apricot)
    text("평범한 날이 함께라서 좋아지는\n그런 만남을 바라며.", x: 80, top: 770, width: 900, size: 31, color: muted, lineHeight: 9)
    footer("애프터 · 퇴근 후, 한 사람과의 약속.", color: ink)
}

print("Rendered 9 After campaign posts (1080×1350 PNG).")
