/*
 * LoKo.i matching engine v0.2
 * 여행자 신청 1건마다 조건이 맞는 현지인을 점수(0~100)와 이유로 추천합니다.
 *
 *   꼭 맞아야 하는 조건 (안 맞으면 후보에서 제외)
 *     - 대화 언어가 하나 이상 겹칠 것 (한국어는 한국인 현지인 또는 한국어를 고른 외국인 거주자만)
 *     - 여행자가 '같은 성별'을 원하면 현지인 성별이 같을 것
 *     - 희망 날짜가 여행 기간(도착~출발) 안일 것
 *     - 일행 수가 현지인이 받을 수 있는 인원 이하일 것
 *     - (선택) 현지인이 신원 확인을 마쳤을 것 (status = 확인 완료)
 *
 *   점수 (합계 100)
 *     - 활동 40 · 지역 20 · 시간대 20 · 언어 수준 10 · 한국인 현지인 5 · 고르게 배분 5
 *   주의 표시(warnings): 신원 확인 전, 번역앱 수준, 아이 동반, 3명 이상 일행 등
 *
 * 브라우저에서는 window.LokoMatch, Node에서는 require('./match.js')로 씁니다.
 */
(function (root) {
  'use strict';

  var W = { activity: 40, area: 20, time: 20, level: 10, local: 5, balance: 5 };
  var VERIFIED = ['확인 완료', 'verified', 'Verified'];
  // 현지인이 사는 구 → 신청서의 지역 묶음
  var DISTRICT_AREA = {
    'Haeundae-gu': 'Haeundae / Centum', 'Suyeong-gu': 'Gwangalli / Suyeong', 'Nam-gu': 'Gwangalli / Suyeong',
    'Busanjin-gu': 'Seomyeon / Jeonpo', 'Jung-gu': 'Nampo / Jung-gu', 'Seo-gu': 'Nampo / Jung-gu', 'Dong-gu': 'Nampo / Jung-gu',
    'Yeongdo-gu': 'Yeongdo', 'Gijang-gun': 'Gijang / Songjeong',
    'Dongnae-gu': 'Seomyeon / Jeonpo', 'Yeonje-gu': 'Seomyeon / Jeonpo'
  };
  // 서로 가까운 지역 묶음 (지역이 정확히 안 맞아도 절반 점수)
  var NEAR = {
    'Haeundae / Centum': ['Gwangalli / Suyeong', 'Gijang / Songjeong'],
    'Gwangalli / Suyeong': ['Haeundae / Centum', 'Seomyeon / Jeonpo'],
    'Seomyeon / Jeonpo': ['Gwangalli / Suyeong', 'Nampo / Jung-gu'],
    'Nampo / Jung-gu': ['Yeongdo', 'Seomyeon / Jeonpo'],
    'Yeongdo': ['Nampo / Jung-gu'],
    'Gijang / Songjeong': ['Haeundae / Centum']
  };
  var DONE = ['연결 완료', '완료', '취소', '보류', '중지', 'done', 'cancelled'];  // '소개 보냄'은 아직 진행 중이라 포함 안 함

  // '2026-12-05', '2026. 12. 5', '2026/12/5' → '2026-12-05'
  function normDate(v) {
    var m = String(v || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }
  function groupSize(t) { var n = parseInt(t.group_size, 10); return isNaN(n) ? 1 : n; }
  function isKorean(l) { return !/foreign/i.test(l.resident_type || ''); }
  function speaksKoreanL(l) { return isKorean(l) || list(l.languages).indexOf('Korean') !== -1; }
  function wantsKids(t) { return /kids/i.test(t.travelling_with || '') || list(t.activities).indexOf('Kids & family') !== -1 || !!clean(t.kids_ages); }

  function list(v) {
    if (Array.isArray(v)) return v.map(clean).filter(Boolean);
    return String(v || '').split(',').map(clean).filter(Boolean);
  }
  function clean(s) { return String(s || '').trim(); }

  // 'Morning'/'Afternoon' → 낮, 'Evening' → 저녁 ; 날짜 → 평일/주말
  function wantedSlots(t) {
    var slots = list(t.time_slots);
    var d = normDate(t.preferred_date);
    var day = d ? new Date(d + 'T12:00:00') : null;
    var weekend = day && !isNaN(day) ? (day.getDay() === 0 || day.getDay() === 6) : null;
    var parts = slots.length ? slots : ['Morning', 'Afternoon', 'Evening'];
    var out = [];
    parts.forEach(function (s) {
      var evening = /evening/i.test(s);
      if (weekend === true) out.push('Weekend');
      else if (weekend === false) out.push(evening ? 'Weekday evening' : 'Weekday daytime');
      else out.push('Weekend', evening ? 'Weekday evening' : 'Weekday daytime');
    });
    return unique(out);
  }
  function unique(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function overlap(a, b) { return a.filter(function (x) { return b.indexOf(x) !== -1; }); }

  function scorePair(t, l, opts) {
    opts = opts || {};
    var reasons = [], blocks = [], warnings = [];

    // 1) 언어 (필수). 한국어는 한국인 현지인 또는 한국어를 고른 외국인 거주자와만 통함
    var tl = list(t.languages), ll = list(l.languages);
    if (clean(t.korean_level) === 'Conversational' && tl.indexOf('Korean') === -1) tl.push('Korean');
    if (speaksKoreanL(l) && ll.indexOf('Korean') === -1) ll.push('Korean');
    var common = overlap(tl, ll);
    var foreignOnly = overlap(common, ['English', 'Chinese', 'Japanese']);
    if (!common.length) blocks.push('대화 언어가 겹치지 않음');

    // 2) 성별 선호 (필수)
    if (/same/i.test(t.buddy_pref || '')) {
      var tg = clean(t.gender), lg = clean(l.gender);
      if (!tg || /prefer not/i.test(tg) || tg !== lg) blocks.push('같은 성별 조건 불일치');
    }

    // 2-1) 현지인이 '같은 성별만'을 골랐으면 여행자 성별이 같아야 함 (필수)
    if (/same/i.test(l.buddy_pref || '')) {
      var tg2 = clean(t.gender), lg2 = clean(l.gender);
      if (!lg2 || /prefer not/i.test(lg2) || tg2 !== lg2) blocks.push('현지인이 같은 성별만 원함');
    }

    // 3) 날짜가 여행 기간 안인지 (필수)
    var pd = normDate(t.preferred_date), ar = normDate(t.arrive), lv = normDate(t.leave);
    if (pd && ar && lv && (pd < ar || pd > lv)) blocks.push('희망 날짜가 여행 기간 밖');

    // 4) 일행 수 ≤ 현지인이 받을 수 있는 인원 (필수, 미기재면 4명까지)
    var size = groupSize(t), mg = clean(l.max_group), cap = /\+/.test(mg) ? 99 : (parseInt(mg, 10) || 4);
    if (size > cap) blocks.push('일행 ' + size + '명 > 현지인 가능 인원 ' + cap + '명');

    // 5) 신원 확인 (선택: 켜면 제외, 끄면 주의 표시)
    var verified = VERIFIED.indexOf(clean(l.status)) !== -1;
    if (opts.onlyVerified && !verified) blocks.push('신원 확인 전');
    else if (!verified) warnings.push('신원 확인 전 · 첫 만남 전 영상통화 필수');

    // 6) 활동
    var ta = list(t.activities), la = list(l.activities);
    var acts = overlap(ta, la);
    var actScore = ta.length ? W.activity * (acts.length / ta.length) : 0;
    if (acts.length) reasons.push('활동 ' + acts.length + '/' + ta.length + '개 일치 (' + acts.join(', ') + ')');
    if (wantsKids(t)) {
      if (la.indexOf('Kids & family') === -1) { actScore = Math.max(0, actScore - 10); warnings.push('아이 동반 · 현지인 아이 동행 미선택'); }
      else reasons.push('아이 동반 가능');
    }

    // 7) 지역: 여행자가 고른 지역 (없거나 '상관없음'이면 숙소 지역) ↔ 현지인이 잘 아는 지역 + 사는 구
    var picked = list(t.areas);
    var anywhere = !picked.length || picked.indexOf('Anywhere') !== -1;
    var stay = clean(t.stay_area);
    var useStay = anywhere && stay && ['Not decided', 'Other'].indexOf(stay) === -1;
    var tr = useStay ? [stay] : picked;
    var lr = list(l.areas);
    var home = DISTRICT_AREA[clean(l.home_district)];
    if (home && lr.indexOf(home) === -1) lr.push(home);
    var areaHit = overlap(tr, lr);
    var near = [];
    tr.forEach(function (a) { (NEAR[a] || []).forEach(function (n) { if (lr.indexOf(n) !== -1 && near.indexOf(a) === -1) near.push(a); }); });
    var areaScore;
    if (areaHit.length) areaScore = W.area;
    else if (useStay) areaScore = near.length ? W.area * 0.75 : W.area * 0.5;
    else if (anywhere) areaScore = W.area * 0.75;
    else areaScore = near.length ? W.area * 0.5 : 0;
    if (areaHit.length) reasons.push((useStay ? '여행자 숙소 근처' : '지역 일치') + ' (' + areaHit.join(', ') + ')');
    else if (near.length) reasons.push('가까운 지역 (' + near.join(', ') + ')');
    else if (anywhere) reasons.push('여행자 지역 상관없음');

    // 8) 시간대
    var want = wantedSlots(t), avail = list(l.availability);
    var timeHit = overlap(want, avail);
    var timeScore = !avail.length ? W.time * 0.4 : (timeHit.length ? W.time : 0);
    if (timeHit.length) reasons.push('시간 가능 (' + timeHit.join(', ') + ')');
    else if (avail.length) reasons.push('시간대 확인 필요');

    // 9) 언어 수준: 한국어로 통하면 만점, 외국어로만 통하면 현지인 수준대로
    var lvl = { Fluent: 1, Conversational: 0.7, Basic: 0.3 }[clean(l.language_level)] || 0.5;
    var viaKorean = common.indexOf('Korean') !== -1;
    var levelScore = viaKorean ? W.level : W.level * lvl;
    if (common.length) reasons.push(common.join('·') + ' 가능' + (foreignOnly.length ? ' (' + (l.language_level || '수준 미기재') + ')' : ''));
    if (!viaKorean && clean(l.language_level) === 'Basic') warnings.push('현지인 외국어 기초 · 번역앱 필요');

    // 10) 한국인 현지인 우선 (진짜 로컬 경험). 외국인 거주자는 같은 나라 여행자면 0점
    var localScore = W.local;
    if (!isKorean(l)) {
      var same = clean(l.nationality) && clean(t.country) && clean(l.nationality).toLowerCase() === clean(t.country).toLowerCase();
      localScore = same ? 0 : W.local * 0.4;
      reasons.push('외국인 거주자' + (clean(l.nationality) ? ' (' + clean(l.nationality) + ')' : ''));
      if (same) warnings.push('현지인이 여행자와 같은 나라 출신 · 한국인 현지인 우선 검토');
    }
    if (size >= 3) warnings.push('일행 ' + size + '명');

    // 11) 고르게 배분: 이미 맡은 연결이 많으면 감점
    var load = Number(opts.load && opts.load[l.id]) || 0;
    var balanceScore = Math.max(0, W.balance - load * 2.5);

    var total = Math.round(actScore + areaScore + timeScore + levelScore + localScore + balanceScore);
    return {
      travelerId: t.id, localId: l.id, localName: l.name,
      score: blocks.length ? 0 : total, eligible: !blocks.length,
      reasons: reasons, blocks: blocks, warnings: warnings,
      parts: { activity: Math.round(actScore), area: Math.round(areaScore), time: Math.round(timeScore), level: Math.round(levelScore), local: Math.round(localScore), balance: Math.round(balanceScore) }
    };
  }

  // 이미 연결 끝났거나 날짜가 지난 신청은 매칭 대상에서 뺌
  function active(rows, today, isTraveler) {
    return rows.filter(function (r) {
      if (DONE.indexOf(clean(r.status)) !== -1) return false;
      if (isTraveler && today) { var end = normDate(r.leave) || normDate(r.preferred_date); if (end && end < today) return false; }
      return true;
    });
  }

  // 여행자마다 상위 N명 추천
  function recommend(travelers, locals, opts) {
    opts = opts || {};
    var top = opts.top || 3;
    return travelers.map(function (t) {
      var all = locals.map(function (l) { return scorePair(t, l, opts); });
      var ok = all.filter(function (r) { return r.eligible; }).sort(function (a, b) { return b.score - a.score; });
      return { traveler: t, picks: ok.slice(0, top), excluded: all.filter(function (r) { return !r.eligible; }) };
    });
  }

  // 전체 배정안: 점수 높은 쌍부터. 현지인은 같은 날 1건, 전체 최대 maxPerLocal건(기본 2)
  // 여행 기간 안 다른 날짜도 후보로 넣되 10점 깎아서, 희망 날짜가 우선이고
  // 희망 날짜 후보가 훨씬 나쁠 때만 '날짜 조정 제안'이 이깁니다.
  function dayList(t, today) {
    var ar = normDate(t.arrive), lv = normDate(t.leave), out = [];
    if (!ar || !lv) return out;
    var d = new Date(ar + 'T12:00:00'), endD = new Date(lv + 'T12:00:00');
    for (var i = 0; i < 14 && d <= endD; i++, d.setDate(d.getDate() + 1)) {
      var ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      if (!today || ds >= today) out.push(ds);
    }
    return out;
  }
  function assign(travelers, locals, opts) {
    opts = opts || {};
    var minScore = opts.minScore || 40, maxPer = opts.maxPerLocal || 2, ALT = 10;
    var pairs = [];
    travelers.forEach(function (t) {
      var pd = normDate(t.preferred_date);
      locals.forEach(function (l) {
        var r = scorePair(t, l, opts);
        r.date = pd;
        if (r.eligible && r.score >= minScore) pairs.push(r);
        // 희망 날짜가 기간 밖이거나 다른 날이 더 나을 수 있으니 기간 안 다른 날짜도 후보로
        dayList(t, opts.today).forEach(function (ds) {
          if (ds === pd) return;
          var t2 = {}; Object.keys(t).forEach(function (k) { t2[k] = t[k]; }); t2.preferred_date = ds;
          var a = scorePair(t2, l, opts);
          if (!a.eligible || a.score - ALT < minScore) return;
          a.score -= ALT; a.date = ds; a.altDate = ds;
          a.warnings.push('날짜 조정 제안: ' + (pd || '?') + ' → ' + ds);
          pairs.push(a);
        });
      });
    });
    pairs.sort(function (a, b) { return b.score - a.score || (a.altDate ? 1 : 0) - (b.altDate ? 1 : 0); });
    var takenT = {}, busy = {}, count = {}, out = [];
    pairs.forEach(function (p) {
      var key = p.localId + '|' + p.date;
      if (takenT[p.travelerId] || busy[key] || (count[p.localId] || 0) >= maxPer) return;
      takenT[p.travelerId] = true; busy[key] = true; count[p.localId] = (count[p.localId] || 0) + 1; out.push(p);
    });
    var unmatched = travelers.filter(function (t) { return !takenT[t.id]; }).map(function (t) { return t.id; });
    return { matches: out, unmatched: unmatched };
  }

  // 구글 시트에서 내려받은 CSV → 객체 배열
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (x) { return clean(x); }); });
    if (!rows.length) return [];
    var head = rows[0].map(clean);
    return rows.slice(1).map(function (r, idx) {
      var o = {};
      head.forEach(function (h, j) { o[h] = clean(r[j]); });
      if (!o.id) o.id = (o.name || 'row') + '-' + (idx + 2);
      return o;
    });
  }

  var api = { scorePair: scorePair, recommend: recommend, assign: assign, active: active, normDate: normDate, parseCSV: parseCSV, weights: W };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LokoMatch = api;
})(this);
