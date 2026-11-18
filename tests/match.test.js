// 실행: node tests/match.test.js
const assert = require('assert');
const M = require('../assets/match.js');
global.window = {};
require('./fixture-sample.js');
const { travelers, locals } = window.LOKOI_SAMPLE;

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok -', name); }

t('언어가 안 겹치면 제외', () => {
  const r = M.scorePair({ languages: 'Japanese' }, { languages: 'English' });
  assert.strictEqual(r.eligible, false);
  assert.ok(r.blocks.includes('대화 언어가 겹치지 않음'));
});

t('한국어를 하는 여행자는 한국인 현지인과 통함, 한국어 안 고른 외국인 거주자와는 안 통함', () => {
  assert.strictEqual(M.scorePair({ languages: 'Korean' }, { languages: 'English' }).eligible, true);
  assert.strictEqual(M.scorePair({ languages: 'Korean' }, { languages: 'English', resident_type: 'Foreign resident' }).eligible, false);
  assert.strictEqual(M.scorePair({ languages: 'Korean' }, { languages: 'English, Korean', resident_type: 'Foreign resident' }).eligible, true);
});

t('희망 날짜가 여행 기간 밖이면 제외, 배정은 기간 안 날짜로 조정 제안', () => {
  const tr = { id: 'X', languages: 'English', arrive: '2026-12-05', leave: '2026-12-07', preferred_date: '2026-12-09', activities: 'Sports' };
  const lo = { id: 'Y', languages: 'English', activities: 'Sports', availability: 'Weekend' };
  assert.ok(M.scorePair(tr, lo).blocks.includes('희망 날짜가 여행 기간 밖'));
  const a = M.assign([tr], [lo]);
  assert.strictEqual(a.matches.length, 1);
  assert.ok(a.matches[0].altDate >= '2026-12-05' && a.matches[0].altDate <= '2026-12-07');
});

t('일행 수가 현지인 가능 인원보다 많으면 제외', () => {
  const r = M.scorePair({ languages: 'English', group_size: '4' }, { languages: 'English', max_group: '2' });
  assert.strictEqual(r.eligible, false);
});

t('아이 동반인데 현지인이 아이 동행을 안 고르면 감점+주의', () => {
  const tr = { languages: 'English', activities: 'Kids & family', travelling_with: 'Family with kids' };
  const no = M.scorePair(tr, { languages: 'English', activities: 'Sports' });
  const yes = M.scorePair(tr, { languages: 'English', activities: 'Kids & family' });
  assert.ok(yes.score > no.score);
  assert.ok(no.warnings.some(w => w.includes('아이')));
});

t('한국인 현지인이 같은 조건의 외국인 거주자보다 높게', () => {
  const tr = { languages: 'Chinese', country: 'Taiwan' };
  const ko = M.scorePair(tr, { languages: 'Chinese', language_level: 'Fluent' });
  const tw = M.scorePair(tr, { languages: 'Chinese', language_level: 'Fluent', resident_type: 'Foreign resident', nationality: 'Taiwan' });
  assert.ok(ko.score > tw.score);
});

t('시트 날짜 표기(2026. 12. 5)도 읽음, 끝난 신청은 매칭에서 뺌', () => {
  assert.strictEqual(M.normDate('2026. 12. 5'), '2026-12-05');
  const rows = [{ status: '신규', leave: '2026-12-10' }, { status: '연결 완료', leave: '2026-12-10' }, { status: '신규', leave: '2026-11-01' }];
  assert.strictEqual(M.active(rows, '2026-11-18', true).length, 1);
});

t('현지인 한 명에게 배정이 몰리지 않음 (최대 2건)', () => {
  const lo = [{ id: 'L', languages: 'English', activities: 'Sports' }, { id: 'M', languages: 'English' }];
  const tr = [1, 2, 3].map(i => ({ id: 'T' + i, languages: 'English', activities: 'Sports', preferred_date: '2026-12-0' + i }));
  const a = M.assign(tr, lo, { minScore: 1 });
  assert.ok(a.matches.filter(m => m.localId === 'L').length <= 2);
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

t('지역 상관없음이면 숙소 지역으로, 현지인 사는 구도 반영', () => {
  const tr = { languages: 'English', areas: 'Anywhere', stay_area: 'Haeundae / Centum' };
  const near = M.scorePair(tr, { languages: 'English', home_district: 'Haeundae-gu' });
  const far = M.scorePair(tr, { languages: 'English', home_district: 'Saha-gu' });
  assert.ok(near.parts.area > far.parts.area);
  assert.ok(near.reasons.some(r => r.includes('숙소 근처')));
});

t('CSV 파싱: 따옴표 안 쉼표와 줄바꿈', () => {
  const rows = M.parseCSV('name,activities,intro\n"Kim","Sports, By the sea","hi\nthere"\n');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].activities, 'Sports, By the sea');
  assert.strictEqual(rows[0].intro, 'hi\nthere');
});

console.log(`\n${n} tests passed`);
