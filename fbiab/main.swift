// A small iOS app that opens a page the way the Facebook / Instagram iOS in-app
// browser does: a WKWebView under an in-app top bar, with the app's user agent.
// Launch arguments: -url <url> -mode fb|ig
import UIKit
import WebKit
import Network

final class BrowserController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    var webView: WKWebView!
    let bar = UIView()
    let titleLabel = UILabel()
    var log: [[String: Any]] = []
    var server: LabServer?

    func arg(_ name: String) -> String? {
        let a = ProcessInfo.processInfo.arguments
        if let i = a.firstIndex(of: name), i + 1 < a.count { return a[i + 1] }
        return nil
    }

    func userAgent(mode: String) -> String {
        let v = UIDevice.current.systemVersion            // e.g. 26.5
        let us = v.replacingOccurrences(of: ".", with: "_")
        let base = "Mozilla/5.0 (iPhone; CPU iPhone OS \(us) like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G90"
        if mode == "ig" {
            return base + " Instagram 404.0.0.31.94 (iPhone17,2; iOS \(us); he_IL; he; scale=3.00; 1290x2796; 0; IABMV/1)"
        }
        return base + " Safari/604.1 [FBAN/FBIOS;FBAV/585.0.0.64.71;FBBV/0;FBDV/iPhone17,2;FBMD/iPhone;FBSN/iOS;FBSV/\(v);FBSS/3;FBLC/he_IL;FBOP/5;FBRV/0;IABMV/1]"
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        let mode = arg("-mode") ?? "fb"
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        let ucc = WKUserContentController()
        // Collect page errors from the very first byte (Safari's console is not readable here).
        let errScript = """
        (function(){window.__labErrors=[];function p(o){try{window.__labErrors.push(o);window.webkit.messageHandlers.lab.postMessage(JSON.stringify(o));}catch(e){}}
        window.addEventListener('error',function(e){p({type:'error',msg:String(e.message||''),src:String(e.filename||(e.target&&e.target.src)||''),line:e.lineno||0,col:e.colno||0,t:Math.round(performance.now())});},true);
        window.addEventListener('unhandledrejection',function(e){var r=e.reason;p({type:'rejection',msg:String(r&&(r.stack||r.message)||r),t:Math.round(performance.now())});});
        var ce=console.error;console.error=function(){try{p({type:'console.error',msg:Array.prototype.map.call(arguments,function(x){try{return typeof x==='string'?x:(x&&x.stack)||JSON.stringify(x)}catch(_){return String(x)}}).join(' ').slice(0,600),t:Math.round(performance.now())});}catch(_){}return ce.apply(console,arguments);};})();
        """
        ucc.addUserScript(WKUserScript(source: errScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        ucc.add(self, name: "lab")
        cfg.userContentController = ucc
        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.customUserAgent = userAgent(mode: mode)
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.accessibilityIdentifier = "labWebView"

        bar.backgroundColor = UIColor(white: 0.98, alpha: 1)
        bar.translatesAutoresizingMaskIntoConstraints = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        titleLabel.textAlignment = .center
        titleLabel.text = mode == "ig" ? "Instagram" : "Facebook"
        let close = UILabel(); close.text = "✕"; close.font = .systemFont(ofSize: 20); close.translatesAutoresizingMaskIntoConstraints = false
        let more = UILabel(); more.text = "•••"; more.font = .systemFont(ofSize: 16, weight: .bold); more.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView); view.addSubview(bar); bar.addSubview(titleLabel); bar.addSubview(close); bar.addSubview(more)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 48),
            titleLabel.centerXAnchor.constraint(equalTo: bar.centerXAnchor),
            titleLabel.bottomAnchor.constraint(equalTo: bar.bottomAnchor, constant: -13),
            close.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            close.centerYAnchor.constraint(equalTo: titleLabel.centerYAnchor),
            more.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            more.centerYAnchor.constraint(equalTo: titleLabel.centerYAnchor),
            webView.topAnchor.constraint(equalTo: bar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        if let s = arg("-url"), let u = URL(string: s) { webView.load(URLRequest(url: u)) }
        let port = UInt16(arg("-port") ?? "8765") ?? 8765
        server = try? LabServer(port: port, controller: self)
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        if let s = message.body as? String { NSLog("LABMSG %@", s) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { titleLabel.text = webView.url?.host ?? titleLabel.text }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { NSLog("LABMSG {\"type\":\"webcontent-crash\"}"); }
}


// Local remote control for the lab: POST http://127.0.0.1:<port>/eval with a JavaScript function body
// (may use await and return). The answer is the JSON of the returned value.
final class LabServer {
    let listener: NWListener
    weak var controller: BrowserController?
    init(port: UInt16, controller: BrowserController) throws {
        listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
        self.controller = controller
        listener.newConnectionHandler = { [weak self] conn in self?.handle(conn) }
        listener.start(queue: .main)
    }
    func handle(_ conn: NWConnection) {
        conn.start(queue: .main)
        var buffer = Data()
        func readMore() {
            conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { data, _, done, err in
                if let d = data { buffer.append(d) }
                if let req = String(data: buffer, encoding: .utf8), let range = req.range(of: "\r\n\r\n") {
                    let head = String(req[..<range.lowerBound])
                    var len = 0
                    for line in head.components(separatedBy: "\r\n") where line.lowercased().hasPrefix("content-length:") {
                        len = Int(line.split(separator: ":")[1].trimmingCharacters(in: .whitespaces)) ?? 0
                    }
                    let bodyStart = req.distance(from: req.startIndex, to: range.upperBound)
                    let bodyBytes = buffer.count - (req.prefix(bodyStart).utf8.count)
                    if bodyBytes >= len {
                        let body = String(data: buffer.suffix(from: req.prefix(bodyStart).utf8.count), encoding: .utf8) ?? ""
                        self.answer(conn, path: head.components(separatedBy: " ").dropFirst().first ?? "/", body: body)
                        return
                    }
                }
                if done || err != nil { conn.cancel(); return }
                readMore()
            }
        }
        readMore()
    }
    func reply(_ conn: NWConnection, _ json: String) {
        let data = json.data(using: .utf8) ?? Data()
        let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: \(data.count)\r\nConnection: close\r\n\r\n"
        conn.send(content: head.data(using: .utf8)! + data, completion: .contentProcessed { _ in conn.cancel() })
    }
    func answer(_ conn: NWConnection, path: String, body: String) {
        guard let wv = controller?.webView else { reply(conn, "{\"error\":\"no webview\"}"); return }
        if path.hasPrefix("/frame") {
            let f = wv.convert(wv.bounds, to: nil)
            reply(conn, "{\"x\":\(f.origin.x),\"y\":\(f.origin.y),\"w\":\(f.size.width),\"h\":\(f.size.height),\"insetTop\":\(wv.scrollView.adjustedContentInset.top),\"insetBottom\":\(wv.scrollView.adjustedContentInset.bottom)}")
            return
        }
        let wrapped = "const __v = await (async function(){ " + body + " })(); return JSON.stringify(__v === undefined ? null : __v);"
        wv.callAsyncJavaScript(wrapped, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let v): self.reply(conn, "{\"value\":" + ((v as? String) ?? "null") + "}")
            case .failure(let e):
                let msg = (e as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? e.localizedDescription
                let esc = msg.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: " ")
                self.reply(conn, "{\"error\":\"" + esc + "\"}")
            }
        }
    }
}

final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = BrowserController()
        window?.makeKeyAndVisible()
        return true
    }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
