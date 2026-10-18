Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0 }, writable: true, configurable: true });
const { describeDevice } = await import('/home/user/claude-workspace/js/platform/support.js');
const cases = {
  'iPhone 12 / iOS 17.5 Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'iPhone 7 / iOS 15.8 Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1',
  'iPhone 6 / iOS 12.5 Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  'iPhone / Chrome iOS': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  'iPhone / LINE': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.20.0',
  'S22 Ultra / Chrome': 'Mozilla/5.0 (Linux; Android 14; SM-S908E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Samsung 瀏覽器': 'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  'Android Instagram': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0',
  'Windows Edge': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mac Safari': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
};
for (const [n, ua] of Object.entries(cases)) { const d = describeDevice(ua); console.log(n.padEnd(28), '→', d.os, d.osVersion, '|', d.browser, d.inApp ? '| App 內' : ''); }
navigator.maxTouchPoints = 5;
console.log('iPad（假裝成 Mac）'.padEnd(28), '→', JSON.stringify(describeDevice(cases['Mac Safari'])));
