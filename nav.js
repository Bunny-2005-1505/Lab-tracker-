(function () {
  var I = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'
  };
  var items = [['dashboard', 'dashboard.html', 'Dashboard', I.home], ['products', 'products.html', 'Stock', I.box],
               ['equipment', 'equipment.html', 'Equipment', I.cal], ['profile', 'profile.html', 'Profile', I.user]];
  var cur = document.body.getAttribute('data-page');
  var nav = document.createElement('nav');
  nav.className = 'side'; nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = '<a class="brand" href="dashboard.html"><img src="logo.png" alt="">Lab Tracker</a>' +
    items.map(function (i) {
      return '<a class="nav-a' + (i[0] === cur ? ' on" aria-current="page' : '') + '" href="' + i[1] + '">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + i[3] + '</svg>' + i[2] + '</a>';
    }).join('') + '<span class="sp"></span>';
  document.body.prepend(nav);

  var t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t);
  var timer;
  window.toast = function (msg, opts) {
    opts = opts || {};
    t.className = opts.error ? 'err' : ''; t.textContent = msg;
    if (opts.action) {
      var b = document.createElement('button'); b.textContent = opts.action.label;
      b.onclick = function () { t.classList.remove('show'); opts.action.run(); }; t.appendChild(b);
    }
    t.classList.add('show'); clearTimeout(timer);
    timer = setTimeout(function () { t.classList.remove('show'); }, opts.action ? 7000 : 3500);
  };
  window.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
})();
