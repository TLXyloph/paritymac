// Renders the app iconset: a large "P" set in Geist Pixel on a dark plate.
// Drawn per size rather than downscaled from one large image, so the mark stays
// crisp at 16pt in the Finder sidebar.
//
//   swift make-icon.swift <out.iconset> <GeistPixel.ttf> [inkHex] [plateHex]

import Cocoa
import CoreText

func arg(_ i: Int, _ fallback: String) -> String {
    CommandLine.arguments.count > i ? CommandLine.arguments[i] : fallback
}

func hex(_ h: String) -> NSColor {
    var v: UInt64 = 0
    Scanner(string: h.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
    return NSColor(srgbRed: CGFloat((v >> 16) & 0xFF) / 255.0,
                   green:   CGFloat((v >> 8) & 0xFF) / 255.0,
                   blue:    CGFloat(v & 0xFF) / 255.0, alpha: 1)
}

let outDir   = arg(1, "AppIcon.iconset")
let fontPath = arg(2, "src/fonts/GeistPixel.ttf")
let inkColor = hex(arg(3, "EDEDED"))
let plateColor = hex(arg(4, "141414"))

// Register the bundled face with CoreText so it works without being installed.
var regError: Unmanaged<CFError>?
let registered = CTFontManagerRegisterFontsForURL(
    URL(fileURLWithPath: fontPath) as CFURL, .process, &regError)

func mark(_ size: CGFloat) -> NSFont {
    if registered, let f = NSFont(name: "GeistPixel-Regular", size: size) ?? NSFont(name: "Geist Pixel", size: size) {
        return f
    }
    FileHandle.standardError.write(
        Data("make-icon: Geist Pixel unavailable, falling back\n".utf8))
    return NSFont.systemFont(ofSize: size, weight: .bold)
}

let ink = inkColor

/// Inked bounds of the glyph at a given point size, relative to the text origin.
/// The colour must live on the string: CTLineDraw ignores the context's fill
/// colour unless the run carries one, and would otherwise paint black on black.
func inked(_ size: CGFloat) -> (line: CTLine, bounds: CGRect) {
    let attr = NSAttributedString(string: "P", attributes: [
        .font: mark(size),
        .foregroundColor: ink
    ])
    let line = CTLineCreateWithAttributedString(attr)
    return (line, CTLineGetBoundsWithOptions(line, .useGlyphPathBounds))
}

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func render(_ pixels: Int) -> Data {
    let s = CGFloat(pixels)

    // Exact pixel buffer: NSImage.lockFocus would pick up the display scale
    // and silently hand back a 2x image.
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let gc = NSGraphicsContext.current!
    gc.imageInterpolation = .high
    gc.shouldAntialias = true
    let ctx = gc.cgContext

    let inset = s * 0.085
    let plate = NSRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let path = NSBezierPath(roundedRect: plate,
                            xRadius: plate.width * 0.2237, yRadius: plate.width * 0.2237)

    // Not pure #0A0A0A: the icon needs an edge against a dark Dock.
    plateColor.setFill()
    path.fill()
    ink.withAlphaComponent(0.22).setStroke()
    path.lineWidth = max(1, s * 0.005)
    path.stroke()

    // Size the face so the inked P is a fixed fraction of the plate, measured
    // rather than guessed: a pixel face's line box is mostly empty space.
    let target = plate.height * 0.56
    let probe = inked(100)
    let size = probe.bounds.height > 0 ? 100 * (target / probe.bounds.height) : target
    let (line, b) = inked(size)

    // Centre the ink itself, not the advance width or the ascender/descender box.
    ctx.textPosition = CGPoint(x: plate.midX - (b.minX + b.width / 2),
                               y: plate.midY - (b.minY + b.height / 2))
    CTLineDraw(line, ctx)

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

// name -> pixel size, per the .iconset convention
let variants: [(String, Int)] = [
    ("icon_16x16", 16),     ("icon_16x16@2x", 32),
    ("icon_32x32", 32),     ("icon_32x32@2x", 64),
    ("icon_128x128", 128),  ("icon_128x128@2x", 256),
    ("icon_256x256", 256),  ("icon_256x256@2x", 512),
    ("icon_512x512", 512),  ("icon_512x512@2x", 1024)
]

for (name, px) in variants {
    try! render(px).write(to: URL(fileURLWithPath: "\(outDir)/\(name).png"))
}
print("rendered \(variants.count) sizes (Geist Pixel registered: \(registered))")
