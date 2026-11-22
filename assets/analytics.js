// LoKo.i 방문 분석 (Umami: 쿠키 없음, 개인정보 저장 안 함)
// config.js 의 UMAMI_WEBSITE_ID 가 비어 있으면 아무것도 하지 않아요.
(function () {
  var cfg = window.LOKOI_CONFIG || {};
  var id = cfg.UMAMI_WEBSITE_ID;
  var queue = [];
  // 페이지 어디서든 LokoTrack('이벤트', {데이터}) 로 기록 (스크립트가 늦게 떠도 모았다가 보냄)
  window.LokoTrack = function (name, data) {
    if (!id) return;
    if (window.umami && window.umami.track) window.umami.track(name, data);
    else queue.push([name, data]);
  };
  if (!id) return;
  var s = document.createElement('script');
  s.defer = true;
  s.src = cfg.UMAMI_SRC || 'https://cloud.umami.is/script.js';
  s.setAttribute('data-website-id', id);
  s.setAttribute('data-domains', 'lokoikr.github.io');
  s.onload = function () {
    var t = setInterval(function () {
      if (!window.umami) return;
      clearInterval(t);
      queue.splice(0).forEach(function (q) { window.umami.track(q[0], q[1]); });
    }, 300);
    setTimeout(function () { clearInterval(t); }, 10000);
  };
  document.head.appendChild(s);
})();
