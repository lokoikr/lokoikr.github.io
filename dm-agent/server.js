// LoKo.i 인스타그램 DM 다국어 자동 응대 서버 (의존성 없음, Node 18 이상)
// 실행: node server.js   (환경변수는 README.md 참고)
const http = require('http');
const A = require('./agent');

const env = process.env;
const PORT = Number(env.PORT) || 3000;
const ctx = {
  apiKey: env.ANTHROPIC_API_KEY,
  model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  igToken: env.IG_ACCESS_TOKEN,
  graphVersion: env.GRAPH_VERSION || 'v21.0',
  firstContact: new Set()
};
const seen = new Set();
const seenComments = new Set(), sentPairs = new Set();

function log(...a) { console.log(new Date().toISOString(), ...a); }

async function notifyTeam(info) {
  log('HANDOFF', JSON.stringify(info));
  if (!env.NOTIFY_WEBHOOK_URL) return;
  try {
    await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: `[LoKo.i DM] ${info.kind} · ${info.lang} · ${info.text.slice(0, 200)}` })
    });
  } catch (e) { log('notify failed', e.message); }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET' && url.pathname === '/') { res.end('LoKo.i DM agent OK'); return; }

  // 메타 웹훅 등록 확인
  if (req.method === 'GET' && url.pathname === '/webhook') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env.VERIFY_TOKEN;
    res.writeHead(ok ? 200 : 403); res.end(ok ? url.searchParams.get('hub.challenge') : 'forbidden'); return;
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks);
      if (!A.verifySignature(raw, req.headers['x-hub-signature-256'], env.APP_SECRET)) { res.writeHead(401); res.end(); return; }
      res.writeHead(200); res.end('EVENT_RECEIVED'); // 메타에는 바로 200 응답
      let body; try { body = JSON.parse(raw.toString('utf8')); } catch { return; }
      for (const msg of A.extractMessages(body, seen)) {
        try {
          const out = await A.handleMessage(msg, ctx);
          if (out.notify) await notifyTeam({ kind: out.notify, lang: out.lang, text: msg.text, sender: msg.senderId });
          if (env.DRY_RUN === '1') { log('DRY_RUN reply', out.reply); continue; }
          await A.sendDM(msg.senderId, out.reply, ctx);
          log('replied', out.lang, out.notify || 'ai');
        } catch (e) { log('error', e.message); }
      }
      // 댓글 → 링크 DM (COMMENT_DM=1 일 때만)
      if (env.COMMENT_DM === '1') {
        for (const c of A.extractComments(body, seenComments, env.IG_USER_ID)) {
          try {
            const plan = A.planCommentReply(c, sentPairs);
            if (!plan) continue;
            if (plan.notify) await notifyTeam({ kind: 'comment_' + plan.notify, lang: plan.lang, text: c.text, sender: c.username });
            if (!plan.dm) continue;
            if (env.DRY_RUN === '1') { log('DRY_RUN comment DM', c.username, plan.lang); continue; }
            await A.sendPrivateReply(c.commentId, plan.dm, ctx);
            if (env.PUBLIC_REPLY === '1') await A.replyToComment(c.commentId, plan.publicReply, ctx).catch(e => log('public reply failed', e.message));
            log('comment DM sent', plan.lang);
          } catch (e) { log('comment error', e.message); }
        }
        if (seenComments.size > 5000) { seenComments.clear(); sentPairs.clear(); }
      }
      if (seen.size > 5000) seen.clear();
    });
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => log('LoKo.i DM agent on port', PORT, env.DRY_RUN === '1' ? '(DRY_RUN)' : ''));
