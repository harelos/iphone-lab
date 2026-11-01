# iphone-lab

Opens a web page on iOS Simulator builds of Safari and of a Facebook / Instagram style
in-app browser (WKWebView), on GitHub's macOS runners, and taps through it with native
touches. Saves screenshots, load timings, layout checks and page errors as artifacts.

Run: Actions → ios-lab → Run workflow (url, browsers, matrix of runners/devices).
Ad and analytics beacons are blocked on the runner, so test visits never reach ad data.
