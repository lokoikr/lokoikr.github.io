// LoKo.i — form validation and submission to Google Apps Script
(function () {
  var cfg = window.LOKOI_CONFIG || {};
  var T = function (k) { return window.LOKOI_T ? window.LOKOI_T(k) : k; };

  document.querySelectorAll('[data-lk-form]').forEach(function (form) {
    var warn = document.querySelector('[data-endpoint-warning]');
    var errBox = form.querySelector('[data-form-error]');
    var done = document.querySelector('[data-form-done]');
    var btn = form.querySelector('button[type="submit"]');

    if (!cfg.ENDPOINT && warn) warn.hidden = false;

    // 혼자 여행이면 인원 1명으로 맞춤
    var withSel = form.querySelector('[name="travelling_with"]'), sizeSel = form.querySelector('[name="group_size"]');
    if (withSel && sizeSel) withSel.addEventListener('change', function () {
      if (withSel.value === 'Solo') sizeSel.value = '1';
      else if (sizeSel.value === '1') sizeSel.value = withSel.value === 'Group (5+)' ? '5+' : '2';
    });

    function showError(msg, focusEl) {
      errBox.textContent = msg;
      errBox.hidden = false;
      if (focusEl && focusEl.focus) focusEl.focus();
      else errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function validate() {
      // required single fields
      var fields = form.querySelectorAll('input[required], textarea[required], select[required]');
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var empty = f.type === 'checkbox' ? !f.checked : !String(f.value || '').trim();
        if (empty) {
          return { msg: f.type === 'checkbox' ? T('err_agree') : T('err_required'), el: f };
        }
        if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim())) {
          return { msg: T('err_email'), el: f };
        }
      }
      // at least one choice in required groups
      var groups = form.querySelectorAll('[data-required-group]');
      for (var g = 0; g < groups.length; g++) {
        if (!groups[g].querySelector('input:checked')) {
          return { msg: T('err_group'), el: groups[g].querySelector('input') };
        }
      }
      // dates
      var a = form.querySelector('[name="arrive"]'), l = form.querySelector('[name="leave"]');
      if (a && l && a.value && l.value && l.value < a.value) return { msg: T('err_dates'), el: l };
      // 여행자 신청서: 날짜·인원·국가 확인
      var now = new Date(), today = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
      var pd = form.querySelector('[name="preferred_date"]'), here = form.querySelector('[name="in_busan"]:checked');
      if (l && l.value && l.value < today) return { msg: T('err_past'), el: l };
      if (a && a.value && a.value < today && !(here && here.value === 'Already here')) return { msg: T('err_past'), el: a };
      if (pd && pd.value) {
        if (pd.value < today) return { msg: T('err_past'), el: pd };
        if (a && l && a.value && l.value && (pd.value < a.value || pd.value > l.value)) return { msg: T('err_range'), el: pd };
      }
      var w = form.querySelector('[name="travelling_with"]'), size = form.querySelector('[name="group_size"]'), kids = form.querySelector('[name="kids_ages"]');
      if (w && size && w.value === 'Solo' && size.value !== '1') return { msg: T('err_solo'), el: size };
      if (w && kids && w.value === 'Family with kids' && !kids.value.trim()) return { msg: T('err_kids'), el: kids };
      var country = form.querySelector('[name="country"]');
      if (country && /^\s*(south\s*)?korea\s*$|^\s*(republic of korea|rok|대한민국|한국|韓國|南韓|kr)\s*$/i.test(country.value)) return { msg: T('err_korea'), el: country };
      var pref = form.querySelector('[name="buddy_pref"]:checked'), g = form.querySelector('[name="gender"]:checked');
      if (pref && pref.value === 'Same gender' && (!g || g.value === 'Prefer not to say')) return { msg: T('err_gender'), el: g };
      return null;
    }

    function collect() {
      var data = {};
      new FormData(form).forEach(function (v, k) {
        if (k === 'website') return;
        data[k] = data[k] ? data[k] + ', ' + v : v;
      });
      data.form_type = form.getAttribute('data-lk-form');
      data.site_lang = document.documentElement.getAttribute('data-lang') || 'en';
      data.submitted_at = new Date().toISOString();
      return data;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errBox.hidden = true;

      var problem = validate();
      if (problem) { showError(problem.msg, problem.el); return; }

      if (!cfg.ENDPOINT) { showError(T('form_not_ready')); return; }

      // bot trap: real people never fill this hidden field
      var trap = form.querySelector('[name="website"]');
      if (trap && trap.value) { form.hidden = true; done.hidden = false; return; }

      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = T('sending');

      fetch(cfg.ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(collect())
      }).then(function () {
        form.hidden = true;
        if (warn) warn.hidden = true;
        done.hidden = false;
        done.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = label;
        showError(T('err_send'));
      });
    });
  });
})();
