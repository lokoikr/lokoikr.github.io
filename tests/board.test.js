// 여행자 게시판(Apps Script) 테스트: Lib.gs + Code.gs를 가짜 구글 서비스 위에서 실행
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('./personas2.js');
const build = require('../tools/build-gs.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

const root = path.join(__dirname, '..');
const ctx = { console, JSON, Date, Math, String, Object, Array, RegExp, parseInt };
ctx.Utilities = { formatDate: () => '2026-12-01', getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
ctx.LanguageApp = { translate: (text, from, to) => '[' + to + '] ' + text };
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'ADMIN' }) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Lib.gs'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'), ctx);

// 가짜 시트
const TOKEN = 'tok_0123456789abcdefghij';
let sheet, writes, appended;
function reset() {
  // T8은 T1의 중복 신청이라 게시판엔 최근 것 하나만 뜸 → 여기선 빼고 T1로 확인
  const tr = P.travelers.filter(r => r.id !== 'T8').map(r => ({ ...r, board_ok: 'Yes', site_lang: r.country === 'Taiwan' ? 'zh' : 'en', details: '' }));
  tr.find(r => r.id === 'T5').board_ok = '';          // 게시판 동의 안 함
  tr.find(r => r.id === 'T1').details = 'Pork soup! my insta @meilin_tw or mei.lin@gmail.com, +886 912 345 678';
  const lo = P.locals.map(r => ({ ...r }));
  lo.find(r => r.id === 'L1').board_token = TOKEN;
  lo.find(r => r.id === 'L6').board_token = 'tok_unverified_local_xx';
  sheet = { traveler: tr, local: lo, apply: [] }; writes = []; appended = [];
}
ctx.rows_ = type => sheet[type];
ctx.setCell_ = (type, id, h, v) => { writes.push([type, id, h, v]); sheet[type].find(r => r.id === id)[h] = v; };
ctx.getSheet_ = type => ({
  getLastColumn: () => ctx.COLUMNS[type].length, getLastRow: () => sheet[type].length + 1,
  getRange: (r, c, nr, nc) => ({ getValues: () => [ctx.COLUMNS[type]], setNumberFormat() { return this; },
    setValues: v => { const o = { id: 'A' + r }; ctx.COLUMNS[type].forEach((h, j) => o[h] = v[0][j]); sheet[type].push(o); appended.push(o); } })
});

t('Lib.gs가 match.js·trust.js와 같음 (다르면 node tools/build-gs.js)', () =>
  assert.strictEqual(fs.readFileSync(path.join(root, 'apps-script/Lib.gs'), 'utf8'), build()));

t('연락처 지우기: 이메일·@아이디·전화·메신저 ID·링크', () => {
  const s = ctx.scrubContacts_('mail me a.b@gmail.com, IG @jieun.busan, 010-1234-5678, kakao: jieun99, see https://x.com/a');
  assert(!/gmail|jieun|1234|jieun99|x\.com/.test(s), s);
  assert(!/jieun99/.test(ctx.scrubContacts_('카톡 jieun99 로 연락 주세요')));
  ['Pork soup at 2pm, 2 people', 'I want to line up for milmyeon', 'Big fan of Lotte Giants'].forEach(x => assert.strictEqual(ctx.scrubContacts_(x), x));
});

t('게시판: 동의한 글만, 의심 신청 제외, 조건 맞는 글만, 점수순', () => {
  reset();
  const L1 = sheet.local.find(r => r.id === 'L1');
  const posts = ctx.boardPosts_(sheet.traveler, L1, '2026-12-01');
  const ids = posts.map(p => p.id);
  assert(!ids.includes('T5'), '동의 안 한 T5');
  assert(!ids.includes('T6') && !ids.includes('T7'), '의심 신청');
  posts.forEach(p => assert(ctx.LokoMatch.scorePair(sheet.traveler.find(r => r.id === p.id), L1, {}).eligible));
  for (let i = 1; i < posts.length; i++) assert(posts[i - 1].score >= posts[i].score);
  assert(posts.length > 0);
});

t('게시판 글에 이름·이메일·연락처·자기소개·사진이 없음', () => {
  reset();
  const posts = ctx.boardPosts_(sheet.traveler, sheet.local[0], '2026-12-01');
  posts.forEach(p => ['name', 'email', 'contact_id', 'contact_method', 'about_me', 'photo_id', 'notes', 'gender'].forEach(k => assert(!(k in p), k)));
  const json = JSON.stringify(posts);
  assert(!/meilin_tw|mei\.lin@gmail|912 345/.test(json), json);
});

t('같은 사람의 중복 신청은 하나만 보임', () => {
  reset();
  sheet.traveler.push({ ...sheet.traveler.find(r => r.id === 'T1'), id: 'T10' });
  const ids = ctx.boardPosts_(sheet.traveler, sheet.local[0], '2026-12-01').map(p => p.id);
  assert.strictEqual(ids.filter(i => i === 'T1' || i === 'T10').length, 1);
});

t('여행이 끝난 글은 안 보임', () => {
  reset();
  // 12월 8일에 떠나는 여행자들은 빠지고, 5월까지 머무는 T9만 남을 수 있음
  ctx.boardPosts_(sheet.traveler, sheet.local[0], '2026-12-20').forEach(p => assert.strictEqual(p.id, 'T9'));
  assert(ctx.boardPosts_(sheet.traveler, sheet.local[0], '2026-12-01').some(p => p.id !== 'T9'));
});

t('링크: 토큰이 없거나 확인 전 현지인이면 막힘', () => {
  reset();
  assert.strictEqual(ctx.board_('').ok, false);
  assert.strictEqual(ctx.board_('tok_unverified_local_xx').ok, false);
  sheet.local.find(r => r.id === 'L1').status = '보류';
  assert.strictEqual(ctx.board_(TOKEN).ok, false);
});

t('게시판 열기: 한국어로 번역하고 시트에 저장, 다음엔 저장본 사용', () => {
  reset();
  const d = ctx.board_(TOKEN);
  assert(d.ok && d.lang === 'ko' && d.me.name === '김지은');
  const p = d.posts.find(x => x.id === 'T1');
  assert(p && /^\[ko\] Pork soup!/.test(p.details), p && p.details);
  assert(!/meilin|gmail|912/.test(p.details));
  assert.deepStrictEqual(writes.map(w => w[2]), ['details_ko']);
  ctx.board_(TOKEN);
  assert.strictEqual(writes.length, 1, '두 번째는 번역 안 함');
});

t('외국인 거주자 현지인은 영어 게시판', () => {
  reset();
  const L4 = sheet.local.find(r => r.id === 'L4'); L4.board_token = 'tok_wanghao_0123456789';
  assert.strictEqual(ctx.board_('tok_wanghao_0123456789').lang, 'en');
});

t('지원: 시트에 저장, 메시지는 연락처 지우고 여행자 언어로 번역, 중복은 한 번만', () => {
  reset();
  const id = ctx.board_(TOKEN).posts.find(x => x.id === 'T1').id;
  const r = ctx.boardApply_({ token: TOKEN, post_id: id, message: '돼지국밥 같이 먹어요! 카톡 jieun99' });
  assert(r.ok && !r.dup);
  const a = appended[0];
  assert.strictEqual(a.local_id, 'L1'); assert.strictEqual(a.traveler_name, 'Mei Lin'); assert.strictEqual(a.status, '신규');
  assert(!/jieun99/.test(a.message + a.message_tr));
  assert(/^\[zh-TW\]/.test(a.message_tr), a.message_tr);
  assert.strictEqual(ctx.boardApply_({ token: TOKEN, post_id: id, message: 'again' }).dup, true);
  assert.strictEqual(appended.length, 1);
  assert.deepStrictEqual(ctx.board_(TOKEN).applied, [id]);
});

t('지원: 안 보이는 글(동의 안 함·조건 불일치)에는 못 함', () => {
  reset();
  assert.strictEqual(ctx.boardApply_({ token: TOKEN, post_id: 'T5', message: 'hi' }).error, 'closed');
  assert.strictEqual(ctx.boardApply_({ token: 'nope_nope_nope_nope_nope', post_id: 'T1' }).error, 'invalid');
});

t('관리자 링크: 키 필요, 확인 완료만, reset이면 새 토큰', () => {
  reset();
  assert.strictEqual(ctx.boardLink_({ key: 'x', local_id: 'L1' }).error, 'key');
  assert.strictEqual(ctx.boardLink_({ key: 'ADMIN', local_id: 'L6' }).error, 'not verified');
  assert.strictEqual(ctx.boardLink_({ key: 'ADMIN', local_id: 'L1' }).link, 'https://lokoikr.github.io/board.html?t=' + TOKEN);
  const L2 = ctx.boardLink_({ key: 'ADMIN', local_id: 'L2' });
  assert(/\?t=aaaaaaaabbbbccccddddeeeeeeeeeeee$/.test(L2.link));
  assert(ctx.boardLink_({ key: 'ADMIN', local_id: 'L1', reset: true }).link.indexOf(TOKEN) === -1);
});

console.log(n + ' tests passed');
