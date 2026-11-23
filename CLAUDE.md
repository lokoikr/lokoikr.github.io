# LoKo.i — Claude Code 프로젝트 안내

부산을 찾은 외국인 여행자와, 같은 활동을 좋아하는 부산 현지인을 **무료로 연결**하는 플랫폼의 웹사이트·운영 도구.
대표 민우. 공식 인스타 **@lokoi.kr**. 사이트 **https://lokoikr.github.io** (GitHub 단체 계정 lokoikr, 저장소 `lokoikr/lokoikr.github.io`, Pages: main / root).

## 일하는 방식 (꼭 지키기)
- 답변은 **한국어, 짧게(약 500자), 결론 먼저**.
- 표현은 "진행·운영한다"가 아니라 **"연결한다"**. LoKo.i는 중개 플랫폼이지 투어·데이팅이 아님.
- 사용자(여행자·현지인)는 **영구 무료**. 식당·가게 연결 수수료 받지 않음. 광고는 협찬 표시 필수.
- 안전 수칙: 낮·공개 장소, 22시 전 종료, **숙소·자택·개인 차량·술 중심 활동 금지**, 소그룹 기본.
- 로그인·비밀번호·신분번호 입력, 결제, 계정 생성, CAPTCHA는 Claude가 하지 않고 민우가 직접.
- 민우 이름으로 메시지 보내기·자동 답장 켜기 등은 **매번 민우 OK 받고** 진행.
- 개인정보: 민우 이메일·연락처는 사이트·커밋에 넣지 않음. **관리자 키(ADMIN_KEY)는 절대 커밋 금지.**

## 구조
| 경로 | 내용 |
|---|---|
| `index.html` `apply.html` `local.html` `activities.html` `privacy.html` | 정적 페이지. 영어는 HTML 안, 번체(zh)·한국어(ko)는 `assets/i18n.js` 사전 |
| `assets/form.js` | 휴대폰 4단계 신청서: 단계별 검사, 임시 저장(localStorage), 조건부 칸(`data-show-when`), 사진 1024px JPEG로 줄여 업로드, `fill_seconds`, LokoTrack 이벤트 |
| `assets/match.js` | 매칭 엔진 v0.2. 필수: 언어(한국어는 한국인/한국어 가능 현지인), 같은 성별 선호(양쪽), 여행 기간 안 날짜, 일행 ≤ max_group('5+'=99), 신원 확인. 점수 W = 활동40·지역20·시간20·언어수준10·한국인현지인5·배분5. 다른 날짜 제안 −10, 현지인당 최대 2건 |
| `assets/trust.js` | 신청자 점검 ok/check/risk: 일회용 메일, 20초 미만 작성, 중복, 데이트·돈·밤·연락처 표현, 사진 없음, 짧은 소개, 60일 넘는 체류 |
| `assets/card.js` | 매칭 때 상대에게 보낼 소개 카드·DM 문구. 이름(성 제외)·사진·나이대·소개·활동만. 연락처·숙소·풀네임 절대 미포함 |
| `assets/analytics.js` | Umami(쿠키 없음). `config.js`의 `UMAMI_WEBSITE_ID`가 비면 꺼짐(민우 가입 대기) |
| `assets/config.js` | ENDPOINT(Apps Script 웹 앱 URL), `PHOTO_UPLOAD: true` |
| `admin/` | 매칭 관리 화면. 관리자 키로 시트 불러오기 / CSV / `?demo=1`(sample.js). 신청자 점검 탭, 소개 카드 만들기(html2canvas) |
| `apps-script/Code.gs` | 구글 시트 'LoKo.i 웹 신청'에 저장. doPost(모든 칸 일반 텍스트, 사진은 드라이브 'LoKo.i 신청 사진'), doGet(`?key=` 관리자용 목록, `&photo=ID`). 시트 탭: 여행자 신청 / 현지인 등록. 새 항목은 열 자동 추가 → 열만 늘면 재배포 불필요 |
| `dm-agent/` | 인스타 DM·댓글 다국어 응대 서버(Node). **현재 보류**(배포 안 함) |
| `tests/` | `node tests/match.test.js`(18) · `node tests/trust.test.js`(7) · `node dm-agent/test.js`(13) |

## 배포
- `main`에 push하면 1~2분 뒤 GitHub Pages에 반영. 빌드 없음(순수 HTML/JS).
- 바꾸기 전후로 위 테스트 3개 실행. i18n 키 누락도 확인(HTML의 `data-i18n` 키가 zh·ko 사전에 모두 있어야 함).
- Apps Script 코드를 바꿨다면 시트의 Apps Script 편집기에 붙여 넣고 **배포 관리 › 새 버전**으로 갱신(URL 그대로).

## 운영 흐름
시트에 `신규` → 현지인 영상통화·신원 확인 후 `확인 완료` → admin에서 매칭 추천 → 소개 카드를 양쪽에 보내 둘 다 "좋아요" → @lokoi.kr + 두 사람 인스타 단체 DM으로 연결 → `연결 완료`.

## 확정된 결정 (요약)
- 최우선 목표: 4~6주 안에 실제 연결 5건.
- 신청 유입은 **인스타 프로필 링크**(여행자·현지인 2개). 댓글→DM 자동화(ManyChat·메타 자동 답장·dm-agent)는 보류. DM은 협업 문의가 올 수 있어 직접 응대.
- 인스타 계정 보호: 같은 키워드 댓글 유도 금지, 스크래핑·자동 팔로우·대량 DM 금지.
- 인스타 프로필 이름·소개는 누나가 만든 것 유지(Claude가 바꾸지 않음).
- 오픈소스는 쓸 때만: 지금은 Umami만. 로그인·신뢰 온도는 서비스가 통한 뒤(앱 전환 때).
- 더 자세한 결정은 claude.ai 프로젝트 문서 `LoKo.i-결정-기록.md` 참고.

## 프로필 링크
- 여행자: `https://lokoikr.github.io/apply.html?utm_source=instagram&utm_medium=bio`
- 현지인: `https://lokoikr.github.io/local.html?lang=ko&utm_source=instagram&utm_medium=bio`

## 남은 일
- Umami 가입 후 Website ID → `assets/config.js`에 넣기.
- 길거리 인터뷰(영어·일본어 질문지) 결과를 신청서 문항·활동 목록에 반영.
- 첫 신청이 들어오면 admin 매칭 → 소개 카드 → 연결 흐름 실전 점검.
