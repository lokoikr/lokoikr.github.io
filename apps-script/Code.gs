/**
 * LoKo.i 웹사이트 신청서 → 구글 시트 저장
 *
 * 설치 방법은 README.md의 "신청서 연결하기"를 보세요.
 * 1) 구글 시트를 새로 만들고  확장 프로그램 › Apps Script 를 엽니다.
 * 2) 이 파일 내용을 통째로 붙여 넣고 NOTIFY_EMAIL 을 바꾼 뒤 저장합니다.
 * 3) 배포 › 새 배포 › 유형: 웹 앱
 *      - 다음 사용자로 실행: 나
 *      - 액세스 권한: 모든 사용자
 *    → 나온 웹 앱 URL(…/exec)을 사이트의 assets/config.js 의 ENDPOINT 에 붙여 넣습니다.
 */

// 신청이 쌓일 구글 시트 ID ('LoKo.i 웹 신청'). 시트에 붙인 스크립트라면 비워 둬도 됩니다.
var SHEET_ID = '1jZOIlaSQCYWU8hBX6WYtaPy2mx2bSvgXQ76F7TK8V9A';

// 새 신청이 오면 알림 메일을 받을 주소 (비워 두면 메일을 보내지 않음)
var NOTIFY_EMAIL = '';

function book_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
}

// 시트별 열 순서 (여기 없는 항목은 맨 뒤에 자동으로 추가됩니다)
var COLUMNS = {
  traveler: ['submitted_at', 'status', 'name', 'country', 'age_range', 'email', 'contact_method', 'contact_id',
    'in_busan', 'first_visit', 'arrive', 'leave', 'travelling_with', 'group_size', 'kids_ages',
    'activities', 'details', 'areas', 'stay_area', 'preferred_date', 'time_slots', 'languages', 'korean_level', 'buddy_pref', 'gender',
    'about_me', 'budget', 'notes', 'photo_id', 'source', 'photo_ok', 'agree_privacy', 'agree_share', 'board_public', 'agree_safety', 'agree_adult',
    'site_lang', 'fill_seconds'],
  local: ['submitted_at', 'status', 'name', 'name_en', 'age_range', 'resident_type', 'nationality', 'busan_years', 'occupation', 'gender', 'home_district', 'max_group', 'email', 'contact_id', 'instagram',
    'areas', 'activities', 'languages', 'language_level', 'availability', 'frequency', 'buddy_pref', 'fav_spot', 'intro', 'photo_id',
    'board_public', 'board_note', 'source', 'agree_privacy', 'agree_share', 'agree_safety', 'agree_id', 'agree_adult', 'site_lang', 'fill_seconds']
};
COLUMNS.apply = ['applied_at', 'status', 'from_id', 'from_type', 'from_name', 'to_id', 'to_type', 'to_name', 'message', 'message_tr', 'to_lang'];
var SHEET_NAMES = { traveler: '여행자 신청', local: '현지인 등록', apply: '게시판 지원' };

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    if (data.action === 'board_apply') return json_(boardApply_(data));
    if (data.action === 'board_link') return json_(boardLink_(data));
    if (data.action === 'board_visibility') return json_(boardVisibility_(data));
    var type = data.form_type === 'local' ? 'local' : 'traveler';
    if (data.website) return json_({ ok: true }); // 봇 차단용 숨은 칸

    data.status = '신규';
    // 서버가 정하는 칸은 보낸 값을 버림 (번역 캐시·개인 링크 조작 방지)
    Object.keys(data).forEach(function (k) { if (/^(board_token|note_(ko|en|zh)|details_(ko|en))$/.test(k)) delete data[k]; });
    data.board_token = newToken_();

    // 사진: 브라우저에서 줄인 JPEG(data URL) → 드라이브 'LoKo.i 신청 사진' 폴더에 저장, 시트엔 파일 ID만
    if (data.photo) {
      try { data.photo_id = savePhoto_(data.photo, type, data.name); } catch (err) { data.photo_id = '저장 실패: ' + err; }
    }
    delete data.photo;
    var sheet = getSheet_(type);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // 시트에 없는 새 항목이 들어오면 열 추가
    Object.keys(data).forEach(function (k) {
      if (k === 'form_type' || k === 'website') return;
      if (headers.indexOf(k) === -1) {
        headers.push(k);
        sheet.getRange(1, headers.length).setValue(k).setFontWeight('bold');
      }
    });

    var row = headers.map(function (h) {
      var v = data[h] == null ? '' : String(data[h]);
      // 수식 주입 방지: = + - @ 로 시작하면 앞에 ' 를 붙임
      if (/^[=+\-@]/.test(v)) v = "'" + v;
      return v.slice(0, 2000);
    });
    // 모든 칸을 '일반 텍스트'로 저장: 날짜(2026-12-05)가 시트 날짜로 바뀌거나
    // 전화번호 010… 의 앞자리 0이 사라지는 문제 방지
    var range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length);
    range.setNumberFormat('@');
    range.setValues([row]);

    if (NOTIFY_EMAIL) {
      var who = (data.name || '') + (data.country ? ' (' + data.country + ')' : '');
      MailApp.sendEmail(NOTIFY_EMAIL,
        '[LoKo.i] 새 ' + SHEET_NAMES[type] + ': ' + who,
        '시트에서 확인하세요: ' + book_().getUrl());
    }
    return json_({ ok: true, token: data.board_token });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 매칭 관리 화면용: 관리자 키가 맞을 때만 신청 목록(또는 사진 1장)을 돌려줌
function doGet(e) {
  if (e && e.parameter && e.parameter.board) return json_(board_(e.parameter));
  var key = e && e.parameter && e.parameter.key;
  var adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || !adminKey || key !== adminKey) return json_({ ok: true, service: 'LoKo.i forms' });
  if (e.parameter.photo) return json_(photo_(e.parameter.photo));
  return json_({ ok: true, travelers: rows_('traveler'), locals: rows_('local'), applications: rows_('apply') });
}

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) {} }
  var folder = DriveApp.createFolder('LoKo.i 신청 사진');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function savePhoto_(dataUrl, type, name) {
  var m = String(dataUrl).match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('이미지 형식 아님');
  var bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 3 * 1024 * 1024) throw new Error('3MB 초과');
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  var safe = String(name || '').replace(/[^\w가-힣 ]/g, '').slice(0, 30);
  var file = photoFolder_().createFile(Utilities.newBlob(bytes, m[1], (type === 'local' ? '현지인' : '여행자') + '_' + stamp + '_' + safe + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2])));
  return file.getId();
}

// 우리 사진 폴더 안의 파일만 돌려줌
function photo_(id) {
  try {
    var file = DriveApp.getFileById(id);
    var folderId = photoFolder_().getId(), inFolder = false, parents = file.getParents();
    while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
    if (!inFolder) return { ok: false, error: 'not found' };
    var blob = file.getBlob();
    return { ok: true, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  } catch (err) {
    return { ok: false, error: 'not found' };
  }
}

function rows_(type) {
  var sheet = getSheet_(type);
  var values = sheet.getDataRange().getDisplayValues();
  var head = values.shift() || [];
  // id는 시트의 줄 번호(T5 = 5번째 줄). 빈 줄이 있어도 번호가 밀리지 않게 먼저 번호를 붙이고 거름
  return values.map(function (r, i) {
    var o = { id: type[0].toUpperCase() + (i + 2), _blank: r.join('') === '' };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  }).filter(function (o) { var b = o._blank; delete o._blank; return !b; });
}

function getSheet_(type) {
  var ss = book_();
  var name = SHEET_NAMES[type];
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, COLUMNS[type].length).setValues([COLUMNS[type]]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 설치 확인용: Apps Script 편집기에서 이 함수를 한 번 실행하면 두 시트가 만들어집니다.
function setup() {
  getSheet_('traveler');
  getSheet_('local');
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', Utilities.getUuid());
  photoFolder_();
  Logger.log('매칭 관리 화면 키: ' + props.getProperty('ADMIN_KEY'));
  Logger.log('사진 폴더: ' + photoFolder_().getUrl());
}

/* ───────── LoKo.i 게시판: 여행인 ↔ 현지인 (공개) ─────────
 * - 신청서를 낸 사람이 '게시판 공개'(board_public = Yes)를 고르면 글이 공개 게시판에 올라갑니다.
 *   이름·사진·연락처·자기소개는 절대 보내지 않습니다. 현지인 글은 신원 확인(확인 완료) 뒤에만 보여요.
 * - 신청서를 내면 개인 링크(board.html?t=토큰)가 생겨요. 이 링크로 상대편 글에 "같이 해요"를 누릅니다.
 *   여행인 → 현지인 글, 현지인 → 여행인 글만 가능하고, 매칭 엔진의 필수 조건(언어·성별·인원·날짜)이 맞아야 해요.
 * - 글의 한마디(여행인: details, 현지인: board_note)는 연락처를 지우고 구글 번역(ko/en/zh-TW)으로 바꿔 시트에 저장해 둡니다.
 * - 같은 프로젝트의 Lib.gs(매칭 엔진·신청자 점검)를 씁니다.
 */
var BOARD_URL = 'https://lokoikr.github.io/board.html';
var VERIFIED_STATUS = ['확인 완료', 'verified', 'Verified'];
var BOARD_LANGS = { ko: 'ko', en: 'en', zh: 'zh-TW' };
var POST_FIELDS = {
  traveler: ['country', 'age_range', 'travelling_with', 'group_size', 'kids_ages', 'first_visit', 'arrive', 'leave', 'preferred_date',
    'time_slots', 'areas', 'stay_area', 'activities', 'languages', 'korean_level'],
  local: ['resident_type', 'nationality', 'age_range', 'busan_years', 'areas', 'activities', 'availability', 'frequency',
    'languages', 'language_level', 'max_group']
};

function newToken_() { return Utilities.getUuid().replace(/-/g, ''); }
function isVerified_(row) { return VERIFIED_STATUS.indexOf(String(row.status || '').trim()) !== -1; }
function isPublic_(row) { return /^yes$/i.test(String(row.board_public || '').trim()); }
function typeOf_(id) { return String(id).charAt(0) === 'L' ? 'local' : 'traveler'; }
function firstName_(name) { return String(name || '').trim().split(/\s+/)[0]; }

// 연락처로 보이는 것(이메일·전화·@아이디·링크·메신저 ID)을 지움
function scrubContacts_(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[link removed]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[contact removed]')
    .replace(/(^|\s)@[\w.]{2,}/g, '$1[contact removed]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[contact removed]')
    .replace(/(^|[^a-z])(kakao(talk)?|line|whatsapp|wechat|telegram|ig|insta(gram)?|카톡|카카오톡?|라인)\s*(id\s*[:：]?|[:：])\s*[\w.-]{3,}/gi, '$1[contact removed]')
    .replace(/(카톡|카카오톡?|라인|위챗)\s*(아이디)?\s*[:：]?\s*[a-z0-9_.-]{3,}/gi, '[contact removed]')
    .trim();
}

// 순수 함수: 공개 게시판 글 (테스트: tests/board.test.js)
function boardPosts_(travelers, locals, today) {
  var M = LokoMatch, T = LokoTrust;
  var tr = T.dedupe(M.active(travelers, today, true).filter(function (t) {
    return isPublic_(t) && T.check(t, 'traveler', travelers).level !== 'risk';
  })).keep;
  var lo = T.dedupe(M.active(locals, '', false).filter(function (l) {
    return isPublic_(l) && isVerified_(l) && T.check(l, 'local', locals).level !== 'risk';
  })).keep;
  function post(row, type) {
    var p = { id: row.id, type: type, posted: String(row.submitted_at || '').slice(0, 10) };
    POST_FIELDS[type].forEach(function (f) { if (row[f]) p[f] = row[f]; });
    p.note_src = scrubContacts_(type === 'traveler' ? row.details : row.board_note);
    return p;
  }
  return tr.map(function (t) { return post(t, 'traveler'); }).concat(lo.map(function (l) { return post(l, 'local'); }))
    .sort(function (a, b) { return a.posted < b.posted ? 1 : a.posted > b.posted ? -1 : 0; });
}

// 개인 링크 → 내 신청 줄
function me_(token, travelers, locals) {
  if (!token || String(token).length < 20) return null;
  var t = travelers.filter(function (r) { return r.board_token === token; })[0];
  if (t) return { row: t, type: 'traveler' };
  var l = locals.filter(function (r) { return r.board_token === token; })[0];
  return l ? { row: l, type: 'local' } : null;
}

// 내가 이 글에 "같이 해요"를 누를 수 있는지 (여행인↔현지인, 필수 조건)
function canJoin_(me, post, travelers, locals, today) {
  if (post.type === me.type) return { ok: false, why: 'same' };
  if (me.type === 'local' && !isVerified_(me.row)) return { ok: false, why: 'unverified' };
  if (me.type === 'traveler') {
    if (!LokoMatch.active([me.row], today, true).length || LokoTrust.check(me.row, 'traveler', travelers).level === 'risk') return { ok: false, why: 'inactive' };
  } else if (!LokoMatch.active([me.row], '', false).length) return { ok: false, why: 'inactive' };
  var other = (post.type === 'traveler' ? travelers : locals).filter(function (r) { return r.id === post.id; })[0];
  if (!other) return { ok: false, why: 'closed' };
  var t = me.type === 'traveler' ? me.row : other, l = me.type === 'local' ? me.row : other;
  var r = LokoMatch.scorePair(t, l, {});
  return r.eligible ? { ok: true, score: r.score } : { ok: false, why: 'fit' };
}

function langOf_(row) { var l = String(row.site_lang || '').toLowerCase(); return BOARD_LANGS[l] ? l : 'en'; }

function translateNotes_(posts, lang, rowsById) {
  var col = 'note_' + lang;
  posts.forEach(function (p) {
    if (!p.note_src) return;
    var cached = rowsById[p.id] && rowsById[p.id][col];
    if (!cached) {
      try { cached = LanguageApp.translate(p.note_src, '', BOARD_LANGS[lang]); setCell_(p.type, p.id, col, cached); }
      catch (err) { cached = ''; }
    }
    p.note = cached || p.note_src;
  });
}

function board_(params) {
  var lang = BOARD_LANGS[params.lang] ? params.lang : 'en';
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var travelers = rows_('traveler'), locals = rows_('local');
  var posts = boardPosts_(travelers, locals, today);
  var byId = {}; travelers.concat(locals).forEach(function (r) { byId[r.id] = r; });
  translateNotes_(posts, lang, byId);
  var out = { ok: true, lang: lang, posts: posts };
  if (params.t) {
    var me = me_(params.t, travelers, locals);
    if (!me) out.bad_token = true;
    else {
      var fit = {};
      posts.forEach(function (p) { var c = canJoin_(me, p, travelers, locals, today); fit[p.id] = c.ok ? c.score : c.why; });
      out.me = { id: me.row.id, type: me.type, name: firstName_(me.row.name), public: isPublic_(me.row), verified: me.type === 'traveler' || isVerified_(me.row), fit: fit,
        applied: rows_('apply').filter(function (a) { return a.from_id === me.row.id; }).map(function (a) { return a.to_id; }) };
    }
  }
  return out;
}

function boardApply_(data) {
  var travelers = rows_('traveler'), locals = rows_('local');
  var me = me_(data.token, travelers, locals);
  if (!me) return { ok: false, error: 'invalid' };
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var post = boardPosts_(travelers, locals, today).filter(function (p) { return p.id === data.post_id; })[0];
  if (!post) return { ok: false, error: 'closed' };
  var c = canJoin_(me, post, travelers, locals, today);
  if (!c.ok) return { ok: false, error: c.why };
  if (rows_('apply').some(function (a) { return a.from_id === me.row.id && a.to_id === post.id; })) return { ok: true, dup: true };
  var other = (post.type === 'traveler' ? travelers : locals).filter(function (r) { return r.id === post.id; })[0];
  var msg = scrubContacts_(data.message).slice(0, 500);
  var toLang = BOARD_LANGS[langOf_(other)], tr = '';
  if (msg) { try { tr = LanguageApp.translate(msg, '', toLang); } catch (err) {} }
  var row = { applied_at: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'), status: '신규',
    from_id: me.row.id, from_type: me.type, from_name: me.row.name, to_id: other.id, to_type: post.type, to_name: other.name,
    message: msg, message_tr: tr, to_lang: toLang };
  var sheet = getSheet_('apply');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([headers.map(function (h) { var v = row[h] == null ? '' : String(row[h]); return /^[=+\-@]/.test(v) ? "'" + v : v; })]);
  if (NOTIFY_EMAIL) MailApp.sendEmail(NOTIFY_EMAIL, '[LoKo.i] 게시판 같이 해요: ' + me.row.name + ' → ' + other.name, '관리 화면에서 소개 카드를 보내 주세요: ' + book_().getUrl());
  return { ok: true };
}

// 내 글 내리기 / 다시 올리기
function boardVisibility_(data) {
  var me = me_(data.token, rows_('traveler'), rows_('local'));
  if (!me) return { ok: false, error: 'invalid' };
  setCell_(me.type, me.row.id, 'board_public', data.show ? 'Yes' : 'No (내림)');
  return { ok: true, public: !!data.show };
}

// 관리 화면: 개인 링크 다시 보내기 (토큰이 없으면 만들고, reset이면 새 링크로 바꿔 이전 링크를 막음)
function boardLink_(data) {
  var adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!data.key || !adminKey || data.key !== adminKey) return { ok: false, error: 'key' };
  var type = typeOf_(data.row_id);
  var row = rows_(type).filter(function (r) { return r.id === data.row_id; })[0];
  if (!row) return { ok: false, error: 'not found' };
  var token = row.board_token;
  if (!token || data.reset) { token = newToken_(); setCell_(type, row.id, 'board_token', token); }
  return { ok: true, link: BOARD_URL + '?t=' + token };
}

// id(T5 = 5번째 줄)의 칸 하나를 씀. 열이 없으면 맨 뒤에 추가
function setCell_(type, id, header, value) {
  var sheet = getSheet_(type);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var c = headers.indexOf(header) + 1;
  if (!c) { c = headers.length + 1; sheet.getRange(1, c).setValue(header).setFontWeight('bold'); }
  var r = parseInt(String(id).slice(1), 10);
  var v = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  sheet.getRange(r, c).setNumberFormat('@').setValue(v.slice(0, 2000));
}
