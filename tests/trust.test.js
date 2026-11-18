const assert = require('assert');
const TR = require('../assets/trust.js');
const P = require('./personas2.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const lv = (id, type) => { const rows = type === 'local' ? P.locals : P.travelers; return TR.check(rows.find(r => r.id === id), type, rows).level; };

t('정상 신청자는 정상', () => { assert.strictEqual(lv('T4', 'traveler'), 'ok'); assert.strictEqual(lv('L1', 'local'), 'ok'); });
t('데이트 목적·일회용 이메일은 의심', () => assert.strictEqual(lv('T6', 'traveler'), 'risk'));
t('봇처럼 빠르고 이상한 이름은 의심', () => assert.strictEqual(lv('T7', 'traveler'), 'risk'));
t('현지인이 돈·클럽·카톡 아이디를 쓰면 의심', () => assert.strictEqual(lv('L6', 'local'), 'risk'));
t('자기소개가 짧고 사진 없는 현지인은 확인 필요', () => assert.strictEqual(lv('L7', 'local'), 'check'));
t('중복 신청은 확인 필요, 매칭엔 최근 것만', () => {
  assert.strictEqual(lv('T1', 'traveler'), 'check');
  const d = TR.dedupe(P.travelers);
  assert.strictEqual(d.keep.filter(r => r.email === 'mei.lin@gmail.com').length, 1);
  assert.strictEqual(d.dropped.length, 1);
});
t('장기 체류자는 확인 필요', () => assert.strictEqual(lv('T9', 'traveler'), 'check'));
console.log(n + ' tests passed');
