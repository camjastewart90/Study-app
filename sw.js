/* Offline support, cache first: the app opens straight from the saved copy (instant, works with no
   signal) and checks for a newer version in the background. When something changed, open pages get
   an 'updated' message and show a "New version ready" prompt. */
const CACHE = 'studyapp-v9';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'vendor/marked.min.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'data/courses.json', 'data/course6.json',
  'fonts/instrument-serif-latin-400-normal.woff2', 'fonts/instrument-serif-latin-400-italic.woff2', 'fonts/inter-latin-wght-normal.woff2',
];
// Changes to these are worth telling the user about. Icons and fonts just update quietly.
const WATCH = /(\/|index\.html|app\.js|styles\.css|\.json)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => {
    const old = keys.filter((k) => k !== CACHE);
    return Promise.all(old.map((k) => caches.delete(k)))
      .then(() => self.clients.claim())
      .then(() => { if (old.length) notify(); }); // a new version replaced an old one
  }));
});

function notify() {
  return self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'updated' })));
}

// Fetch a fresh copy, store it, and report whether it differs from what was cached.
function refresh(req, cached) {
  // clone now: the cached response itself is handed to the page and its body gets used up
  const before = cached && WATCH.test(new URL(req.url).pathname) ? cached.clone() : null;
  const key = req.mode === 'navigate' ? new Request(new URL('./', self.registration.scope).href) : req;
  return fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(async (res) => {
    if (!res.ok) return res;
    const c = await caches.open(CACHE);
    if (before) {
      const [a, b] = await Promise.all([before.text(), res.clone().text()]);
      if (a !== b) { await c.put(key, res.clone()); notify(); return res; }
    }
    await c.put(key, res.clone());
    return res;
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const lookup = req.mode === 'navigate'
    ? caches.match('./').then((hit) => hit || caches.match('index.html'))
    : caches.match(req, { ignoreSearch: true });
  e.respondWith(lookup.then((cached) => {
    const fresh = refresh(req, cached);
    if (cached) {
      e.waitUntil(fresh.catch(() => {})); // update in the background, serve the saved copy now
      return cached;
    }
    return fresh.catch(() => caches.match('index.html'));
  }));
});
