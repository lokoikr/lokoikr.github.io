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
    'about_me', 'budget', 'notes', 'photo_id', 'source', 'photo_ok', 'agree_privacy', 'agree_share', 'board_ok', 'agree_safety', 'agree_adult',
    'site_lang', 'fill_seconds'],
  local: ['submitted_at', 'status', 'name', 'name_en', 'age_range', 'resident_type', 'nationality', 'busan_years', 'occupation', 'gender', 'home_district', 'max_group', 'email', 'contact_id', 'instagram',
    'areas', 'activities', 'languages', 'language_level', 'availability', 'frequency', 'buddy_pref', 'fav_spot', 'intro', 'photo_id',
    'source', 'agree_privacy', 'agree_share', 'agree_safety', 'agree_id', 'agree_adult', 'site_lang', 'fill_seconds']
};
COLUMNS.apply = ['applied_at', 'status', 'post_id', 'traveler_name', 'local_id', 'local_name', 'message', 'message_tr', 'traveler_lang'];
var SHEET_NAMES = { traveler: '여행자 신청', local: '현지인 등록', apply: '현지인 지원' };

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    if (data.action === 'board_apply') return json_(boardApply_(data));
    if (data.action === 'board_link') return json_(boardLink_(data));
    var type = data.form_type === 'local' ? 'local' : 'traveler';
    if (data.website) return json_({ ok: true }); // 봇 차단용 숨은 칸

    data.status = '신규';

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
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 매칭 관리 화면용: 관리자 키가 맞을 때만 신청 목록(또는 사진 1장)을 돌려줌
function doGet(e) {
  if (e && e.parameter && e.parameter.board) return json_(board_(e.parameter.board));
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

/* ───────── 여행자 게시판 (확인 완료된 현지인 전용) ─────────
 * - 현지인마다 개인 링크(board.html?t=토큰)를 관리 화면에서 만들어 DM으로 보냅니다.
 * - 시트 status가 '확인 완료'인 동안만 링크가 열립니다. 상태를 바꾸면 바로 막혀요.
 * - 게시판에 뜨는 건 board_ok = Yes(게시판 공개에 동의)한 여행자 글뿐이고,
 *   이름·사진·이메일·연락처·자기소개는 보내지 않습니다.
 * - '하고 싶은 것'은 연락처를 지운 뒤 구글 번역으로 현지인 언어로 바꿔 시트에 저장해 둡니다.
 * - 이 기능은 같은 프로젝트의 Lib.gs(매칭 엔진·신청자 점검)를 씁니다.
 */
var BOARD_URL = 'https://lokoikr.github.io/board.html';
var VERIFIED_STATUS = ['확인 완료', 'verified', 'Verified'];
var BOARD_FIELDS = ['country', 'age_range', 'travelling_with', 'group_size', 'kids_ages', 'first_visit', 'arrive', 'leave', 'preferred_date',
  'time_slots', 'areas', 'stay_area', 'activities', 'languages', 'korean_level'];

function isVerified_(row) { return VERIFIED_STATUS.indexOf(String(row.status || '').trim()) !== -1; }

function localByToken_(token) {
  if (!token || String(token).length < 20) return null;
  var hit = rows_('local').filter(function (l) { return l.board_token && l.board_token === token; })[0];
  return hit && isVerified_(hit) ? hit : null;
}

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

function boardLang_(local) {
  var lang = String(local.site_lang || '').toLowerCase();
  if (lang === 'ko' || !/foreign/i.test(local.resident_type || '')) return 'ko';
  return 'en';
}

// 순수 함수: 이 현지인에게 보여 줄 여행자 글 (테스트: tests/board.test.js)
function boardPosts_(travelers, local, today) {
  var M = LokoMatch, T = LokoTrust;
  var open = M.active(travelers, today, true).filter(function (t) {
    return /^yes$/i.test(String(t.board_ok || '').trim()) && T.check(t, 'traveler', travelers).level !== 'risk';
  });
  open = T.dedupe(open).keep;
  return open.map(function (t) {
    var r = M.scorePair(t, local, {});
    if (!r.eligible) return null;
    var post = { id: t.id, score: r.score, reasons: r.reasons, posted: String(t.submitted_at || '').slice(0, 10) };
    BOARD_FIELDS.forEach(function (f) { if (t[f]) post[f] = t[f]; });
    post.details_src = scrubContacts_(t.details);
    return post;
  }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
}

function board_(token) {
  var local = localByToken_(token);
  if (!local) return { ok: false, error: 'invalid' };
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var lang = boardLang_(local);
  var travelers = rows_('traveler');
  var posts = boardPosts_(travelers, local, today);
  var byId = {}; travelers.forEach(function (t) { byId[t.id] = t; });
  var col = 'details_' + lang;
  posts.forEach(function (p) {
    if (!p.details_src) return;
    var cached = byId[p.id][col];
    if (!cached) {
      try {
        cached = LanguageApp.translate(p.details_src, '', lang === 'ko' ? 'ko' : 'en');
        setCell_('traveler', p.id, col, cached);
      } catch (err) { cached = ''; }
    }
    p.details = cached || p.details_src;
  });
  var applied = rows_('apply').filter(function (a) { return a.local_id === local.id; }).map(function (a) { return a.post_id; });
  return { ok: true, lang: lang, me: { name: firstName_(local.name), languages: local.languages }, posts: posts, applied: applied };
}

function boardApply_(data) {
  var local = localByToken_(data.token);
  if (!local) return { ok: false, error: 'invalid' };
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var travelers = rows_('traveler');
  var post = boardPosts_(travelers, local, today).filter(function (p) { return p.id === data.post_id; })[0];
  if (!post) return { ok: false, error: 'closed' };
  var mine = rows_('apply').filter(function (a) { return a.local_id === local.id; });
  if (mine.some(function (a) { return a.post_id === post.id; })) return { ok: true, dup: true };
  var t = travelers.filter(function (x) { return x.id === post.id; })[0];
  var msg = scrubContacts_(data.message).slice(0, 500);
  var tlang = String(t.site_lang || 'en') === 'zh' ? 'zh-TW' : 'en';
  var tr = '';
  if (msg) { try { tr = LanguageApp.translate(msg, '', tlang); } catch (err) {} }
  var row = { applied_at: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'), status: '신규', post_id: post.id,
    traveler_name: t.name, local_id: local.id, local_name: local.name, message: msg, message_tr: tr, traveler_lang: tlang };
  var sheet = getSheet_('apply');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([headers.map(function (h) { var v = row[h] == null ? '' : String(row[h]); return /^[=+\-@]/.test(v) ? "'" + v : v; })]);
  if (NOTIFY_EMAIL) MailApp.sendEmail(NOTIFY_EMAIL, '[LoKo.i] 게시판 지원: ' + local.name + ' → ' + t.name, '관리 화면에서 소개 카드를 보내 주세요: ' + book_().getUrl());
  return { ok: true };
}

// 관리 화면: 확인 완료된 현지인의 게시판 링크 만들기 (reset이면 새 링크로 바꿔 이전 링크를 막음)
function boardLink_(data) {
  var adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!data.key || !adminKey || data.key !== adminKey) return { ok: false, error: 'key' };
  var local = rows_('local').filter(function (l) { return l.id === data.local_id; })[0];
  if (!local) return { ok: false, error: 'not found' };
  if (!isVerified_(local)) return { ok: false, error: 'not verified' };
  var token = local.board_token;
  if (!token || data.reset) { token = Utilities.getUuid().replace(/-/g, ''); setCell_('local', local.id, 'board_token', token); }
  return { ok: true, link: BOARD_URL + '?t=' + token };
}

function firstName_(name) { return String(name || '').trim().split(/\s+/)[0]; }

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
