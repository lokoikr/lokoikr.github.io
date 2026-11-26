// LoKo.i — step-by-step forms (mobile first), validation, photo, and submission to Google Apps Script
(function () {
  var cfg = window.LOKOI_CONFIG || {};
  var T = function (k) { return window.LOKOI_T ? window.LOKOI_T(k) : k; };
  function today() {
    var n = new Date();
    return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2);
  }
  function el(tag, cls, key) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (key) { e.setAttribute('data-i18n', key); e.textContent = T(key); }
    return e;
  }

  document.querySelectorAll('[data-lk-form]').forEach(function (form) {
    var type = form.getAttribute('data-lk-form');
    var warn = document.querySelector('[data-endpoint-warning]');
    var errBox = form.querySelector('[data-form-error]');
    var done = document.querySelector('[data-form-done]');
    var btn = form.querySelector('button[type="submit"]');
    var startedAt = 0, photoData = '';
    var DRAFT = 'lokoi_draft_' + type;

    if (!cfg.ENDPOINT && warn) warn.hidden = false;
    form.addEventListener('focusin', function () { if (!startedAt) startedAt = Date.now(); });

    // ---------- show/hide fields that depend on another answer ----------
    var conditional = form.querySelectorAll('[data-show-when]');
    function syncConditional() {
      conditional.forEach(function (box) {
        var rule = box.getAttribute('data-show-when').split('='), src = form.querySelector('[name="' + rule[0] + '"]');
        var on = src && src.value === rule[1];
        box.hidden = !on;
        box.querySelectorAll('input, select, textarea').forEach(function (i) { i.required = on; if (!on) i.value = ''; });
      });
    }
    form.addEventListener('change', syncConditional);

    // ---------- small helpers for the traveler form ----------
    var withSel = form.querySelector('[name="travelling_with"]'), sizeSel = form.querySelector('[name="group_size"]');
    if (withSel && sizeSel) withSel.addEventListener('change', function () {
      if (withSel.value === 'Solo') sizeSel.value = '1';
      else if (sizeSel.value === '1') sizeSel.value = withSel.value === 'Group (5+)' ? '5+' : '2';
    });
    var arrive = form.querySelector('[name="arrive"]'), leave = form.querySelector('[name="leave"]'), longStay = form.querySelector('[data-long-stay]');
    function syncDates() {
      var t = today();
      if (arrive) arrive.min = t;
      if (leave) leave.min = (arrive && arrive.value) || t;
      var pd = form.querySelector('[name="preferred_date"]');
      if (pd) { pd.min = (arrive && arrive.value > t ? arrive.value : t); if (leave && leave.value) pd.max = leave.value; }
      if (longStay && arrive && leave && arrive.value && leave.value) {
        longStay.hidden = (new Date(leave.value) - new Date(arrive.value)) / 864e5 < 60;
      }
    }
    if (arrive) { arrive.addEventListener('change', syncDates); leave.addEventListener('change', syncDates); }

    // ---------- photo: shrink on the phone before sending (max 1024px JPEG) ----------
    var pBox = form.querySelector('[data-photo]');
    if (pBox && !cfg.PHOTO_UPLOAD) { pBox.hidden = true; pBox = null; } // 서버(드라이브 저장) 준비 전엔 숨김
    if (pBox) {
      var pIn = pBox.querySelector('[data-photo-input]'), pImg = pBox.querySelector('[data-photo-preview]');
      var pEmpty = pBox.querySelector('.photo-empty'), pDel = pBox.querySelector('[data-photo-remove]');
      function setPhoto(url) {
        photoData = url || '';
        pImg.hidden = !url; pEmpty.hidden = !!url; pDel.hidden = !url;
        if (url) pImg.src = url; else { pImg.removeAttribute('src'); pIn.value = ''; }
      }
      function draw(src, w, h) {
        var max = 1024, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.82);
      }
      pIn.addEventListener('change', function () {
        var f = pIn.files && pIn.files[0];
        if (!f) return;
        var fail = function () { setPhoto(''); showError(T('ph_err')); };
        if (window.createImageBitmap) {
          createImageBitmap(f, { imageOrientation: 'from-image' }).then(function (b) { setPhoto(draw(b, b.width, b.height)); }, function () { viaImg(); });
        } else viaImg();
        function viaImg() {
          var url = URL.createObjectURL(f), img = new Image();
          img.onload = function () { setPhoto(draw(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
          img.onerror = fail; img.src = url;
        }
      });
      pDel.addEventListener('click', function () { setPhoto(''); });
    }

    // ---------- errors ----------
    function showError(msg, focusEl) {
      errBox.textContent = msg;
      errBox.hidden = false;
      if (focusEl && focusEl.focus) { focusEl.focus({ preventScroll: true }); (focusEl.closest('.field') || focusEl).scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // returns the first problem inside `scope` (a fieldset, or the whole form)
    function validate(scope) {
      scope = scope || form;
      var inScope = function (p) { return p && (!p.el || scope.contains(p.el)) ? p : null; };
      var fields = scope.querySelectorAll('input[required], textarea[required], select[required]');
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.closest('[hidden]')) continue;
        var empty = f.type === 'checkbox' ? !f.checked : !String(f.value || '').trim();
        if (empty) return { msg: f.type === 'checkbox' ? T('err_agree') : T('err_required'), el: f };
        if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim())) return { msg: T('err_email'), el: f };
        var min = Number(f.getAttribute('minlength'));
        if (min && f.value.trim().length < min) return { msg: T('err_intro'), el: f };
      }
      var groups = scope.querySelectorAll('[data-required-group]');
      for (var g = 0; g < groups.length; g++) {
        if (!groups[g].querySelector('input:checked')) return { msg: T('err_group'), el: groups[g].querySelector('input') };
      }
      var checks = [], t = today();
      var a = arrive, l = leave, pd = form.querySelector('[name="preferred_date"]'), here = form.querySelector('[name="in_busan"]:checked');
      if (a && l && a.value && l.value && l.value < a.value) checks.push({ msg: T('err_dates'), el: l });
      if (l && l.value && l.value < t) checks.push({ msg: T('err_past'), el: l });
      if (a && a.value && a.value < t && !(here && here.value === 'Already here')) checks.push({ msg: T('err_past'), el: a });
      if (pd && pd.value) {
        if (pd.value < t) checks.push({ msg: T('err_past'), el: pd });
        else if (a && l && a.value && l.value && (pd.value < a.value || pd.value > l.value)) checks.push({ msg: T('err_range'), el: pd });
      }
      if (withSel && sizeSel && withSel.value === 'Solo' && sizeSel.value !== '1') checks.push({ msg: T('err_solo'), el: sizeSel });
      var pref = form.querySelector('[name="buddy_pref"]:checked'), gen = form.querySelector('[name="gender"]:checked');
      if (pref && pref.value === 'Same gender' && (!gen || gen.value === 'Prefer not to say')) checks.push({ msg: T('err_gender'), el: gen || form.querySelector('[name="gender"]') });
      for (var c = 0; c < checks.length; c++) if (inScope(checks[c])) return checks[c];
      return null;
    }

    // ---------- draft: keep answers if the visitor leaves (e.g. back to Instagram) ----------
    function saveDraft() {
      try {
        var d = {};
        form.querySelectorAll('input, select, textarea').forEach(function (i) {
          if (!i.name || i.type === 'file' || i.name === 'website') return;
          if (i.type === 'checkbox' || i.type === 'radio') { if (i.checked) (d[i.name] = d[i.name] || []).push(i.value); }
          else d[i.name] = i.value;
        });
        d._step = step; d._started = startedAt;
        localStorage.setItem(DRAFT, JSON.stringify(d));
      } catch (e) {}
    }
    function loadDraft() {
      var d;
      try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { d = null; }
      if (!d) return 0;
      form.querySelectorAll('input, select, textarea').forEach(function (i) {
        if (!i.name || !(i.name in d) || i.type === 'file') return;
        if (i.type === 'checkbox' || i.type === 'radio') i.checked = d[i.name].indexOf(i.value) !== -1;
        else i.value = d[i.name];
      });
      form.querySelectorAll('[name="resident_type"]').forEach(function (r) { r.dispatchEvent(new Event('change', { bubbles: true })); });
      if (d._started) startedAt = d._started;
      return d._step || 0;
    }

    // ---------- wizard: one section per screen ----------
    var steps = Array.prototype.slice.call(form.querySelectorAll(':scope > fieldset'));
    var step = 0;
    var top = el('div', 'wiz-top');
    var meta = el('div', 'wiz-meta'), count = el('span', 'wiz-count'), title = el('span', 'wiz-title');
    meta.appendChild(count); meta.appendChild(title);
    var bar = el('div', 'wiz-bar'), fill = el('i');
    bar.appendChild(fill); top.appendChild(meta); top.appendChild(bar);
    steps[0].parentNode.insertBefore(top, steps[0]);

    var actions = form.querySelector('.form-actions');
    var nav = el('div', 'wiz-nav');
    var back = el('button', 'btn btn-line', 'wiz_back'); back.type = 'button';
    var next = el('button', 'btn btn-primary', 'wiz_next'); next.type = 'button';
    nav.appendChild(back); nav.appendChild(next); nav.appendChild(btn);
    actions.parentNode.insertBefore(nav, actions.nextSibling);

    // 마지막 단계: 상대에게 보일 내 소개 카드 미리보기
    var pv = form.querySelector('[data-pcard]');
    function renderPreview() {
      if (!pv || !window.LokoCard) return;
      var row = {};
      new FormData(form).forEach(function (v, k) { if (!(v instanceof File)) row[k] = row[k] ? row[k] + ', ' + v : v; });
      pv.textContent = '';
      pv.appendChild(LokoCard.build(row, type, document.documentElement.getAttribute('data-lang') || 'en', photoData, { preview: true }));
    }

    // '한국어로 대화 가능'을 고르면 언어에 한국어도 체크
    form.addEventListener('change', function (e) {
      if (e.target.name === 'korean_level' && e.target.value === 'Conversational') {
        var k = form.querySelector('[name="languages"][value="Korean"]'); if (k) k.checked = true;
      }
    });

    function show(i, focus) {
      step = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (fs, j) { fs.hidden = j !== step; });
      var last = step === steps.length - 1;
      back.hidden = step === 0; next.hidden = last; btn.hidden = !last; actions.hidden = !last;
      count.textContent = (step + 1) + ' ' + T('wiz_of') + ' ' + steps.length;
      var lg = steps[step].querySelector('legend');
      title.textContent = lg ? lg.textContent.replace(/^\d+\.\s*/, '') : '';
      fill.style.width = ((step + 1) / steps.length * 100) + '%';
      if (last) renderPreview();
      if (window.LokoTrack) LokoTrack(type + '_step', { step: step + 1 });
      errBox.hidden = true;
      if (focus) {
        var y = top.getBoundingClientRect().top + window.pageYOffset - 76;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
    next.addEventListener('click', function () {
      var p = validate(steps[step]);
      if (p) { showError(p.msg, p.el); if (window.LokoTrack) LokoTrack(type + '_error', { step: step + 1, field: (p.el && p.el.name) || '' }); return; }
      show(step + 1, true); saveDraft();
    });
    back.addEventListener('click', function () { show(step - 1, true); });
    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);
    // Enter in a text box goes to the next step instead of submitting
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit' && !next.hidden) { e.preventDefault(); next.click(); }
    });

    var resume = loadDraft();
    syncConditional(); syncDates();
    show(resume, false);
    if (resume) {
      var note = el('p', 'note-soft', 'draft_note');
      top.parentNode.insertBefore(note, top.nextSibling);
      setTimeout(function () { note.remove(); }, 6000);
    }

    // ---------- submit ----------
    function collect() {
      var data = {};
      new FormData(form).forEach(function (v, k) {
        if (k === 'website' || v instanceof File) return;
        data[k] = data[k] ? data[k] + ', ' + v : v;
      });
      data.form_type = type;
      data.site_lang = document.documentElement.getAttribute('data-lang') || 'en';
      data.submitted_at = new Date().toISOString();
      data.fill_seconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : '';
      if (photoData) data.photo = photoData;
      return data;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errBox.hidden = true;
      for (var s = 0; s < steps.length; s++) {
        var p = validate(steps[s]);
        if (p) { show(s, false); showError(p.msg, p.el); return; }
      }
      if (!cfg.ENDPOINT) { showError(T('form_not_ready')); return; }

      var trap = form.querySelector('[name="website"]');
      if (trap && trap.value) { form.hidden = true; done.hidden = false; return; }

      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = T('sending');

      fetch(cfg.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(collect())
      }).then(function (r) {
        // 응답에 게시판 개인 링크 토큰이 옴 (읽지 못해도 신청은 접수된 것)
        return r.json().catch(function () { return {}; });
      }).then(function (res) {
        if (res && res.ok === false) throw new Error(res.error || 'fail');
        if (res && res.token) {
          try { localStorage.setItem('lokoi_board_t', res.token); } catch (e3) {}
          var bl = done.querySelector('[data-board-link]');
          if (bl) { bl.hidden = false; var ba = bl.querySelector('a'); if (ba) ba.href = 'board.html?t=' + encodeURIComponent(res.token); }
        }
        try { localStorage.removeItem(DRAFT); } catch (e2) {}
        form.hidden = true;
        var aside = document.querySelector('.form-aside');
        if (aside) aside.hidden = true;
        if (warn) warn.hidden = true;
        done.hidden = false;
        document.body.classList.add('form-done');
        if (window.LokoTrack) LokoTrack(type + '_submit', { lang: document.documentElement.getAttribute('data-lang') || 'en', photo: photoData ? 'yes' : 'no' });
        done.focus({ preventScroll: true });
        window.scrollTo({ top: Math.max(0, done.getBoundingClientRect().top + window.pageYOffset - 80), behavior: 'smooth' });
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = label;
        showError(T('err_send'));
      });
    });
  });
})();
