// LoKo.i 게시판(Apps Script, 여행인↔현지인 공개 게시판) 테스트: Lib.gs + Code.gs를 가짜 구글 서비스 위에서 실행
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('./personas2.js');
const build = require('../tools/build-gs.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

const root = path.join(__dirname, '..');
const ctx = { console, JSON, Date, Math, String, Object, Array, RegExp, parseInt };
let uuid = 0;
ctx.Utilities = { formatDate: () => '2026-12-01', getUuid: () => 'uuid-' + String(++uuid).padStart(28, '0') };
ctx.LanguageApp = { translate: (text, from, to) => '[' + to + '] ' + text };
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'ADMIN' }) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Lib.gs'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'), ctx);

// 가짜 시트
const TOK = { T1: 'tok_traveler_T1_xxxxxxxxx', T2: 'tok_traveler_T2_xxxxxxxxx', L1: 'tok_local_L1_xxxxxxxxxxxx', L2: 'tok_local_L2_xxxxxxxxxxxx', L6: 'tok_local_L6_unverified_x' };
let sheet, writes, appended;
function reset() {
  // T8은 T1의 중복 신청 → 여기선 빼고 T1로 확인 (중복은 따로 테스트)
  const tr = P.travelers.filter(r => r.id !== 'T8').map(r => ({ ...r, board_public: 'Yes', site_lang: r.country === 'Taiwan' ? 'zh' : 'en', details: '' }));
  tr.find(r => r.id === 'T5').board_public = '';
  tr.find(r => r.id === 'T1').details = 'Pork soup! my insta @meilin_tw or mei.lin@gmail.com, +886 912 345 678';
  const lo = P.locals.map(r => ({ ...r, board_public: 'Yes', site_lang: 'ko', board_note: '' }));
  lo.find(r => r.id === 'L1').board_note = '남포동 돼지국밥 단골집 알려 드려요. 카톡 jieun99';
  lo.find(r => r.id === 'L3').board_public = 'No (내림)';
  Object.entries(TOK).forEach(([id, tok]) => (id[0] === 'T' ? tr : lo).find(r => r.id === id).board_token = tok);
  sheet = { traveler: tr, local: lo, apply: [] }; writes = []; appended = [];
}
ctx.rows_ = type => sheet[type];
ctx.setCell_ = (type, id, h, v) => { writes.push([type, id, h, v]); sheet[type].find(r => r.id === id)[h] = v; };
ctx.getSheet_ = type => ({
  getLastColumn: () => ctx.COLUMNS[type].length, getLastRow: () => sheet[type].length + 1,
  getRange: (r) => ({ getValues: () => [ctx.COLUMNS[type]], setNumberFormat() { return this; },
    setValues: v => { const o = { id: 'A' + r }; ctx.COLUMNS[type].forEach((h, j) => o[h] = v[0][j]); sheet[type].push(o); appended.push(o); } })
});
const posts = (today = '2026-12-01') => ctx.boardPosts_(sheet.traveler, sheet.local, today);
const board = (p) => ctx.board_(p);

t('Lib.gs가 match.js·trust.js와 같음 (다르면 node tools/build-gs.js)', () =>
  assert.strictEqual(fs.readFileSync(path.join(root, 'apps-script/Lib.gs'), 'utf8'), build()));

t('연락처 지우기: 이메일·@아이디·전화·메신저 ID·링크', () => {
  const s = ctx.scrubContacts_('mail me a.b@gmail.com, IG @jieun.busan, 010-1234-5678, kakao: jieun99, see https://x.com/a');
  assert(!/gmail|jieun|1234|jieun99|x\.com/.test(s), s);
  assert(!/jieun99/.test(ctx.scrubContacts_('카톡 jieun99 로 연락 주세요')));
  ['Pork soup at 2pm, 2 people', 'I want to line up for milmyeon', 'Big fan of Lotte Giants'].forEach(x => assert.strictEqual(ctx.scrubContacts_(x), x));
});

t('공개 글: 동의한 여행인 + 동의한 "확인 완료" 현지인만, 의심·내린 글 제외', () => {
  reset();
  const ids = posts().map(p => p.id);
  assert(ids.includes('T1') && ids.includes('L1'));
  assert(!ids.includes('T5'), '동의 안 한 여행인');
  assert(!ids.includes('T6') && !ids.includes('T7'), '의심 여행인');
  assert(!ids.includes('L6') && !ids.includes('L7'), '확인 전 현지인');
  assert(!ids.includes('L3'), '내린 글');
  posts().forEach(p => assert(['traveler', 'local'].includes(p.type)));
});

t('공개 글에 이름·이메일·연락처·자기소개·사진·성별·사는 구가 없음', () => {
  reset();
  const ps = posts();
  ps.forEach(p => ['name', 'name_en', 'email', 'contact_id', 'contact_method', 'instagram', 'about_me', 'intro', 'photo_id', 'notes', 'gender', 'home_district', 'occupation', 'board_token'].forEach(k => assert(!(k in p), p.id + ' ' + k)));
  assert(!/meilin_tw|mei\.lin@gmail|912 345|jieun99|김지은/.test(JSON.stringify(ps)));
});

t('중복 신청은 하나만, 여행이 끝난 글은 빠짐', () => {
  reset();
  sheet.traveler.push({ ...sheet.traveler.find(r => r.id === 'T1'), id: 'T10' });
  assert.strictEqual(posts().filter(p => p.id === 'T1' || p.id === 'T10').length, 1);
  reset();
  posts('2026-12-20').filter(p => p.type === 'traveler').forEach(p => assert.strictEqual(p.id, 'T9'));
});

t('게시판 열기(토큰 없이): 보는 사람 언어로 번역, 저장본 재사용', () => {
  reset();
  const d = board({ board: '1', lang: 'zh' });
  assert(d.ok && d.lang === 'zh' && !d.me);
  const l1 = d.posts.find(p => p.id === 'L1');
  assert(/^\[zh-TW\] 남포동/.test(l1.note) && !/jieun99/.test(l1.note), l1.note);
  const n = writes.length; assert(n >= 2 && writes.every(w => w[2] === 'note_zh'));
  board({ board: '1', lang: 'zh' }); assert.strictEqual(writes.length, n, '두 번째는 번역 안 함');
  assert.strictEqual(board({ board: '1', lang: 'xx' }).lang, 'en');
});

t('내 링크: 여행인은 현지인 글에, 현지인은 여행인 글에만 점수, 같은 편은 same', () => {
  reset();
  const d = board({ board: '1', lang: 'ko', t: TOK.T1 });
  assert.strictEqual(d.me.type, 'traveler'); assert.strictEqual(d.me.name, 'Mei');
  assert.strictEqual(d.me.fit.T2, 'same');
  assert.strictEqual(typeof d.me.fit.L1, 'number', 'Mei(중국어) ↔ 지은(중국어) 가능');
  const dl = board({ board: '1', lang: 'ko', t: TOK.L1 });
  assert.strictEqual(dl.me.type, 'local'); assert.strictEqual(dl.me.fit.L2, 'same');
  assert.strictEqual(board({ board: '1', t: 'nope_nope_nope_nope_nope' }).bad_token, true);
});

t('조건이 안 맞으면 fit (언어·성별)', () => {
  reset();
  const d = board({ board: '1', lang: 'ko', t: TOK.L2 });   // 준호: 영어만
  const jp = d.posts.find(p => p.id === 'T3');             // Yuki: 일본어만, 같은 성별
  assert(jp, 'T3 공개 글'); assert.strictEqual(d.me.fit.T3, 'fit');
});

t('같이 해요: 저장·연락처 삭제·상대 언어로 번역·중복 한 번', () => {
  reset();
  const r = ctx.boardApply_({ token: TOK.L1, post_id: 'T1', message: '돼지국밥 같이 먹어요! 카톡 jieun99' });
  assert(r.ok && !r.dup, JSON.stringify(r));
  const a = appended[0];
  assert.deepStrictEqual([a.from_id, a.from_type, a.to_id, a.to_type, a.status], ['L1', 'local', 'T1', 'traveler', '신규']);
  assert(!/jieun99/.test(a.message + a.message_tr));
  assert(/^\[zh-TW\]/.test(a.message_tr), a.message_tr);
  assert.strictEqual(ctx.boardApply_({ token: TOK.L1, post_id: 'T1', message: 'again' }).dup, true);
  assert.strictEqual(appended.length, 1);
  assert.deepStrictEqual(board({ board: '1', t: TOK.L1 }).me.applied, ['T1']);
  // 여행인 → 현지인
  const r2 = ctx.boardApply_({ token: TOK.T1, post_id: 'L1', message: 'Hi!' });
  assert(r2.ok); assert.strictEqual(appended[1].to_lang, 'ko');
});

t('같이 해요 막힘: 같은 편·확인 전 현지인·안 보이는 글·잘못된 링크', () => {
  reset();
  assert.strictEqual(ctx.boardApply_({ token: TOK.T1, post_id: 'T2' }).error, 'same');
  assert.strictEqual(ctx.boardApply_({ token: TOK.L6, post_id: 'T1' }).error, 'unverified');
  assert.strictEqual(ctx.boardApply_({ token: TOK.L1, post_id: 'T5' }).error, 'closed');
  assert.strictEqual(ctx.boardApply_({ token: 'nope_nope_nope_nope_nope', post_id: 'T1' }).error, 'invalid');
  assert.strictEqual(appended.length, 0);
});

t('내 글 내리기·다시 올리기', () => {
  reset();
  assert(ctx.boardVisibility_({ token: TOK.T1, show: false }).ok);
  assert(!posts().some(p => p.id === 'T1'));
  ctx.boardVisibility_({ token: TOK.T1, show: true });
  assert(posts().some(p => p.id === 'T1'));
  assert.strictEqual(ctx.boardVisibility_({ token: 'nope_nope_nope_nope_nope', show: false }).error, 'invalid');
});

t('신청서 제출: 개인 링크 토큰을 서버가 만들고, 보낸 토큰·번역 캐시는 무시', () => {
  reset();
  const saved = [];
  ctx.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  ctx.ContentService = { createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }), MimeType: { JSON: 'json' } };
  const realGet = ctx.getSheet_;
  ctx.getSheet_ = type => ({ getLastColumn: () => 3, getLastRow: () => 1,
    getRange: () => ({ getValues: () => [['submitted_at', 'status', 'name']], setValue() { return this; }, setFontWeight() { return this; }, setNumberFormat() { return this; }, setValues: v => saved.push(v[0]) }) });
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ form_type: 'traveler', name: 'A', board_token: 'hacked', note_ko: 'spam', details_ko: 'spam' }) } });
  ctx.getSheet_ = realGet;
  assert(out.ok && /^uuid/.test(out.token) && out.token.length >= 20, JSON.stringify(out));
  assert(!JSON.stringify(saved).includes('hacked') && !JSON.stringify(saved).includes('spam'));
});

t('관리자 링크: 키 필요, 여행인·현지인 모두, reset이면 새 토큰', () => {
  reset();
  assert.strictEqual(ctx.boardLink_({ key: 'x', row_id: 'L1' }).error, 'key');
  assert.strictEqual(ctx.boardLink_({ key: 'ADMIN', row_id: 'L1' }).link, 'https://lokoikr.github.io/board.html?t=' + TOK.L1);
  assert(/\?t=uuid/.test(ctx.boardLink_({ key: 'ADMIN', row_id: 'T2', reset: true }).link));
  assert(/\?t=uuid/.test(ctx.boardLink_({ key: 'ADMIN', row_id: 'L4' }).link));
});

console.log(n + ' tests passed');
