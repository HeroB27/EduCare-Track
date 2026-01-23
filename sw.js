const VERSION = '1.0.0';
const STATIC_CACHE = 'educaretrack-static-' + VERSION;
const DYNAMIC_CACHE = 'educaretrack-dynamic-' + VERSION;
const OFFLINE_URL = '/offline.html';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/core.js',
  '/manifest.webmanifest',
  '/offline.html',
  '/dashboard-template.html',
  '/admin/admin-dashboard.html',
  '/teacher/teacher-dashboard.html',
  '/guard/guard-dashboard.html',
  '/clinic/clinic-dashboard.html',
  '/parent/parent-dashboard.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC_CACHE, DYNAMIC_CACHE].includes(k)).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(DYNAMIC_CACHE).then((c) => c.put(req, copy));
          return r;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(OFFLINE_URL)))
    );
    return;
  }
  if (sameOrigin) {
    if (/\.(html|js|css|png|jpg|jpeg|svg|webp|json|webmanifest)$/.test(url.pathname)) {
      e.respondWith(
        caches.match(req).then((r) =>
          r ||
          fetch(req).then((resp) => {
            const copy = resp.clone();
            caches.open(DYNAMIC_CACHE).then((c) => c.put(req, copy));
            return resp;
          })
        )
      );
      return;
    }
  } else {
    if (/cdn|supabase|googleapis|jsdelivr|dummyimage/.test(url.hostname)) {
      e.respondWith(
        fetch(req)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(DYNAMIC_CACHE).then((c) => c.put(req, copy));
            return resp;
          })
          .catch(() => caches.match(req))
      );
      return;
    }
  }
});
