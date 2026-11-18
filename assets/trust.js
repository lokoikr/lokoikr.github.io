/*
 * LoKo.i 신청자 점검 (운영자용)
 * 신청 한 건마다 '정상 / 확인 필요 / 의심'과 이유를 돌려줍니다.
 * 자동으로 거절하지 않아요. 운영자가 영상통화·DM으로 확인할 때 참고용입니다.
 *
 *   check(row, type, allRowsOfSameType) → { level: 'ok'|'check'|'risk', flags: [{ level, msg }] }
 *   type: 'traveler' | 'local'
 */
(function (root) {
  'use strict';

  var DISPOSABLE = ['mailinator.', 'guerrillamail.', '10minutemail.', 'tempmail', 'temp-mail.', 'yopmail.', 'trashmail.',
    'sharklasers.', 'getnada.', 'dispostable.', 'maildrop.', 'throwawaymail.', 'fakeinbox.', 'mintemail.', 'emailondeck.'];
  // 데이트·성적 목적 표현 (서비스 원칙 위반 → 의심)
  var DATING = /\b(dat(e|ing)|girl ?friend|boy ?friend|gf|bf|sexy|hook ?up|one night|romance|massage|(pretty|beautiful|cute|hot|sexy|single)\s+(\w+\s+)?(girls?|lady|ladies|wom[ae]n|guys?|boys?))\b|여친|남친|애인|연애|섹시|원나잇|데이트|이쁜 ?여자|예쁜 ?여자|约会|女朋友|男朋友|约炮|美女|一夜/i;
  // 돈 요구 (현지인은 무료 활동만)
  var MONEY = /\b(fee|charge|price|paid tour|pay me|per hour|per person|tips? (only|welcome)|\$ ?\d+|usd|krw)\b|\d+ ?(원|만원|만 원)|수고비|가이드비|대가|돈 ?(받|주)|유료|收费|费用|付钱|小费/i;
  // 밤 술자리·숙소 (안전 규칙과 충돌 가능)
  var NIGHT = /\b(bars?|club|clubbing|nightlife|pub crawl|drinks?|drinking|soju|beer|my place|my home|hotel)\b|술 ?마시|클럽|헌팅|호텔|우리 ?집|숙소로|喝酒|夜店|酒吧|酒店房间/i;
  // 자유 기재란에 연락처·링크 (운영자를 거치지 않고 직접 연락 유도)
  var CONTACT = /(https?:\/\/|www\.|open\.kakao|t\.me\/|wa\.me\/|line\.me|kakao ?(id|톡 ?아이디)|카톡 ?아이디|\b\d{2,3}[- .]?\d{3,4}[- .]?\d{4}\b|@[a-z0-9_.]{3,})/i;
  var MASH = /^(asdf|qwer|zxcv|test|aaa+|abc|xxx+|ㅁㄴㅇㄹ|ㅋㅋ+|1234)/i;

  function clean(s) { return String(s || '').trim(); }
  function normDate(v) {
    var m = String(v || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
  }
  function days(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }

  function check(r, type, all, opts) {
    opts = opts || {};
    var flags = [];
    function add(level, msg) { flags.push({ level: level, msg: msg }); }
    var text = [r.details, r.intro, r.about_me, r.notes].map(clean).join(' \n ');
    var email = clean(r.email).toLowerCase(), name = clean(r.name);

    // 1) 이름·이메일
    if (name.length < 2 || /\d/.test(name) || MASH.test(name)) add('risk', '이름이 이상함 (' + (name || '없음') + ')');
    if (DISPOSABLE.some(function (d) { return email.indexOf('@' + d) !== -1 || email.indexOf('.' + d) !== -1; })) add('risk', '일회용 이메일');
    else if (MASH.test(email)) add('check', '이메일 확인 필요');

    // 2) 작성 시간 (사람은 보통 1분 이상)
    var secs = Number(r.fill_seconds);
    if (secs && secs < 20) add('risk', '작성 ' + secs + '초 · 자동 입력(봇) 의심');

    // 3) 중복 신청
    if (all && all.length) {
      var dup = all.filter(function (o) {
        if (o === r || (o.id && o.id === r.id)) return false;
        return (email && clean(o.email).toLowerCase() === email) || (clean(r.contact_id) && clean(o.contact_id) === clean(r.contact_id));
      }).length;
      if (dup) add('check', '같은 이메일·연락처로 ' + (dup + 1) + '번 신청');
    }

    // 4) 자유 기재란 내용
    if (DATING.test(text)) add('risk', '데이트·이성 만남 목적 표현');
    if (MONEY.test(text)) add(type === 'local' ? 'risk' : 'check', type === 'local' ? '현지인이 돈·대가를 언급' : '돈 관련 표현 · 확인');
    if (NIGHT.test(text)) add('check', '술자리·숙소 관련 표현 · 안전 규칙 안내 필요');
    if (CONTACT.test(text)) add('check', '자유 기재란에 연락처·링크');

    // 5) 사진
    if (!clean(r.photo_id)) add(type === 'local' ? 'check' : 'info', '사진 없음');

    if (type === 'local') {
      if (clean(r.intro).length < 20) add('check', '자기소개가 너무 짧음');
      if (/foreign/i.test(r.resident_type || '') && !clean(r.nationality)) add('check', '외국인 거주자인데 국적 없음');
      if (!clean(r.instagram)) add('info', '인스타 없음 · 영상통화로 확인');
    } else {
      if (!clean(r.about_me)) add('info', '여행자 자기소개 없음');
      var ar = normDate(r.arrive), lv = normDate(r.leave), sub = normDate(r.submitted_at) || opts.today;
      if (ar && lv && days(ar, lv) > 60) add('check', '체류 ' + days(ar, lv) + '일 · 거주자일 수 있음');
      if (ar && sub && days(sub, ar) > 300) add('check', '도착이 ' + days(sub, ar) + '일 뒤 · 너무 먼 일정');
    }

    var level = flags.some(function (f) { return f.level === 'risk'; }) ? 'risk'
      : flags.some(function (f) { return f.level === 'check'; }) ? 'check' : 'ok';
    return { level: level, flags: flags };
  }

  // 같은 사람이 여러 번 신청하면 가장 최근 것만 매칭에 씀
  function dedupe(rows) {
    var seen = {}, keep = [], dropped = [];
    rows.slice().sort(function (a, b) { return String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')) || String(b.id).localeCompare(String(a.id)); })
      .forEach(function (r) {
        var keys = [clean(r.email).toLowerCase(), clean(r.contact_id)].filter(Boolean);
        if (keys.some(function (k) { return seen[k]; })) { dropped.push(r); return; }
        keys.forEach(function (k) { seen[k] = true; }); keep.push(r);
      });
    return { keep: keep, dropped: dropped };
  }

  var LABEL = { ok: '정상', check: '확인 필요', risk: '의심' };
  var api = { check: check, dedupe: dedupe, LABEL: LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LokoTrust = api;
})(this);
