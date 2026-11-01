// iPhone lab: opens a page on real iOS Simulator builds of Safari and of a
// Facebook / Instagram style in-app browser, taps through the buy flow with
// native touches, and saves screenshots, timings, layout checks and errors.
//
// node lab/run.mjs --url <url> --runtime "iOS 26.5" --devices "iPhone 17;iPhone 17 Pro Max" \
//   --browsers safari,fb,ig --out out
import { remote } from 'webdriverio';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const URL0 = args.url;
const RUNTIME = args.runtime;
const DEVICES = String(args.devices || '').split(';').map(s => s.trim()).filter(Boolean);
const BROWSERS = String(args.browsers || 'safari,fb,ig').split(',').map(s => s.trim()).filter(Boolean);
const OUT = args.out || 'out';
const APP = path.resolve('fbiab/build/FBIAB.app');
const WDA_DIR = path.resolve(process.env.WDA_DIR || 'wda-derived');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = cmd => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const slug = s => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function testUrl(u) {
  const x = new URL(u);
  // tbg_qa=1 keeps the visit out of the shop's own analytics and the live feed; it does not change the page.
  x.searchParams.set('tbg_qa', '1');
  return x.toString();
}

function findRuntime(name) {
  const rts = JSON.parse(sh('xcrun simctl list runtimes -j')).runtimes.filter(r => r.isAvailable !== false);
  const hit = rts.find(r => r.name === name) || rts.find(r => r.name.startsWith(name));
  if (!hit) throw new Error('runtime not found: ' + name + ' have: ' + rts.map(r => r.name).join(', '));
  return hit;
}
function findDeviceType(name) {
  const dts = JSON.parse(sh('xcrun simctl list devicetypes -j')).devicetypes;
  const hit = dts.find(d => d.name === name);
  if (!hit) throw new Error('device type not found: ' + name);
  return hit;
}

// ---------------------------------------------------------------- in-page probes
const COLLECT = `
var q=function(s){return document.querySelector(s)};
var vw=innerWidth, vh=innerHeight, de=document.documentElement;
function rect(el){if(!el)return null;var r=el.getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}}
function vis(el){if(!el)return false;var r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&+cs.opacity>0.05&&r.bottom>0&&r.top<vh}
function hit(el){if(!el)return null;var r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;if(y<0||y>vh)return 'offscreen';var t=document.elementFromPoint(x,y);if(!t)return 'none';return el.contains(t)?'ok':(t.tagName+'.'+String(t.className||'').slice(0,50)+(t.id?'#'+t.id:''))}
var nav=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||{};
var paints=(performance.getEntriesByType?performance.getEntriesByType('paint'):[]).map(function(p){return {n:p.name,t:Math.round(p.startTime)}});
var res=performance.getEntriesByType?performance.getEntriesByType('resource'):[];var byHost={};var big=[];
res.forEach(function(r){try{var h=new URL(r.name).host;var o=byHost[h]||(byHost[h]={n:0,kb:0,end:0});o.n++;var kb=(r.transferSize||r.encodedBodySize||0)/1024;o.kb+=kb;o.end=Math.max(o.end,Math.round(r.responseEnd));if(kb>60)big.push({u:r.name.slice(0,140),kb:Math.round(kb),end:Math.round(r.responseEnd),type:r.initiatorType})}catch(e){}});
Object.keys(byHost).forEach(function(k){byHost[k].kb=Math.round(byHost[k].kb)});
var off=[];if(de.scrollWidth>vw+1){var all=document.querySelectorAll('body *');for(var i=0;i<all.length&&off.length<15;i++){var el=all[i],r=el.getBoundingClientRect();if(r.width>0&&(r.right>vw+1||r.left<-1)){var cs=getComputedStyle(el);if(cs.position!=='fixed')off.push({tag:el.tagName,cls:String(el.className||'').slice(0,60),id:el.id,l:Math.round(r.left),r:Math.round(r.right)})}}}
var overlays=[];var fx=document.querySelectorAll('body *');for(var j=0;j<fx.length;j++){var e=fx[j];var cs2=getComputedStyle(e);if(cs2.position==='fixed'&&vis(e)){var rr=e.getBoundingClientRect();var area=Math.max(0,Math.min(rr.right,vw)-Math.max(rr.left,0))*Math.max(0,Math.min(rr.bottom,vh)-Math.max(rr.top,0));if(area>vw*vh*0.04)overlays.push({tag:e.tagName,cls:String(e.className||'').slice(0,60),id:e.id,share:Math.round(100*area/(vw*vh)),y:Math.round(rr.top),h:Math.round(rr.height)})}}
var imgs=Array.prototype.slice.call(document.images);var broken=imgs.filter(function(i){return i.complete&&i.naturalWidth===0&&i.src&&i.src.indexOf('data:')!==0&&getComputedStyle(i).display!=='none'}).map(function(i){return (i.currentSrc||i.src).slice(0,120)}).slice(0,10);
var main=q('#mainCheckout'),sticky=q('#stickyCtaBtn'),buy=q('#buy');
var shadeSel=q('.nh-shade-option-v2[aria-checked="true"]');var packSel=q('.bundle-card.sel');
return {ua:navigator.userAgent,lang:navigator.language,vw:vw,vh:vh,dpr:devicePixelRatio,
 vv:window.visualViewport?{w:Math.round(visualViewport.width),h:Math.round(visualViewport.height),top:Math.round(visualViewport.offsetTop),scale:visualViewport.scale}:null,
 scrollY:Math.round(scrollY),scrollH:de.scrollHeight,ready:document.readyState,
 nav:{ttfb:Math.round(nav.responseStart||0),dcl:Math.round(nav.domContentLoadedEventEnd||0),load:Math.round(nav.loadEventEnd||0),kb:Math.round((nav.transferSize||0)/1024)},
 paints:paints,resources:res.length,byHost:byHost,big:big.sort(function(a,b){return b.kb-a.kb}).slice(0,15),
 overflow:de.scrollWidth-vw,offenders:off,overlays:overlays,broken:broken,
 fonts:document.fonts?{openSans:document.fonts.check('16px "Open Sans"'),status:document.fonts.status}:null,
 main:{rect:rect(main),vis:vis(main),hit:hit(main),text:main?main.textContent.replace(/\\s+/g,' ').trim().slice(0,60):null},
 sticky:{rect:rect(sticky),vis:vis(sticky),hit:hit(sticky),text:sticky?sticky.textContent.replace(/\\s+/g,' ').trim().slice(0,40):null},
 buyTop:buy?Math.round(buy.getBoundingClientRect().top+scrollY):null,
 shade:shadeSel?shadeSel.getAttribute('data-nova-shade'):null,pack:packSel?packSel.getAttribute('data-nova-bundle'):null,
 cro:de.getAttribute('data-nova-cro'),errors:window.__labErrors||null,
 drawer:(function(){var d=q('cart-drawer');if(!d)return null;var co=q('#CartDrawer-Checkout')||q('cart-drawer [name="checkout"]');return {active:d.classList.contains('active'),checkout:{rect:rect(co),vis:vis(co),hit:hit(co)}}})()};
`;

const TOUCH_REC = `if(!window.__labTouches){window.__labTouches=[];['touchstart','touchend','click'].forEach(function(t){document.addEventListener(t,function(e){var el=e.target,p=e.changedTouches&&e.changedTouches[0];window.__labTouches.push({t:t,x:Math.round(p?p.clientX:(e.clientX||0)),y:Math.round(p?p.clientY:(e.clientY||0)),tag:el&&el.tagName,cls:el&&String(el.className||'').slice(0,50),id:el&&el.id,trusted:e.isTrusted,ts:Math.round(performance.now())});if(window.__labTouches.length>60)window.__labTouches.shift()},true)})}`;
const TOUCHES = `var t=window.__labTouches||[];window.__labTouches=[];return t;`;
const AIM = function (sel) { return `var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect();var x=r.left+r.width/2,y=r.top+r.height/2;var h=document.elementFromPoint(x,y);return {x:Math.round(x),y:Math.round(y),w:Math.round(r.width),h:Math.round(r.height),hit:h?(e.contains(h)?'self':h.tagName+'.'+String(h.className||'').slice(0,50)+(h.id?'#'+h.id:'')):'none',vh:innerHeight}`; };
const CARTRES = `return (performance.getEntriesByType('resource')||[]).filter(function(r){return r.name.indexOf('/cart')>-1||r.name.indexOf('sections=')>-1}).slice(-8).map(function(r){return {u:r.name.replace(location.origin,'').slice(0,90),start:Math.round(r.startTime),end:Math.round(r.responseEnd),dur:Math.round(r.duration)}})`;
const LCP = `var done=arguments[arguments.length-1];try{var v=null;var po=new PerformanceObserver(function(l){var e=l.getEntries();if(e.length)v=Math.round(e[e.length-1].startTime)});po.observe({type:'largest-contentful-paint',buffered:true});setTimeout(function(){done(v)},400)}catch(e){done('unsupported')}`;
const CART = `var done=arguments[arguments.length-1];fetch('/cart.js',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(c){done({count:c.item_count,total:c.total_price,items:(c.items||[]).map(function(i){return {t:i.product_title,v:i.variant_title,q:i.quantity,p:i.final_line_price}})})}).catch(function(e){done({err:String(e)})})`;
const CLEAR = `var done=arguments[arguments.length-1];fetch('/cart/clear.js',{method:'POST',credentials:'same-origin'}).then(function(){done(true)}).catch(function(e){done(String(e))})`;

// ---------------------------------------------------------------- one browser on one device
async function runOne({ udid, device, runtime, browser: label, dir }) {
  const dark = label.endsWith('-dark');
  const browser = label.replace(/-dark$/, '');
  try { sh(`xcrun simctl ui ${udid} appearance ${dark ? 'dark' : 'light'}`); } catch (_) {}
  fs.mkdirSync(dir, { recursive: true });
  const R = { device, runtime: runtime.name, browser: label, steps: [], startedAt: new Date().toISOString() };
  const step = (name, data) => { R.steps.push({ name, t: Date.now() - T0, ...data }); log(device, browser, name, JSON.stringify(data).slice(0, 220)); };
  const url = testUrl(URL0);
  const base = {
    platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:udid': udid,
    'appium:platformVersion': runtime.version, 'appium:deviceName': device,
    'appium:language': 'he', 'appium:locale': 'he_IL',
    'appium:nativeWebTap': true, 'appium:newCommandTimeout': 600,
    'appium:wdaLaunchTimeout': 900000, 'appium:wdaConnectionTimeout': 900000,
    'appium:derivedDataPath': WDA_DIR, 'appium:webviewConnectTimeout': 45000,
    'appium:showSafariConsoleLog': true, 'appium:showSafariNetworkLog': false,
    'appium:simulatorStartupTimeout': 600000, 'appium:connectHardwareKeyboard': false,
    ...(process.env.WDA_APP ? { 'appium:usePreinstalledWDA': true, 'appium:prebuiltWDAPath': process.env.WDA_APP } : {}),
  };
  const caps = browser === 'safari'
    ? { ...base, browserName: 'Safari', 'appium:safariInitialUrl': 'about:blank', 'appium:safariIgnoreFraudWarning': true }
    : { ...base, 'appium:app': APP, 'appium:bundleId': 'com.tbg.lab.fbiab', 'appium:autoWebview': false,
        'appium:processArguments': { args: ['-url', url, '-mode', browser, '-port', '8765'] } };
  let driver; const T0 = Date.now();
  const IAB = browser !== 'safari';
  const PORT = 8765;
  const http = async (pth, body) => {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}${pth}`, { method: 'POST', body: body || '', signal: AbortSignal.timeout(40000) });
        const j = await r.json();
        if (j.error) throw new Error('page: ' + j.error);
        return pth === '/eval' ? j.value : j;
      } catch (e) { if (i === 2 || String(e.message).startsWith('page:')) throw e; await sleep(1500); }
    }
  };
  const exec = (script) => IAB ? http('/eval', script) : driver.execute(script);
  const execAsync = (script) => IAB ? http('/eval', 'return await new Promise(function(resolve){ (function(){ ' + script + ' }).call(null, resolve); });') : driver.executeAsync(script);
  const nativeTapAt = async (x, y) => {
    if (!IAB) { const w = await driver.getContext(); await driver.switchContext('NATIVE_APP'); await driver.execute('mobile: tap', { x, y }); await driver.switchContext(w); }
    else await driver.execute('mobile: tap', { x, y });
  };
  const tap = async (sel) => {
    if (!IAB) { const el = await driver.$(sel); await el.click(); return 'native'; }
    const r = await exec(`var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}`);
    if (!r) throw new Error('not found ' + sel);
    const f = await http('/frame');
    await nativeTapAt(Math.round(f.x + r.x), Math.round(f.y + r.y));
    return 'native-xy';
  };
  const swipe = async (direction, velocity) => {
    if (!IAB) { const w = await driver.getContext(); await driver.switchContext('NATIVE_APP'); await driver.execute('mobile: swipe', { direction, velocity }).catch(() => {}); await driver.switchContext(w); }
    else await driver.execute('mobile: swipe', { direction, velocity }).catch(() => {});
  };
  try {
    driver = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'error', connectionRetryTimeout: 1200000, connectionRetryCount: 1, capabilities: caps });
    step('session', { ms: Date.now() - T0 });
    const tNav = Date.now();
    const film = async () => {
      const marks = [700, 1400, 2100, 2800, 3500, 4500, 6000, 8000];
      const t0 = Date.now();
      for (const m of marks) { const w = m - (Date.now() - t0); if (w > 0) await sleep(w); await driver.saveScreenshot(path.join(dir, `f${String(m).padStart(5, '0')}.png`)).catch(() => {}); }
    };
    if (browser === 'safari') {
      await driver.setTimeout({ pageLoad: 90000, script: 30000 });
      await driver.execute(`setTimeout(function(){location.href=${JSON.stringify(url)}},50)`);
      await film();
      for (let i = 0; i < 120; i++) { const rs = await driver.execute('return location.href.indexOf("tigerbrandsglobal")>-1 && document.readyState').catch(() => ''); if (rs === 'complete') break; await sleep(500); }
    } else {
      // cold start like a first tap on an ad: clear the in-app browser's data, then load and film it
      for (let i = 0; i < 60; i++) { if (await http('/frame').then(() => true).catch(() => false)) break; await sleep(500); }
      await http('/clear').catch(() => {});
      await sleep(600);
      await http('/eval', `setTimeout(function(){location.href=${JSON.stringify(url)}},50); return 1`).catch(() => {});
      await film();
      await sleep(1500);
      for (let i = 0; i < 120; i++) { const rs = await http('/eval', 'return document.readyState').catch(() => ''); if (rs === 'complete') break; await sleep(500); }
      await driver.saveScreenshot(path.join(dir, '00-app.png')).catch(() => {});
    }
    step('loaded', { ms: Date.now() - tNav });
    if (browser === 'safari') {
      // A brand-new simulator shows Safari's one-time tip over the page bottom; real users dismissed it long ago.
      const web0 = await driver.getContext();
      try {
        await driver.switchContext('NATIVE_APP');
        const x = await driver.$('//XCUIElementTypeButton[(@label="סגירה" or @label="Close" or @name="Close") and not(ancestor::XCUIElementTypeWebView)]');
        if (await x.isExisting()) { await x.click(); step('safari-tip-closed', {}); }
      } catch (e) { step('safari-tip', { msg: String(e.message).slice(0, 120) }); }
      await driver.switchContext(web0);
    }
    await exec(TOUCH_REC);
    await sleep(3000); // deferred scripts, experiments, popups
    const m1 = await exec(COLLECT);
    m1.lcp = await execAsync(LCP).catch(e => 'err:' + e.message);
    R.first = m1;
    step('first-screen', { vw: m1.vw, vh: m1.vh, overflow: m1.overflow, mainVis: m1.main.vis, mainY: m1.main.rect && m1.main.rect.y, stickyVis: m1.sticky.vis, overlays: m1.overlays.length, fcp: (m1.paints.find(p => p.n === 'first-contentful-paint') || {}).t, lcp: m1.lcp, load: m1.nav.load, broken: m1.broken.length, errors: (m1.errors || []).length });
    await driver.saveScreenshot(path.join(dir, '01-first.png'));

    // Screens down to the buy box and beyond, the way she scrolls with a thumb.
    const vh = m1.vh;
    for (let k = 1; k <= 5; k++) {
      await exec(`window.scrollTo(0, ${Math.round(vh * 0.9 * k)})`);
      await sleep(900);
      await driver.saveScreenshot(path.join(dir, `0${k + 1}-scroll${k}.png`));
    }
    await exec('window.scrollTo(0,0)'); await sleep(600);

    // 1. Shade: tap "חום בינוני" (medium brown) with a real touch.
    const shadeSel = '.nh-shade-option-v2[data-nova-shade="mediumbrown"], .nh-shade-option-v2[data-nova-shade="medium"]';
    await exec(`var e=document.querySelector('${shadeSel.replace(/'/g, "\\'")}')||document.querySelector('.nh-shade-option-v2');if(e)e.scrollIntoView({block:'center'})`);
    await sleep(800);
    const before = await exec(COLLECT);
    const aimShade = await exec(AIM('.nh-shade-option-v2[data-nova-shade="mediumbrown"]'));
    await exec(TOUCHES);
    let tapMode = 'native';
    try { tapMode = await tap('.nh-shade-option-v2[data-nova-shade="mediumbrown"]'); } catch (e) { tapMode = 'js:' + e.message.slice(0, 80); await exec(`var e=document.querySelector('.nh-shade-option-v2[data-nova-shade="mediumbrown"]')||document.querySelector('.nh-shade-option-v2');e&&e.click()`); }
    await sleep(1500);
    const afterShade = await exec(COLLECT);
    step('shade-tap', { tapMode, aim: aimShade, touches: await exec(TOUCHES), before: before.shade, after: afterShade.shade, overlays: afterShade.overlays.map(o => o.cls || o.id).slice(0, 4) });
    await driver.saveScreenshot(path.join(dir, '10-after-shade.png'));
    // a shade preview window may open; close it the way she would (its close button)
    const prevOpen = await exec(`var m=document.querySelector('.nh-shade-modal-v2');return !!(m&&!m.hidden&&m.getBoundingClientRect().height>0)`).catch(() => false);
    if (prevOpen) { try { await tap('[aria-label="סגירת תצוגת הגוון"]'); } catch (_) {} await sleep(800); step('closed-shade-preview', {}); }

    // 2. Pack: tap the 2-bottle card.
    await exec(`var e=document.querySelector('.bundle-card[data-nova-bundle="2"]');if(e)e.scrollIntoView({block:'center'})`);
    await sleep(1200);
    const aimPack = await exec(AIM('.bundle-card[data-nova-bundle="2"]'));
    await exec(TOUCHES);
    try { tapMode = await tap('.bundle-card[data-nova-bundle="2"]'); } catch (e) { tapMode = 'js:' + e.message.slice(0, 80); await exec(`var e=document.querySelector('.bundle-card[data-nova-bundle="2"]');e&&e.click()`); }
    await sleep(1200);
    const afterPack = await exec(COLLECT);
    step('pack-tap', { tapMode, aim: aimPack, touches: await exec(TOUCHES), pack: afterPack.pack, main: afterPack.main.text });
    await driver.saveScreenshot(path.join(dir, '11-after-pack.png'));

    // 3. Add to cart with the main button.
    await exec(`var e=document.querySelector('#mainCheckout');if(e)e.scrollIntoView({block:'center'})`);
    await sleep(900);
    const preBuy = await exec(COLLECT);
    const aimBuy = await exec(AIM('#mainCheckout'));
    await exec(TOUCHES);
    await exec(`window.__labDrawerAt=null;var d=document.querySelector('cart-drawer');if(d&&!window.__labDrawerObs){window.__labDrawerObs=new MutationObserver(function(){if(d.classList.contains('active')&&!window.__labDrawerAt)window.__labDrawerAt=Math.round(performance.now())});window.__labDrawerObs.observe(d,{attributes:true,attributeFilter:['class']})}`);
    const tBuy = Date.now();
    try { tapMode = await tap('#mainCheckout'); } catch (e) { tapMode = 'js:' + e.message.slice(0, 80); await exec(`document.querySelector('#mainCheckout').click()`); }
    let cart = null, drawerOpenMs = null;
    for (let i = 0; i < 24; i++) {
      await sleep(500);
      const d = await exec(`var d=document.querySelector('cart-drawer');return d?d.classList.contains('active'):null`);
      if (d && drawerOpenMs === null) drawerOpenMs = Date.now() - tBuy;
      if (d) break;
    }
    await sleep(1200);
    cart = await execAsync(CART).catch(e => ({ err: e.message }));
    const inCart = await exec(COLLECT);
    const buyTouches = await exec(TOUCHES);
    const drawerAt = await exec('return window.__labDrawerAt');
    const firstTouch = (buyTouches || []).find(t => t.t === 'touchstart');
    step('add-to-cart', { tapMode, aim: aimBuy, touches: buyTouches, drawerAfterTouchMs: drawerAt && firstTouch ? drawerAt - firstTouch.ts : null, cartRequests: await exec(CARTRES), mainHitBefore: preBuy.main.hit, drawerOpenMs, cartCount: cart && cart.count, items: cart && cart.items, checkout: inCart.drawer && inCart.drawer.checkout, overlays: inCart.overlays.map(o => (o.cls || o.id) + ':' + o.share + '%').slice(0, 5) });
    R.cart = { cart, drawer: inCart.drawer, vv: inCart.vv, vh: inCart.vh };
    await driver.saveScreenshot(path.join(dir, '20-cart.png'));
    // can she reach the checkout button? scroll the drawer's footer into view and hit-test it
    const coCheck = await exec(`var co=document.querySelector('#CartDrawer-Checkout')||document.querySelector('cart-drawer [name="checkout"]');if(!co)return null;var r=co.getBoundingClientRect();var x=r.left+r.width/2,y=r.top+r.height/2;var t=document.elementFromPoint(x,y);return {y:Math.round(r.top),h:Math.round(r.height),bottomGap:Math.round(innerHeight-r.bottom),hit:t?(co.contains(t)?'ok':t.tagName+'.'+String(t.className||'').slice(0,40)):'none',disabled:co.disabled===true}`);
    step('checkout-button', coCheck || {});
    // close the cart with its close button, then empty it
    try { await tap('cart-drawer .drawer__close'); } catch (_) {}
    await sleep(900);
    const cleared = await execAsync(CLEAR).catch(e => e.message);
    step('cart-cleared', { cleared, drawerActive: await exec(`var d=document.querySelector('cart-drawer');return d?d.classList.contains('active'):null`) });

    // 4. Thumb scroll with real swipes, then the bottom bar, then a fast flick back up (exit-sheet trap).
    for (let k = 0; k < 4; k++) { await swipe('up', 900); await sleep(700); }
    await sleep(1200);
    const scrolled = await exec(COLLECT);
    step('after-swipes', { scrollY: scrolled.scrollY, stickyVis: scrolled.sticky.vis, stickyHit: scrolled.sticky.hit, stickyRect: scrolled.sticky.rect, vv: scrolled.vv, overlays: scrolled.overlays.map(o => (o.cls || o.id) + ':' + o.share + '%').slice(0, 5) });
    await driver.saveScreenshot(path.join(dir, '30-swiped.png'));
    if (scrolled.sticky.vis) {
      const y0 = scrolled.scrollY;
      try { tapMode = await tap('#stickyCtaBtn'); } catch (e) { tapMode = 'js:' + e.message.slice(0, 80); }
      await sleep(2000);
      const afterSticky = await exec(COLLECT);
      step('sticky-tap', { tapMode, scrollFrom: y0, scrollTo: afterSticky.scrollY, buyTop: afterSticky.buyTop, drawer: afterSticky.drawer && afterSticky.drawer.active, overlays: afterSticky.overlays.map(o => (o.cls || o.id) + ':' + o.share + '%').slice(0, 5) });
      await driver.saveScreenshot(path.join(dir, '31-after-sticky.png'));
      await execAsync(CLEAR).catch(() => {});
      await exec(`var d=document.querySelector('cart-drawer');if(d&&d.classList.contains('active')){var b=d.querySelector('.drawer__close');b&&b.click()}`);
    }
    // fast flick up after reading for a while
    await exec(`window.scrollTo(0, Math.round(document.documentElement.scrollHeight*0.45))`);
    await sleep(13000);
    await swipe('down', 4000);
    await sleep(1800);
    const flick = await exec(COLLECT);
    step('fast-flick-up', { scrollY: flick.scrollY, overlays: flick.overlays.map(o => (o.cls || o.id) + ':' + o.share + '%').slice(0, 5) });
    await driver.saveScreenshot(path.join(dir, '40-flick.png'));

    try {
      if (!IAB) { const w = await driver.getContext(); await driver.switchContext('NATIVE_APP'); await driver.execute('mobile: backgroundApp', { seconds: 4 }); await driver.switchContext(w); }
      else await driver.execute('mobile: backgroundApp', { seconds: 4 });
      await sleep(2500);
      const back = await exec(COLLECT);
      step('app-switch-return', { overlays: back.overlays.map(o => (o.cls || o.id) + ':' + o.share + '%').slice(0, 5) });
      await driver.saveScreenshot(path.join(dir, '41-return.png'));
    } catch (e) { step('app-switch-return', { err: String(e.message).slice(0, 160) }); }
    R.last = flick;
    try { R.console = (await driver.getLogs('safariConsole')).slice(-80).map(x => ({ level: x.level, msg: String(x.message || x.text || '').slice(0, 400) })); } catch (e) { R.console = 'n/a: ' + e.message.slice(0, 80); }
    if (browser !== 'safari') { try { R.syslog = (await driver.getLogs('syslog')).map(x => String(x.message)).filter(s => s.includes('LABMSG')).slice(-60); } catch (_) {} }
  } catch (e) {
    R.error = String(e && e.stack || e).slice(0, 2000);
    log(device, browser, 'ERROR', R.error.slice(0, 300));
    try { if (driver) await driver.saveScreenshot(path.join(dir, '99-error.png')); } catch (_) {}
  } finally {
    R.ms = Date.now() - T0;
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(R, null, 1));
    try { if (driver) await driver.deleteSession(); } catch (_) {}
  }
  return R;
}

// ---------------------------------------------------------------- main
const runtime = findRuntime(RUNTIME);
log('runtime', runtime.name, runtime.identifier);
const summary = [];
for (const device of DEVICES) {
  let udid;
  try {
    const dt = findDeviceType(device);
    udid = sh(`xcrun simctl create "lab ${device}" "${dt.identifier}" "${runtime.identifier}"`);
    log('created', device, udid);
    sh(`xcrun simctl boot ${udid}`);
    sh(`xcrun simctl bootstatus ${udid} -b`);
    if (BROWSERS.some(b => b !== 'safari')) sh(`xcrun simctl install ${udid} "${APP}"`);
    for (const browser of BROWSERS) {
      const dir = path.join(OUT, slug(runtime.name), slug(device), browser);
      const r = await runOne({ udid, device, runtime, browser, dir });
      summary.push({ device, runtime: runtime.name, browser, ok: !r.error, error: r.error ? r.error.slice(0, 200) : null, steps: r.steps });
      fs.writeFileSync(path.join(OUT, `summary-${slug(runtime.name)}.json`), JSON.stringify(summary, null, 1));
    }
  } catch (e) {
    log('device failed', device, String(e.message).slice(0, 300));
    summary.push({ device, runtime: runtime.name, error: String(e.message).slice(0, 300) });
  } finally {
    if (udid) { try { sh(`xcrun simctl shutdown ${udid}`); } catch (_) {} try { sh(`xcrun simctl delete ${udid}`); } catch (_) {} }
  }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `summary-${slug(runtime.name)}.json`), JSON.stringify(summary, null, 1));
log('done', summary.length);
