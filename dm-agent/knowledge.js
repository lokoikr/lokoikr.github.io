// LoKo.i 다국어 DM 응대: AI에게 주는 서비스 정보와 규칙
// 내용이 바뀌면 여기만 고치면 됩니다.

const SITE = process.env.SITE_URL || 'https://minucoo.github.io/loko-i-web';

const SYSTEM_PROMPT = `You are the Instagram DM assistant for LoKo.i (@lokoi.kr), a free service in Busan, Korea that connects travelers with Busan locals who enjoy the same activities.

FACTS (only use these; never invent prices, places, people or schedules):
- LoKo.i is free for travelers and locals. No fees, ever.
- It is NOT a tour (locals are not paid guides) and NOT a dating app.
- Activities: walks & nature, sports (running, surfing, futsal), watching games, food & markets, culture & art, by the sea.
- How to join: fill in the form at ${SITE}/apply.html (about 3 minutes). We usually reply within 1-2 days. Apply at least 3 days before the date if possible.
- Busan locals who want to join: ${SITE}/local.html
- Safety rules: meet only in public places and finish by 10 pm; no home/hotel visits or private cars; everyone pays their own costs; locals pass an ID check and a short video call first.
- Languages: most locals speak English; some speak Chinese or Japanese.

HOW TO REPLY:
- Reply in the same language the user wrote in (English, Traditional Chinese for Chinese, Korean, or Japanese).
- Keep it short and friendly: at most 3 short sentences, plain text, at most one emoji.
- If they want to meet a local, point them to the apply link.
- If you do not know something (opening hours, prices of places, a specific person), say a team member will reply soon. Do not guess.
- Never ask for passport numbers, card numbers or passwords. Never share anyone's personal contact details.
- Never arrange a meeting yourself; matching is done by the team after the form.`;

// 처음 대화하는 사람에게 붙이는 AI 안내 (언어별)
const AI_NOTE = {
  en: '(Automatic reply from LoKo.i. A team member can join anytime.)',
  zh: '（這是 LoKo.i 的自動回覆，團隊成員隨時可以接手。）',
  ko: '(LoKo.i 자동 응답이에요. 언제든 담당자가 이어서 답해 드려요.)',
  ja: '（LoKo.iの自動返信です。担当者がいつでも対応します。）'
};

// 사람에게 넘길 때 보내는 답 (언어별)
const HANDOFF = {
  en: 'Thanks for telling us. A LoKo.i team member will reply to you personally very soon.',
  zh: '謝謝你告訴我們，LoKo.i 團隊成員會盡快親自回覆你。',
  ko: '알려 주셔서 감사해요. LoKo.i 담당자가 곧 직접 답해 드릴게요.',
  ja: 'お知らせありがとうございます。LoKo.iの担当者がすぐに直接ご連絡します。'
};

const EMERGENCY = {
  en: 'If you are in danger, call 112 (police) or 119 (ambulance) now. Our team has been alerted and will contact you.',
  zh: '如果你有危險，請立即撥打 112（警察）或 119（救護車）。我們的團隊已收到通知，會馬上聯絡你。',
  ko: '위험한 상황이면 지금 바로 112(경찰)나 119(구급)에 전화하세요. 담당자에게도 알렸고 곧 연락드릴게요.',
  ja: '危険な状況なら、すぐに112（警察）か119（救急）に電話してください。担当者にも知らせました。'
};

// 댓글 → DM 자동 링크 (인스타 '비공개 답장'). 키워드 댓글에 1번만 보냄.
// utm_source=instagram&utm_medium=comment 는 방문 분석에서 '댓글로 들어온 사람'을 구분하려는 표시
const COMMENT_DM = {
  en: `Hi! Thanks for your comment 🌊 Here's how to meet a Busan local who loves the same things, free:\n${SITE}/apply.html?lang=en&utm_source=instagram&utm_medium=comment\nIt takes about 3 minutes. Any questions, just reply here!`,
  zh: `嗨！謝謝你的留言 🌊 這裡可以免費配對和你喜好相同的釜山在地人：\n${SITE}/apply.html?lang=zh&utm_source=instagram&utm_medium=comment\n填寫大約 3 分鐘，有問題直接回覆這裡就好！`,
  ko: `댓글 고마워요 🌊 부산에 사신다면 외국인 여행자와 함께하는 현지인으로 참여해 보세요 (무료):\n${SITE}/local.html?lang=ko&utm_source=instagram&utm_medium=comment\n궁금한 건 여기로 답장 주세요!`,
  ja: `コメントありがとうございます 🌊 同じ趣味の釜山ローカルと無料でつながれます：\n${SITE}/apply.html?lang=en&utm_source=instagram&utm_medium=comment\n約3分で申し込めます。質問はこちらに返信してください！`
};

// 댓글에 공개로 다는 짧은 답 (같은 문장 반복은 스팸처럼 보여서 돌려 씀)
const PUBLIC_REPLY = {
  en: ['Sent you a DM 📩', 'Check your DMs! 🌊', 'Link is in your DMs 🙌'],
  zh: ['已私訊給你 📩', '請看私訊喔！🌊', '連結已傳到私訊 🙌'],
  ko: ['DM 보냈어요 📩', 'DM 확인해 주세요! 🌊', 'DM으로 링크 보냈어요 🙌'],
  ja: ['DMを送りました 📩', 'DMをご確認ください！🌊', 'DMにリンクを送りました 🙌']
};

// 이 단어가 들어간 댓글에만 링크 DM (환경변수 COMMENT_KEYWORDS 로 바꿀 수 있음)
const COMMENT_KEYWORDS = (process.env.COMMENT_KEYWORDS || 'busan,부산,釜山,link,링크,連結,local,로컬,apply,신청,報名').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

module.exports = { SYSTEM_PROMPT, AI_NOTE, HANDOFF, EMERGENCY, SITE, COMMENT_DM, PUBLIC_REPLY, COMMENT_KEYWORDS };
