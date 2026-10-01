/* FontStudio Service Worker: offline nutzbar + Notizen aus anderen Apps empfangen */
const VERSION = 'fontstudio-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const SHARE = 'fontstudio-share';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== SHARE && k !== VERSION + '-rt') await caches.delete(k);
    await self.clients.claim();
  })());
});

async function receiveShare(request){
  try {
    const fd = await request.formData();
    const files = fd.getAll('file').filter(f => f && typeof f === 'object' && f.size);
    const c = await caches.open(SHARE);
    for (const k of await c.keys()) await c.delete(k);
    let i = 0;
    for (const f of files){
      await c.put(new Request('./__share/' + (i++)), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'Notiz') } }));
    }
  } catch (e) {}
  return Response.redirect('./?share=1', 303);
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')){ e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
  if (url.origin === location.origin){
    if (req.mode === 'navigate'){
      // Netz zuerst (immer aktuelle Version), offline aus dem Speicher
      e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return r; })
        .catch(() => caches.match('./index.html')));
      return;
    }
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok){ const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; })));
    return;
  }
  // Schrift für die Oberfläche und PDF-Leser: zwischenspeichern, damit es offline geht
  if (/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host)){
    e.respondWith(caches.open(VERSION + '-rt').then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
