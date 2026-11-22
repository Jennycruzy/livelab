// Light or dark page. Runs before the page paints: ?theme=light|dark wins and is remembered, then the saved choice,
// then the device setting. Adds a small switch to the top bar.
(function () {
  var root = document.documentElement, q = new URLSearchParams(location.search).get('theme'), saved = null;
  try { saved = localStorage.getItem('livelab-theme'); } catch (e) {}
  if (q === 'light' || q === 'dark') { saved = q; try { localStorage.setItem('livelab-theme', q); } catch (e) {} }
  var theme = saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  root.dataset.theme = theme;
  window.liveLabDark = function () { return root.dataset.theme !== 'light'; };
  window.liveLabFrame = function () { return root.dataset.theme === 'light' ? '/frame?light' : '/frame'; };
  addEventListener('DOMContentLoaded', function () {
    var bar = document.querySelector('.nav-in');
    if (!bar) return;
    var b = document.createElement('button');
    b.className = 'theme-switch'; b.type = 'button';
    function label() { b.textContent = root.dataset.theme === 'light' ? 'Dark' : 'Light'; b.setAttribute('aria-label', 'Switch to ' + b.textContent.toLowerCase() + ' mode'); }
    label();
    b.addEventListener('click', function () {
      var next = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('livelab-theme', next); } catch (e) {}
      location.reload();
    });
    var cta = bar.querySelector('.btn, .nav-cta');
    if (cta) bar.insertBefore(b, cta); else bar.appendChild(b);
  });
})();
