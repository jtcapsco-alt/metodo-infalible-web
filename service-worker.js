// Service worker minimo -- necesario para que el navegador permita instalar
// la app en pantalla de inicio. No hace cache agresivo porque los datos
// (partidos, cuotas) cambian todo el tiempo y siempre queremos lo mas reciente.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // simplemente deja pasar todas las peticiones a la red, sin cache
  event.respondWith(fetch(event.request));
});
