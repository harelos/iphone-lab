// A small iOS app that opens a page the way the Facebook / Instagram iOS in-app
// browser does: a WKWebView under an in-app top bar, with the app's user agent.
// Launch arguments: -url <url> -mode fb|ig
import UIKit
import WebKit

final class BrowserController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    var webView: WKWebView!
    let bar = UIView()
    let titleLabel = UILabel()
    var log: [[String: Any]] = []

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
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        if let s = message.body as? String { NSLog("LABMSG %@", s) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { titleLabel.text = webView.url?.host ?? titleLabel.text }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { NSLog("LABMSG {\"type\":\"webcontent-crash\"}"); }
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
