/* ============================================
   SERVICE WORKER — LinkCurto (v3)
   Network-first para atualização imediata
   ============================================ */

const CACHE = 'linkcurto-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Limpa TODOS os caches antigos para forçar atualização imediata
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // API e Auth
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sem conexão. Verifique sua internet.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Network-First: busca sempre a versão mais recente do servidor
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
