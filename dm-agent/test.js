// 실행: node dm-agent/test.js   (실제 API 호출 없이 가짜 응답으로 확인)
const assert = require('assert');
const crypto = require('crypto');
const A = require('./agent');

const fakeClaude = (text) => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text }] }) });
const failing = async () => ({ ok: false, status: 500 });
let n = 0;
async function t(name, fn) { await fn(); n++; console.log('ok -', name); }

(async () => {
  await t('언어 감지', () => {
    assert.strictEqual(A.detectLang('Hi! Is it free?'), 'en');
    assert.strictEqual(A.detectLang('請問是免費的嗎'), 'zh');
    assert.strictEqual(A.detectLang('무료인가요?'), 'ko');
    assert.strictEqual(A.detectLang('無料ですか？'), 'ja');
  });

  await t('서명 검증', () => {
    const body = Buffer.from('{"a":1}');
    const sig = 'sha256=' + crypto.createHmac('sha256', 's3cret').update(body).digest('hex');
    assert.ok(A.verifySignature(body, sig, 's3cret'));
    assert.ok(!A.verifySignature(body, 'sha256=bad', 's3cret'));
  });

  await t('내가 보낸 메시지와 중복은 무시', () => {
    const seen = new Set();
    const body = { entry: [{ messaging: [
      { sender: { id: '1' }, message: { mid: 'm1', text: 'hello' } },
      { sender: { id: '2' }, message: { mid: 'm2', text: 'echo', is_echo: true } },
      { sender: { id: '1' }, message: { mid: 'm1', text: 'hello' } }
    ] }] };
    assert.strictEqual(A.extractMessages(body, seen).length, 1);
  });

  await t('일반 질문 → AI 답변 + 첫 대화 AI 안내', async () => {
    const ctx = { fetchImpl: fakeClaude('Yes, LoKo.i is free!'), firstContact: new Set() };
    const out = await A.handleMessage({ senderId: '9', text: 'Is it free?' }, ctx);
    assert.strictEqual(out.notify, null);
    assert.ok(out.reply.startsWith('Yes, LoKo.i is free!'));
    assert.ok(out.reply.includes('Automatic reply'));
    const again = await A.handleMessage({ senderId: '9', text: 'thanks' }, ctx);
    assert.ok(!again.reply.includes('Automatic reply'));
  });

  await t('불편 신고 → 담당자 연결 (번체)', async () => {
    const out = await A.handleMessage({ senderId: '3', text: '昨天的在地人讓我很不舒服' }, { fetchImpl: fakeClaude('x'), firstContact: new Set() });
    assert.strictEqual(out.notify, 'report');
    assert.ok(out.reply.includes('團隊'));
  });

  await t('위급 상황 → 112·119 안내', async () => {
    const out = await A.handleMessage({ senderId: '4', text: 'help me please' }, { fetchImpl: fakeClaude('x'), firstContact: new Set() });
    assert.strictEqual(out.notify, 'emergency');
    assert.ok(out.reply.includes('112'));
  });

  await t('데이트 목적 → 담당자 연결', async () => {
    const out = await A.handleMessage({ senderId: '5', text: 'can a local girl date me?' }, { fetchImpl: fakeClaude('x'), firstContact: new Set() });
    assert.strictEqual(out.notify, 'dating');
  });

  await t('AI 오류 → 담당자 연결로 안전하게', async () => {
    const out = await A.handleMessage({ senderId: '6', text: '부산 어디 가면 좋아요?' }, { fetchImpl: failing, firstContact: new Set() });
    assert.strictEqual(out.notify, 'ai_error');
    assert.ok(out.reply.includes('담당자'));
  });

  const commentBody = (id, text, from = 'u1', media = 'm1') => ({ entry: [{ id: 'me', changes: [{ field: 'comments', value: { id, text, from: { id: from, username: 'x' }, media: { id: media } } }] }] });

  await t('댓글: 키워드 있으면 언어 맞춰 링크 DM, 없으면 무시', () => {
    const sent = new Set();
    const [c1] = A.extractComments(commentBody('c1', 'BUSAN 🙌'), new Set(), 'me');
    const p1 = A.planCommentReply(c1, sent);
    assert.strictEqual(p1.lang, 'en'); assert.ok(p1.dm.includes('apply.html?lang=en&utm_source=instagram&utm_medium=comment'));
    const [c2] = A.extractComments(commentBody('c2', '我想參加 釜山', 'u2'), new Set(), 'me');
    assert.ok(A.planCommentReply(c2, sent).dm.includes('lang=zh'));
    const [c3] = A.extractComments(commentBody('c3', '부산 살아요!', 'u3'), new Set(), 'me');
    assert.ok(A.planCommentReply(c3, sent).dm.includes('local.html'));
    const [c4] = A.extractComments(commentBody('c4', 'nice photo', 'u4'), new Set(), 'me');
    assert.strictEqual(A.planCommentReply(c4, sent), null);
  });

  await t('댓글: 내 댓글·같은 댓글·같은 사람 같은 게시물 중복은 1번만', () => {
    const seenC = new Set(), sent = new Set();
    assert.strictEqual(A.extractComments(commentBody('c9', 'busan', 'me'), seenC, 'me').length, 0);
    const a = A.extractComments(commentBody('c10', 'busan'), seenC, 'me');
    const b = A.extractComments(commentBody('c10', 'busan'), seenC, 'me');
    assert.strictEqual(a.length, 1); assert.strictEqual(b.length, 0);
    assert.ok(A.planCommentReply(a[0], sent));
    const [again] = A.extractComments(commentBody('c11', 'busan link pls'), seenC, 'me');
    assert.strictEqual(A.planCommentReply(again, sent), null);
  });

  await t('댓글: 데이트 목적이면 링크 대신 담당자 알림', () => {
    const [c] = A.extractComments(commentBody('c20', 'busan girlfriend?', 'u20'), new Set(), 'me');
    const p = A.planCommentReply(c, new Set());
    assert.strictEqual(p.dm, null); assert.strictEqual(p.notify, 'dating');
  });

  await t('댓글: 비공개 답장은 comment_id로 보냄', async () => {
    let req;
    await A.sendPrivateReply('c77', 'hi', { igToken: 't', fetchImpl: async (url, o) => { req = { url, body: JSON.parse(o.body) }; return { ok: true }; } });
    assert.ok(req.url.endsWith('/me/messages'));
    assert.deepStrictEqual(req.body.recipient, { comment_id: 'c77' });
  });

  console.log(`\n${n} tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
