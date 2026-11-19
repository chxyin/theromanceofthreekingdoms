/* ============================================================
   三国演义 · 电子书 — reading behaviours
   The pinyin mechanism is unchanged from the source chapters:
   a .word is clicked  ->  .revealed  ->  its .pinyin bubble shows.
   A click anywhere else clears every revealed word.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'rtk.ebook.v1';
  function get(k, d) {
    try { var v = localStorage.getItem(KEY + '.' + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function set(k, v) {
    try { localStorage.setItem(KEY + '.' + k, JSON.stringify(v)); } catch (e) {}
  }

  var body = document.body;
  var side = document.getElementById('side');
  var scrim = document.getElementById('scrim');
  var bar = document.getElementById('bar');
  var btnMenu = document.getElementById('menuBtn');
  var btnPy = document.getElementById('pyBtn');
  var btnHover = document.getElementById('hoverBtn');
  var btnEn = document.getElementById('enBtn');
  var btnMinus = document.getElementById('fsMinus');
  var btnPlus = document.getElementById('fsPlus');
  var topCh = document.getElementById('topCh');

  /* ---------------- pinyin reveal ---------------- */
  function clearRevealed() {
    var list = document.querySelectorAll('.word.revealed');
    for (var i = 0; i < list.length; i++) { list[i].classList.remove('revealed'); }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var w = (t && t.closest) ? t.closest('.word') : null;
    if (w) { w.classList.toggle('revealed'); return; }
    clearRevealed();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { clearRevealed(); closeDrawer(); }
  });

  /* ---------------- toggles ---------------- */
  function applyPyAll(on, save) {
    body.classList.toggle('py-all', !!on);
    btnPy.classList.toggle('on', !!on);
    btnPy.textContent = on ? '拼音 · 全显' : '拼音 · 点按';
    btnPy.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (save) set('pyAll', !!on);
  }

  /* 悬停看拼音：与点按共用同一套 .pinyin 气泡，只是把触发方式换成鼠标悬停 */
  function applyHover(on, save) {
    body.classList.toggle('py-hover', !!on);
    btnHover.classList.toggle('on', !!on);
    btnHover.textContent = on ? '悬停 · 开' : '悬停 · 关';
    btnHover.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (save) set('pyHover', !!on);
  }

  function applyEn(show, save) {
    body.classList.toggle('no-en', !show);
    btnEn.classList.toggle('on', !show);
    btnEn.textContent = show ? '英译 · 显示' : '英译 · 隐藏';
    btnEn.setAttribute('aria-pressed', show ? 'false' : 'true');
    if (save) set('en', !!show);
  }

  var FS = { s: ['1.06rem', '0.85rem'], m: ['1.25rem', '0.95rem'], l: ['1.46rem', '1.06rem'], xl: ['1.72rem', '1.18rem'] };
  var FS_ORDER = ['s', 'm', 'l', 'xl'];

  function applyFs(size, save) {
    var s = FS[size] || FS.m;
    document.documentElement.style.setProperty('--zh', s[0]);
    document.documentElement.style.setProperty('--en', s[1]);
    if (save) set('fs', size);
  }

  btnPy.addEventListener('click', function () { applyPyAll(!body.classList.contains('py-all'), true); });
  btnHover.addEventListener('click', function () { applyHover(!body.classList.contains('py-hover'), true); });
  btnEn.addEventListener('click', function () { applyEn(body.classList.contains('no-en'), true); });
  btnMinus.addEventListener('click', function () { stepFs(-1); });
  btnPlus.addEventListener('click', function () { stepFs(1); });

  function stepFs(d) {
    var cur = FS_ORDER.indexOf(get('fs', 'm'));
    if (cur < 0) cur = 1;
    cur = Math.max(0, Math.min(FS_ORDER.length - 1, cur + d));
    applyFs(FS_ORDER[cur], true);
    recalc();
  }

  /* ---------------- progress + active chapter ---------------- */
  var chapters = [].slice.call(document.querySelectorAll('section.chapter'));
  var tocItems = {};
  [].forEach.call(document.querySelectorAll('.toc-item'), function (it) {
    tocItems[it.getAttribute('data-ch')] = it;
  });
  var sectionLinks = [].slice.call(document.querySelectorAll('.toc-sec'));
  var lastCur = null, lastSec = null, maxScroll = 1, ticking = false, saveAt = 0;

  function recalc() {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }
  function topOf(el) { return el.getBoundingClientRect().top + window.pageYOffset; }

  function savePos(p) {
    var now = Date.now();
    if (now - saveAt < 500) return;
    saveAt = now;
    set('pos', Math.round(p * 100000) / 100000);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.pageYOffset;
      var p = Math.min(1, Math.max(0, y / maxScroll));
      bar.style.width = (p * 100).toFixed(2) + '%';

      var probe = y + 140, cur = chapters[0], i;
      for (i = 0; i < chapters.length; i++) { if (topOf(chapters[i]) <= probe) cur = chapters[i]; }

      if (cur && cur !== lastCur) {
        if (lastCur && tocItems[lastCur.id]) tocItems[lastCur.id].classList.remove('cur');
        if (tocItems[cur.id]) tocItems[cur.id].classList.add('cur');
        lastCur = cur;
        var item = tocItems[cur.id];
        if (item && topCh) {
          var num = item.querySelector('.toc-num');
          var ttl = item.querySelector('.toc-t');
          topCh.textContent = (num ? num.textContent : '') + (ttl ? ' · ' + ttl.textContent : '');
        }
      }

      if (cur) {
        var paras = cur.querySelectorAll('.paragraph[id]');
        var curId = null, pp = y + 170, j;
        for (j = 0; j < paras.length; j++) { if (topOf(paras[j]) <= pp) curId = paras[j].id; }
        if (curId !== lastSec) {
          lastSec = curId;
          for (j = 0; j < sectionLinks.length; j++) {
            sectionLinks[j].classList.toggle('active', sectionLinks[j].getAttribute('data-target') === curId);
          }
        }
      }

      savePos(p);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { recalc(); onScroll(); });

  /* ---------------- mobile drawer ---------------- */
  function closeDrawer() {
    side.classList.remove('open');
    scrim.classList.remove('on');
  }
  btnMenu.addEventListener('click', function () {
    var open = side.classList.toggle('open');
    scrim.classList.toggle('on', open);
  });
  scrim.addEventListener('click', closeDrawer);
  side.addEventListener('click', function (e) {
    var a = (e.target && e.target.closest) ? e.target.closest('a') : null;
    if (a && window.matchMedia('(max-width:900px)').matches) closeDrawer();
  });

  /* ---------------- boot ---------------- */
  applyPyAll(get('pyAll', false), false);
  applyHover(get('pyHover', false), false);
  applyEn(get('en', true), false);
  var storedFs = get('fs', null);
  if (storedFs && FS[storedFs]) { applyFs(storedFs, false); }

  function restore() {
    recalc();
    if (window.pageYOffset > 5) return; /* the reader already moved — never yank them back */
    var p = get('pos', null);
    if (typeof p === 'number' && p > 0.003) {
      var y = Math.round(p * maxScroll);
      try { window.scrollTo({ top: y, behavior: 'instant' }); }
      catch (e) { window.scrollTo(0, y); }
    }
    onScroll();
  }

  window.addEventListener('load', function () {
    restore();
    setTimeout(recalc, 400);
    setTimeout(restore, 500);
  });
})();
