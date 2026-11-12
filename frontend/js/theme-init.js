// Applies the saved theme before first paint (loaded synchronously in <head>), so pages
// don't flash the default theme. A file rather than an inline <script> so the
// Content-Security-Policy can forbid inline script entirely.
(function () {
  try {
    var t = localStorage.getItem('marquee-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
