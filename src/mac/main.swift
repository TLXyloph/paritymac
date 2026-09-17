// Native macOS shell for the put-call parity drill.
// Hosts the bundled web assets in a WKWebView. No network, no local server.

import Cocoa
import WebKit

// MARK: - Serving bundled resources

/// Serves the bundled web assets over a custom scheme.
///
/// A custom scheme rather than file:// matters: WKWebView treats file origins as
/// opaque and will not persist localStorage, which would silently discard the
/// player's settings on every launch.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    private static let mimeTypes: [String: String] = [
        "html": "text/html; charset=utf-8",
        "css":  "text/css; charset=utf-8",
        "js":   "text/javascript; charset=utf-8",
        "woff2": "font/woff2",
        "json": "application/json"
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }

        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        if path.hasPrefix("/") { path.removeFirst() }

        let target = root.appendingPathComponent(path).standardizedFileURL

        // Refuse anything that resolves outside the resource root.
        let inRoot = target.path == root.path || target.path.hasPrefix(root.path + "/")
        guard inRoot, let data = try? Data(contentsOf: target) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let mime = Self.mimeTypes[target.pathExtension.lowercased()] ?? "application/octet-stream"
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": mime, "Content-Length": String(data.count)]
        )!

        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - Application

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {

    private var window: NSWindow!
    private var webView: WKWebView!

    private let background = NSColor(srgbRed: 0x0A / 255.0, green: 0x0A / 255.0,
                                     blue: 0x0A / 255.0, alpha: 1)

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let resources = Bundle.main.resourceURL!.appendingPathComponent("web")

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(root: resources), forURLScheme: "pcp")
        config.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.underPageBackgroundColor = background
        webView.allowsBackForwardNavigationGestures = false
        webView.wantsLayer = true
        webView.layer?.backgroundColor = background.cgColor

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 940, height: 660),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = Self.appName
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = background
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 640, height: 480)
        window.isReleasedWhenClosed = false
        window.contentView = webView

        // Restore the last position; only centre on a genuinely first run.
        // setFrameAutosaveName reports whether the NAME was set, not whether a
        // frame was restored, so ask UserDefaults for the saved frame directly.
        let autosave = "MainWindow"
        let hasSavedFrame = UserDefaults.standard
            .string(forKey: "NSWindow Frame \(autosave)") != nil
        window.setFrameAutosaveName(autosave)
        if !hasSavedFrame { window.center() }

        webView.load(URLRequest(url: URL(string: "pcp://app/index.html")!))

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    /// The drill is keyboard-driven, so hand the page first responder immediately
    /// rather than making the player click once to wake it up.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        window.makeFirstResponder(webView)
    }

    // MARK: Menu

    /// Display name of whichever variant this binary was bundled into.
    static var appName: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
            ?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String)
            ?? "Parity"
    }

    private func buildMenu() {
        let name = Self.appName
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About \(name)",
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
                        keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide \(name)",
                        action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others",
                                         action: #selector(NSApplication.hideOtherApplications(_:)),
                                         keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit \(name)",
                        action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        // Selector(...) by name: Swift cannot disambiguate #selector(NSText.copy(_:))
        // from NSObject.copy().
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        for (title, sel, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"),
                                  ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: NSSelectorFromString(sel), keyEquivalent: key)
        }
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize",
                           action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom",
                           action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Close",
                           action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        mainMenu.addItem(windowItem)

        NSApp.mainMenu = mainMenu
        NSApp.windowsMenu = windowMenu
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
