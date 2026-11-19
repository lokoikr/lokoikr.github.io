/*
 * LoKo.i 소개 카드 — 연결 상대에게 보여 줄 프로필 (신청서 미리보기 · 매칭 관리 화면 공용)
 *   LokoCard.build(row, type, lang, photoUrl, opts) → HTMLElement
 *   LokoCard.message(traveler, local, to, lang) → 복사해서 DM으로 보낼 문장
 *   type: 'traveler' | 'local', lang: 'en' | 'zh' | 'ko'
 * 연락처(이메일·전화·카톡·LINE)·성(姓)·숙소는 카드에 절대 넣지 않아요.
 */
(function (root) {
  'use strict';

  var V = {
    'Walks & nature': ['Walks & nature', '散步·自然', '산책·자연'],
    'Sports': ['Sports', '運動', '운동'],
    'Games': ['Watching a game', '看比賽', '경기 관람'],
    'Food & markets': ['Food & markets', '美食·市場', '음식·시장'],
    'Culture & art': ['Culture & art', '文化·藝術', '문화·예술'],
    'By the sea': ['By the sea', '海邊', '바다'],
    'Learn & daily life': ['Korean, cooking & daily life', '韓語·料理·日常', '한국어·요리·일상'],
    'Views & old town': ['Views & old town', '景觀·舊城', '전망·원도심'],
    'Kids & family': ['Kids & family', '親子·家庭', '아이·가족'],
    'Haeundae / Centum': ['Haeundae', '海雲台', '해운대'], 'Gwangalli / Suyeong': ['Gwangalli', '廣安里', '광안리'],
    'Seomyeon / Jeonpo': ['Seomyeon', '西面', '서면'], 'Nampo / Jung-gu': ['Nampo', '南浦', '남포'],
    'Yeongdo': ['Yeongdo', '影島', '영도'], 'Gijang / Songjeong': ['Gijang', '機張', '기장'], 'Anywhere': ['Anywhere', '都可以', '어디든'],
    'English': ['English', '英文', '영어'], 'Chinese': ['Chinese', '中文', '중국어'], 'Japanese': ['Japanese', '日文', '일본어'], 'Korean': ['Korean', '韓文', '한국어'],
    'Fluent': ['fluent', '流利', '유창'], 'Conversational': ['conversational', '日常會話', '일상 대화'], 'Basic': ['basic', '基礎', '기초'],
    'Woman': ['Woman', '女性', '여성'], 'Man': ['Man', '男性', '남성'],
    'Morning': ['morning', '上午', '오전'], 'Afternoon': ['afternoon', '下午', '오후'], 'Evening': ['evening', '晚上', '저녁'],
    'Born here': ['Born and raised in Busan', '釜山土生土長', '부산 토박이'], '10+ years': ['In Busan 10+ years', '住釜山 10 年以上', '부산 10년 이상'],
    '3-10 years': ['In Busan 3–10 years', '住釜山 3–10 年', '부산 3~10년'], 'Under 3 years': ['In Busan under 3 years', '住釜山不到 3 年', '부산 3년 미만'],
    'First time in Korea': ['First time in Korea', '第一次來韓國', '한국 첫 방문'], 'First time in Busan': ['First time in Busan', '第一次來釜山', '부산 첫 방문'], 'Been to Busan': ['Been to Busan before', '來過釜山', '부산 재방문'],
    'None': ['No Korean yet', '還不會韓文', '한국어 못 함'], 'A little': ['A little Korean', '會一點韓文', '한국어 조금'],
    'Light': ['Light budget (~₩10,000)', '預算輕鬆（約 1 萬韓元）', '가볍게 (1만 원 안팎)'], 'Normal': ['Normal budget (~₩20,000)', '一般預算（約 2 萬韓元）', '보통 (2만 원 안팎)'], 'Any': ['Any budget', '預算都可以', '예산 상관없음']
  };
  var KL = { 'Conversational': ['Can chat in Korean', '能用韓文聊天', '한국어 대화 가능'] };
  var L = {
    en: { busan: 'Busan local', verified: 'ID checked', lang: 'Speaks', likes: 'Loves', spot: 'Favorite spot', wants: 'Wants to', when: 'When', where: 'Area', group: 'Group', kids: 'kids', notes: 'Good to know', people: 'people', solo: 'Solo', from: 'from', age: 'age' },
    zh: { busan: '釜山在地人', verified: '已確認身分', lang: '語言', likes: '喜歡', spot: '私房景點', wants: '想做', when: '時間', where: '區域', group: '人數', kids: '小孩', notes: '注意事項', people: '人', solo: '一人', from: '來自', age: '年齡' },
    ko: { busan: '부산 현지인', verified: '신원 확인', lang: '언어', likes: '좋아하는 것', spot: '단골 장소', wants: '하고 싶은 것', when: '날짜', where: '지역', group: '인원', kids: '아이', notes: '참고', people: '명', solo: '혼자', from: '', age: '' }
  };
  var IDX = { en: 0, zh: 1, ko: 2 };

  function clean(s) { return String(s || '').trim(); }
  function list(v) { return String(v || '').split(',').map(clean).filter(Boolean); }
  function tr(v, lang) { var t = V[clean(v)]; return t ? t[IDX[lang] || 0] : clean(v); }
  function trList(v, lang, sep) { return list(v).map(function (x) { return tr(x, lang); }).join(sep || ', '); }
  // 이름은 성 빼고: '김지은' → '지은', 'Mei Lin' → 'Mei'
  function firstName(n) {
    n = clean(n).replace(/\[TEST\]\s*/i, '');
    if (/^[가-힣]{3,4}$/.test(n)) return n.slice(1);
    return n.split(/\s+/)[0] || n;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtDate(d, lang) {
    var m = String(d || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return clean(d);
    var dt = new Date(+m[1], +m[2] - 1, +m[3]);
    var wd = [['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ['日', '一', '二', '三', '四', '五', '六'], ['일', '월', '화', '수', '목', '금', '토']][IDX[lang] || 0][dt.getDay()];
    if (lang === 'en') return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + +m[3] + ' (' + wd + ')';
    if (lang === 'zh') return +m[2] + '月' + +m[3] + '日（' + wd + '）';
    return +m[2] + '월 ' + +m[3] + '일 (' + wd + ')';
  }

  function facts(r, type, lang) {
    var t = L[lang] || L.en, out = [];
    if (type === 'local') {
      var langs = list(r.languages).filter(function (x) { return x !== 'Korean'; });
      if (langs.length) out.push([t.lang, langs.map(function (x) { return tr(x, lang); }).join(', ') + (r.language_level ? ' · ' + tr(r.language_level, lang) : '')]);
      if (r.activities) out.push([t.likes, trList(r.activities, lang)]);
      if (r.fav_spot) out.push([t.spot, clean(r.fav_spot)]);
      if (r.areas || r.home_district) out.push([t.where, trList(r.areas, lang) || clean(r.home_district)]);
    } else {
      if (r.activities) out.push([t.wants, trList(r.activities, lang)]);
      var when = [fmtDate(r.preferred_date, lang), trList(r.time_slots, lang)].filter(Boolean).join(' · ');
      if (when) out.push([t.when, when]);
      var area = list(r.areas).filter(function (x) { return x !== 'Anywhere'; });
      if (area.length) out.push([t.where, area.map(function (x) { return tr(x, lang); }).join(', ')]);
      var n = parseInt(r.group_size, 10) || 1;
      var g = n === 1 ? t.solo : (lang === 'en' ? n + ' ' + t.people : n + t.people);
      if (clean(r.kids_ages)) g += ' · ' + t.kids + ' ' + clean(r.kids_ages);
      out.push([t.group, g]);
      var lg = list(r.languages).map(function (x) { return tr(x, lang); }).join(', ');
      var kl = r.korean_level ? (KL[r.korean_level] ? KL[r.korean_level][IDX[lang] || 0] : tr(r.korean_level, lang)) : '';
      if (lg || kl) out.push([t.lang, [lg, kl].filter(Boolean).join(' · ')]);
      if (r.budget) out.push(['₩', tr(r.budget, lang)]);
      if (r.notes) out.push([t.notes, clean(r.notes)]);
    }
    return out;
  }

  function subtitle(r, type, lang) {
    var t = L[lang] || L.en, bits = [];
    if (type === 'local') {
      bits.push(r.busan_years ? tr(r.busan_years, lang) : t.busan);
      if (r.occupation) bits.push(clean(r.occupation));
      if (r.age_range) bits.push(clean(r.age_range).replace('-', '–'));
    } else {
      if (r.country) bits.push((lang === 'en' ? 'From ' : t.from) + clean(r.country));
      if (r.age_range) bits.push(clean(r.age_range).replace('-', '–'));
      if (r.first_visit) bits.push(tr(r.first_visit, lang));
    }
    return bits.join(' · ');
  }

  // 외국인에게 보여 줄 땐 영문 이름(name_en)이 있으면 그걸 씀
  function shownName(r, lang) { return (lang !== 'ko' && clean(r.name_en)) ? clean(r.name_en) : firstName(r.name); }

  function build(r, type, lang, photoUrl, opts) {
    opts = opts || {}; lang = L[lang] ? lang : 'en';
    var t = L[lang], card = el('div', 'lk-card');
    var head = el('div', 'lk-card-head');
    var ph = el('div', 'lk-card-photo');
    if (photoUrl) ph.style.backgroundImage = 'url("' + photoUrl + '")';
    else ph.textContent = shownName(r, lang).charAt(0) || '?';
    head.appendChild(ph);
    var who = el('div', 'lk-card-who');
    var nm = el('b', null, shownName(r, lang) || '—');
    who.appendChild(nm);
    if (type === 'local' && /확인 완료|verified/i.test(r.status || '') && !opts.preview) who.appendChild(el('span', 'lk-card-badge', '✓ ' + t.verified));
    who.appendChild(el('small', null, subtitle(r, type, lang)));
    head.appendChild(who);
    card.appendChild(head);
    var quote = clean(type === 'local' ? r.intro : r.about_me);
    if (quote) card.appendChild(el('p', 'lk-card-quote', '“' + quote + '”'));
    var dl = el('dl', 'lk-card-facts');
    facts(r, type, lang).forEach(function (f) { dl.appendChild(el('dt', null, f[0])); dl.appendChild(el('dd', null, f[1])); });
    card.appendChild(dl);
    var foot = el('div', 'lk-card-foot');
    foot.appendChild(el('span', 'lk-card-logo', 'LoKo.i'));
    foot.appendChild(el('span', null, type === 'local' ? t.busan : (lang === 'ko' ? '여행자' : lang === 'zh' ? '旅人' : 'Traveler')));
    card.appendChild(foot);
    return card;
  }

  // DM 문장: to = 'traveler'(여행자에게 현지인 소개) | 'local'(현지인에게 여행자 소개)
  function message(tRow, lRow, to, lang, date) {
    var d = date || tRow.preferred_date;
    if (to === 'traveler') {
      var ln = shownName(lRow, lang), tn = firstName(tRow.name);
      var lines = facts(lRow, 'local', lang).map(function (f) { return '· ' + f[0] + ': ' + f[1]; }).join('\n');
      if (lang === 'zh') return '嗨 ' + tn + '！我們幫你找到釜山在地夥伴：' + ln + '（' + subtitle(lRow, 'local', 'zh') + '）\n' +
        (lRow.intro ? '「' + clean(lRow.intro) + '」\n' : '') + lines + '\n\n日期：' + fmtDate(d, 'zh') +
        '\n想見面的話回覆「好」，我們會開一個 Instagram 群組（你、' + ln + ' 和 LoKo.i）。對方的聯絡方式會在雙方都同意後才分享。';
      return 'Hi ' + tn + '! We found your Busan local: ' + ln + ' (' + subtitle(lRow, 'local', 'en') + ')\n' +
        (lRow.intro ? '"' + clean(lRow.intro) + '"\n' : '') + lines + '\n\nDate: ' + fmtDate(d, 'en') +
        '\nIf you\'d like to meet, reply YES and we\'ll open an Instagram group chat with you, ' + ln + ' and LoKo.i. Contacts are shared only after you both say yes.';
    }
    var tn2 = firstName(tRow.name), ln2 = firstName(lRow.name);
    var lines2 = facts(tRow, 'traveler', 'ko').map(function (f) { return '· ' + f[0] + ': ' + f[1]; }).join('\n');
    return ln2 + '님, 함께할 여행자를 소개해요! ' + tn2 + ' (' + subtitle(tRow, 'traveler', 'ko') + ')\n' +
      (tRow.about_me ? '"' + clean(tRow.about_me) + '"\n' : '') + lines2 +
      '\n\n만날 수 있으면 "좋아요"라고 답장 주세요. 둘 다 좋다고 하면 인스타 단체 DM(여행자, ' + ln2 + '님, LoKo.i)을 열어 드려요. 어렵다면 편하게 거절하셔도 괜찮아요.';
  }

  var api = { build: build, message: message, firstName: firstName, shownName: shownName, facts: facts, subtitle: subtitle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LokoCard = api;
})(this);
