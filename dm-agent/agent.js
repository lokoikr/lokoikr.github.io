// LoKo.i DM 응대 로직: 언어 감지 → 안전 확인 → AI 답변 또는 담당자 연결
const crypto = require('crypto');
const K = require('./knowledge');

function detectLang(text) {
  const s = String(text || '');
  if (/[가-힣]/.test(s)) return 'ko';
  if (/[぀-ヿ]/.test(s)) return 'ja';
  if (/[一-鿿]/.test(s)) return 'zh';
  return 'en';
}

// 사람에게 바로 넘길 메시지 (규칙 기반, AI보다 먼저 판단)
const RULES = [
  { kind: 'emergency', re: /(help me|emergency|police|danger|scared|attack|救命|危險|報警|살려|위험해|경찰|도와주세요|助けて|危ない)/i },
  { kind: 'report', re: /(harass|creepy|uncomfortable|touched me|report|騷擾|不舒服|檢舉|성희롱|불편했|신고|추행|セクハラ|不快)/i },
  { kind: 'dating', re: /(date me|girlfriend|boyfriend|hook ?up|sexy|約會|女朋友|男朋友|데이트 하실|여자친구|남자친구|섹시|デート|彼女|彼氏)/i },
  { kind: 'money', re: /(refund|pay you|charged|scam|退款|付錢|詐騙|환불|돈을 냈|사기|返金|詐欺)/i }
];

function classify(text) {
  for (const r of RULES) if (r.re.test(text)) return r.kind;
  return null;
}

function verifySignature(rawBody, header, appSecret) {
  if (!appSecret) return true; // 개발 중에만: APP_SECRET 없으면 검사 생략
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 웹훅 본문에서 처리할 메시지만 뽑기 (내가 보낸 메시지·중복 제외)
function extractMessages(body, seen) {
  const out = [];
  for (const entry of (body && body.entry) || []) {
    for (const ev of entry.messaging || []) {
      const m = ev.message;
      if (!m || m.is_echo || !m.text || !ev.sender) continue;
      if (seen && m.mid) { if (seen.has(m.mid)) continue; seen.add(m.mid); }
      out.push({ senderId: ev.sender.id, text: m.text.slice(0, 2000), mid: m.mid });
    }
  }
  return out;
}

async function askClaude(text, lang, { apiKey, model, fetchImpl }) {
  const res = await (fetchImpl || fetch)('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 300, system: K.SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `[user language: ${lang}]\n${text}` }]
    })
  });
  if (!res.ok) throw new Error('Claude API ' + res.status);
  const data = await res.json();
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
}

// 메시지 1건 → 보낼 답장과 담당자 알림 여부
async function handleMessage(msg, ctx) {
  const lang = detectLang(msg.text);
  const kind = classify(msg.text);
  if (kind === 'emergency') return { reply: K.EMERGENCY[lang], notify: kind, lang };
  if (kind) return { reply: K.HANDOFF[lang], notify: kind, lang };

  let reply;
  try {
    reply = await askClaude(msg.text, lang, ctx);
  } catch (e) {
    return { reply: K.HANDOFF[lang], notify: 'ai_error', lang, error: e.message };
  }
  if (!reply) return { reply: K.HANDOFF[lang], notify: 'empty', lang };
  const first = ctx.firstContact && !ctx.firstContact.has(msg.senderId);
  if (first) { ctx.firstContact.add(msg.senderId); reply += '\n\n' + K.AI_NOTE[lang]; }
  return { reply: reply.slice(0, 900), notify: null, lang };
}

async function sendDM(recipientId, text, { igToken, graphVersion, fetchImpl }) {
  const url = `https://graph.instagram.com/${graphVersion || 'v21.0'}/me/messages`;
  const res = await (fetchImpl || fetch)(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${igToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
  });
  if (!res.ok) throw new Error('Instagram send ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

// ---------- 댓글 → DM (인스타 '비공개 답장') ----------
// 웹훅 'comments' 필드에서 처리할 댓글만 뽑기 (내 댓글·중복 제외)
function extractComments(body, seen, selfId) {
  const out = [];
  for (const entry of (body && body.entry) || []) {
    for (const ch of entry.changes || []) {
      if (ch.field !== 'comments' || !ch.value) continue;
      const v = ch.value, from = v.from || {};
      if (!v.id || !v.text) continue;
      if (selfId && (from.id === selfId || entry.id === from.id)) continue;
      if (seen) { if (seen.has(v.id)) continue; seen.add(v.id); }
      out.push({ commentId: v.id, text: String(v.text).slice(0, 500), userId: from.id, username: from.username, mediaId: v.media && v.media.id });
    }
  }
  return out;
}

function matchesKeyword(text, keywords) {
  const s = String(text || '').toLowerCase();
  return (keywords || K.COMMENT_KEYWORDS).some(k => s.includes(k));
}

// 댓글 1건 → 보낼 DM (키워드 없거나 같은 게시물에 이미 보낸 사람이면 null)
// mode 'any'(기본): 모든 댓글에 1번 · 'keyword': 키워드 댓글에만
// (계정 정지 예방 결정 2026-11-07: 같은 키워드 반복 유도는 봇으로 보일 수 있어 '아무 댓글이나'가 기본)
function planCommentReply(c, sentPairs, keywords, mode) {
  if ((mode || process.env.COMMENT_MODE || 'any') === 'keyword' && !matchesKeyword(c.text, keywords)) return null;
  const pair = (c.userId || c.commentId) + '|' + (c.mediaId || '');
  if (sentPairs && sentPairs.has(pair)) return null;
  if (sentPairs) sentPairs.add(pair);
  // 한글 댓글 → 부산 사는 사람일 가능성이 커서 현지인 등록 링크
  const lang = detectLang(c.text);
  const kind = classify(c.text);
  // 데이트·돈 목적 댓글엔 링크를 보내지 않고 담당자에게만 알림
  if (kind === 'dating' || kind === 'money') return { lang, dm: null, notify: kind, publicReply: null };
  return { lang, dm: K.COMMENT_DM[lang], notify: kind, publicReply: K.PUBLIC_REPLY[lang][Math.floor(Math.random() * K.PUBLIC_REPLY[lang].length)] };
}

async function sendPrivateReply(commentId, text, { igToken, graphVersion, fetchImpl }) {
  const url = `https://graph.instagram.com/${graphVersion || 'v21.0'}/me/messages`;
  const res = await (fetchImpl || fetch)(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${igToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } })
  });
  if (!res.ok) throw new Error('Private reply ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

async function replyToComment(commentId, text, { igToken, graphVersion, fetchImpl }) {
  const url = `https://graph.instagram.com/${graphVersion || 'v21.0'}/${encodeURIComponent(commentId)}/replies`;
  const res = await (fetchImpl || fetch)(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${igToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: text })
  });
  if (!res.ok) throw new Error('Comment reply ' + res.status);
}

module.exports = { detectLang, classify, verifySignature, extractMessages, handleMessage, sendDM, askClaude,
  extractComments, matchesKeyword, planCommentReply, sendPrivateReply, replyToComment };
