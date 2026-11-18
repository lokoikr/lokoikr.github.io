// 실행: node tests/match.test.js
const assert = require('assert');
const M = require('../assets/match.js');
global.window = {};
require('../admin/sample.js');
const { travelers, locals } = window.LOKOI_SAMPLE;

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok -', name); }

t('언어가 안 겹치면 제외', () => {
  const r = M.scorePair({ languages: 'Japanese' }, { languages: 'English' });
  assert.strictEqual(r.eligible, false);
  assert.ok(r.blocks.includes('대화 언어가 겹치지 않음'));
});

t('한국어를 하는 여행자는 언어 조건 통과', () => {
  const r = M.scorePair({ languages: 'Korean' }, { languages: 'English' });
  assert.strictEqual(r.eligible, true);
});

t('같은 성별 조건', () => {
  const tr = { languages: 'English', buddy_pref: 'Same gender', gender: 'Woman' };
  assert.strictEqual(M.scorePair(tr, { languages: 'English', gender: 'Man' }).eligible, false);
  assert.strictEqual(M.scorePair(tr, { languages: 'English', gender: 'Woman' }).eligible, true);
  assert.strictEqual(M.scorePair({ ...tr, gender: 'Prefer not to say' }, { languages: 'English', gender: 'Woman' }).eligible, false);
});

t('신원 확인 전 현지인은 옵션에 따라 제외', () => {
  const r = M.scorePair(travelers[0], locals[3], { onlyVerified: true });
  assert.ok(r.blocks.includes('신원 확인 전'));
});

t('점수는 0~100, 완벽히 맞으면 높게', () => {
  const r = M.scorePair(travelers[0], locals[0]);
  assert.ok(r.score >= 80 && r.score <= 100, 'score ' + r.score);
});

t('추천: T2(같은 성별 남성) → L2가 1순위', () => {
  const rec = M.recommend(travelers, locals, { onlyVerified: true });
  assert.strictEqual(rec[1].picks[0].localId, 'L2');
});

t('배정: 여행자당 1명, 같은 날 같은 현지인 중복 없음', () => {
  const a = M.assign(travelers, locals, { onlyVerified: true });
  const ids = a.matches.map(m => m.travelerId);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(a.matches.length >= 3);
});

t('CSV 파싱: 따옴표 안 쉼표와 줄바꿈', () => {
  const rows = M.parseCSV('name,activities,intro\n"Kim","Sports, By the sea","hi\nthere"\n');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].activities, 'Sports, By the sea');
  assert.strictEqual(rows[0].intro, 'hi\nthere');
});

console.log(`\n${n} tests passed`);
