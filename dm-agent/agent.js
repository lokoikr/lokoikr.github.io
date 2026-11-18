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

module.exports = { detectLang, classify, verifySignature, extractMessages, handleMessage, sendDM, askClaude };
