/*
 * LoKo.i matching engine v0.1
 * 여행자 신청 1건마다 조건이 맞는 현지인을 점수(0~100)와 이유로 추천합니다.
 *
 *   꼭 맞아야 하는 조건 (안 맞으면 후보에서 제외)
 *     - 대화 언어가 하나 이상 겹칠 것 (여행자가 한국어를 하면 모든 현지인 가능)
 *     - 여행자가 '같은 성별'을 원하면 현지인 성별이 같을 것
 *     - (선택) 현지인이 신원 확인을 마쳤을 것 (status = 확인 완료)
 *
 *   점수 (합계 100)
 *     - 활동 겹침 45 · 지역 20 · 시간대 20 · 언어 수준 10 · 고르게 배분 5
 *
 * 브라우저에서는 window.LokoMatch, Node에서는 require('./match.js')로 씁니다.
 */
(function (root) {
  'use strict';

  var W = { activity: 45, area: 20, time: 20, level: 10, balance: 5 };
  var VERIFIED = ['확인 완료', 'verified', 'Verified'];

  function list(v) {
    if (Array.isArray(v)) return v.map(clean).filter(Boolean);
    return String(v || '').split(',').map(clean).filter(Boolean);
  }
  function clean(s) { return String(s || '').trim(); }

  // 'Morning'/'Afternoon' → 낮, 'Evening' → 저녁 ; 날짜 → 평일/주말
  function wantedSlots(t) {
    var slots = list(t.time_slots);
    var day = t.preferred_date ? new Date(t.preferred_date + 'T12:00:00') : null;
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
    var reasons = [], blocks = [];

    // 1) 언어 (필수)
    var tl = list(t.languages), ll = list(l.languages);
    var common = overlap(tl, ll);
    var speaksKorean = tl.indexOf('Korean') !== -1;
    if (!common.length && !speaksKorean) blocks.push('대화 언어가 겹치지 않음');

    // 2) 성별 선호 (필수)
    if (/same/i.test(t.buddy_pref || '')) {
      var tg = clean(t.gender), lg = clean(l.gender);
      if (!tg || /prefer not/i.test(tg) || tg !== lg) blocks.push('같은 성별 조건 불일치');
    }

    // 3) 신원 확인 (선택)
    if (opts.onlyVerified && VERIFIED.indexOf(clean(l.status)) === -1) blocks.push('신원 확인 전');

    // 4) 활동
    var ta = list(t.activities), la = list(l.activities);
    var acts = overlap(ta, la);
    var actScore = ta.length ? W.activity * (acts.length / ta.length) : 0;
    if (acts.length) reasons.push('활동 ' + acts.length + '/' + ta.length + '개 일치 (' + acts.join(', ') + ')');

    // 5) 지역
    var tr = list(t.areas), lr = list(l.areas);
    var areaHit = overlap(tr, lr);
    var anywhere = !tr.length || tr.indexOf('Anywhere') !== -1;
    var areaScore = anywhere ? W.area * 0.75 : (areaHit.length ? W.area : 0);
    if (areaHit.length) reasons.push('지역 일치 (' + areaHit.join(', ') + ')');
    else if (anywhere) reasons.push('여행자 지역 상관없음');

    // 6) 시간대
    var want = wantedSlots(t), avail = list(l.availability);
    var timeHit = overlap(want, avail);
    var timeScore = !avail.length ? W.time * 0.4 : (timeHit.length ? W.time : 0);
    if (timeHit.length) reasons.push('시간 가능 (' + timeHit.join(', ') + ')');
    else if (avail.length) reasons.push('시간대 확인 필요');

    // 7) 언어 수준
    var lvl = { Fluent: 1, Conversational: 0.7, Basic: 0.3 }[clean(l.language_level)] || 0.5;
    var levelScore = speaksKorean && !common.length ? W.level : W.level * lvl;
    if (common.length) reasons.push(common.join('·') + ' 가능 (' + (l.language_level || '수준 미기재') + ')');

    // 8) 고르게 배분: 이미 맡은 연결이 많으면 감점
    var load = Number(opts.load && opts.load[l.id]) || 0;
    var balanceScore = Math.max(0, W.balance - load * 2.5);

    var total = Math.round(actScore + areaScore + timeScore + levelScore + balanceScore);
    return {
      travelerId: t.id, localId: l.id, localName: l.name,
      score: blocks.length ? 0 : total, eligible: !blocks.length,
      reasons: reasons, blocks: blocks,
      parts: { activity: Math.round(actScore), area: Math.round(areaScore), time: Math.round(timeScore), level: Math.round(levelScore), balance: Math.round(balanceScore) }
    };
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

  // 전체 배정안: 점수 높은 쌍부터, 현지인은 같은 날짜에 1건만
  function assign(travelers, locals, opts) {
    opts = opts || {};
    var pairs = [];
    travelers.forEach(function (t) {
      locals.forEach(function (l) {
        var r = scorePair(t, l, opts);
        if (r.eligible && r.score >= (opts.minScore || 40)) pairs.push(r);
      });
    });
    pairs.sort(function (a, b) { return b.score - a.score; });
    var dateOf = {}; travelers.forEach(function (t) { dateOf[t.id] = t.preferred_date || ''; });
    var takenT = {}, busy = {}, out = [];
    pairs.forEach(function (p) {
      var key = p.localId + '|' + dateOf[p.travelerId];
      if (takenT[p.travelerId] || busy[key]) return;
      takenT[p.travelerId] = true; busy[key] = true; out.push(p);
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

  var api = { scorePair: scorePair, recommend: recommend, assign: assign, parseCSV: parseCSV, weights: W };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LokoMatch = api;
})(this);
