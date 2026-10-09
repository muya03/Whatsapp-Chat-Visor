// Aplica el tema guardado antes de pintar (evita parpadeos). Solo lee la preferencia local de apariencia.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('wv:prefs') || '{}');
    var r = document.documentElement;
    if (p.theme === 'light' || p.theme === 'dark') r.setAttribute('data-theme', p.theme);
    var dark = p.theme === 'dark' || (p.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    r.setAttribute('data-resolved-theme', dark ? 'dark' : 'light');
    if (p.skin && p.skin !== 'auto') r.setAttribute('data-skin', p.skin);
  } catch (e) {}
})();
