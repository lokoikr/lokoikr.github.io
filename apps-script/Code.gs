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
    'in_busan', 'arrive', 'leave', 'travelling_with', 'group_size', 'kids_ages',
    'activities', 'details', 'areas', 'stay_area', 'preferred_date', 'time_slots', 'languages', 'buddy_pref', 'gender',
    'about_me', 'notes', 'photo_id', 'source', 'photo_ok', 'agree_privacy', 'agree_share', 'agree_safety', 'agree_adult',
    'site_lang', 'fill_seconds'],
  local: ['submitted_at', 'status', 'name', 'age_range', 'resident_type', 'nationality', 'gender', 'home_district', 'max_group', 'email', 'contact_id', 'instagram',
    'areas', 'activities', 'languages', 'language_level', 'availability', 'frequency', 'intro', 'photo_id',
    'source', 'agree_privacy', 'agree_safety', 'agree_id', 'agree_adult', 'site_lang', 'fill_seconds']
};
var SHEET_NAMES = { traveler: '여행자 신청', local: '현지인 등록' };

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents || '{}');
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
  var key = e && e.parameter && e.parameter.key;
  var adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || !adminKey || key !== adminKey) return json_({ ok: true, service: 'LoKo.i forms' });
  if (e.parameter.photo) return json_(photo_(e.parameter.photo));
  return json_({ ok: true, travelers: rows_('traveler'), locals: rows_('local') });
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
  return values.filter(function (r) { return r.join('') !== ''; }).map(function (r, i) {
    var o = { id: type[0].toUpperCase() + (i + 2) };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
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
