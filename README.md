# 마하나임교회 웹앱 — 강단 메시지 · 본부 메시지 · 전도 도구

빌드 과정이 없는 정적 웹앱입니다(HTML + JS 모듈 + JSON). Vercel이 파일을 그대로 서비스합니다.

- 화면 순서: **강단 메시지 → 본부 메시지 → 전도 도구(복음 메시지, 777 기도문)**
- 언어: 한국어 · English · اردو (RTL) · 中文 · 日本語 · Français · Deutsch · Español · Русский (상단 🌐 드롭다운, "함께 볼 언어"로 두 언어 동시 보기)
- 성구 버튼을 누르면 팝업으로 본문이 열리고, 팝업 안에서 한국어/영어/우르드어 본문을 바로 바꿔 볼 수 있습니다.

## 폴더 구조

```
index.html                 앱 껍데기
assets/config.js           언어 목록, 성경 번역본, 66권 책 이름(한/영/우르드)
assets/scripture.js        성구 인식·Markdown 렌더링·성경 본문 로딩
assets/app.js              화면(라우팅), 성구 팝업
content/i18n/<언어>.json    화면 문구
content/gospel/<언어>.json  복음 메시지(구원의 길)
content/prayer777/<언어>.json 777 기도 (7망대·7여정·7이정표, 항목별 세부 내용과 기도문)
content/videos/            유튜브 영상 목록(자동)·분류 이름
content/messages/index.json 강단/본부 글 원고 목록
content/messages/<pulpit|hq>/<id>/<언어>.md  메시지 본문
bible/<언어>/<책코드>.json   성경 본문(책별로 필요할 때만 내려받음)
scripts/build_bible.py     eBible.org 파일 → bible/ 변환
scripts/sync_youtube.py    유튜브 새 영상 → content/videos/
```

## 유튜브 영상 (자동)

강단 메시지는 [@themahanaim](https://www.youtube.com/@themahanaim), 본부 메시지는 [@rutctv](https://www.youtube.com/@rutctv) 채널 영상을 게시판형 목록으로 보여줍니다. 영상 파일은 저장하지 않고 ID·제목·날짜·분류만 `content/videos/<pulpit|hq>.json` 에 저장하며, 누르면 유튜브(앱)로 열립니다.

- **자동 추가**: GitHub Actions(`.github/workflows/sync-youtube.yml`)가 매시간 `scripts/sync_youtube.py` 를 실행해 새 영상을 추가·커밋합니다. 바로 받으려면 GitHub > Actions > "Sync YouTube videos" > Run workflow, 또는 로컬에서 `python scripts/sync_youtube.py`.
- **분류**: 제목의 표시로 자동 판단합니다. 강단: 평일새벽 → 새벽예배, 주일1부, 주일2부, 그 외 → 기타. 본부: 주일1부·주일2부·산업선교·렘넌트와 TCK·핵심·흩어진 제자들·WRC·송구영신, 그 외 → 기타(대회). 본부: 구역공과, RUTC 뉴스도 각각 분류. 두 채널 모두 전체예배(설교 영상과 중복)는 넣지 않습니다. 과거 영상 채우기: `python scripts/sync_youtube.py hq 2026-09-01`
- **고치기**: JSON에서 `cat`(분류)·`title`을 고치면 그대로 유지됩니다. 숨기려면 `"hidden": true` (지우면 다음 동기화 때 다시 들어옵니다). 분류 이름은 `content/videos/categories.json`.
- 화면에서는 한 목록으로 보이고, 위의 카테고리 버튼으로 걸러 볼 수 있습니다.

## 메시지 원고 올리는 법 (선택)

영상과 별도로 글 원고가 있으면 목록 아래 "말씀 원고"로 보입니다.

1. `content/messages/pulpit/2026-11-08-제목/ko.md` 파일을 만듭니다. (본부 메시지는 `hq/`)
2. `content/messages/index.json` 의 `pulpit`(또는 `hq`) 배열 **맨 위**에 항목을 추가합니다.

```json
{
  "id": "2026-11-08-제목",
  "date": "2026-11-08",
  "preacher": { "ko": "담임목사", "en": "Senior Pastor" },
  "title": { "ko": "제목", "en": "Title", "ur": "عنوان" },
  "langs": ["ko"]
}
```

3. 번역본이 생기면 같은 폴더에 `en.md`, `ur.md` 를 넣고 `langs` 에 추가합니다. 번역이 없는 언어로 보면 한국어 원문과 안내 문구가 나옵니다.
4. `git push` 하면 Vercel이 자동 배포합니다.

### 성구 표기

- 한국어·영어 본문: `요한복음 3:16`, `요 3:16`, `요한복음 3장 16절`, `요한복음 14:13~14, 16:24`, `John 3:16`, `1 John 1:9` 처럼 **그냥 적으면 자동으로 버튼**이 됩니다.
- 우르드어 등 다른 언어나 확실히 지정하고 싶을 때: `[[JOH 3:16]]`, `[[ROM 10:9-10]]` (책 코드는 `assets/config.js` 참고)
- Markdown: `#`/`##` 제목, `-` 목록, `1.` 번호 목록, `>` 인용, `---` 구분선, `**굵게**`

## 성경 본문 출처

| 언어 | 번역본 | 라이선스 |
|---|---|---|
| 한국어 | 개역한글 | Public Domain |
| English | Berean Standard Bible | Public Domain |
| اردو | Urdu Geo Version | © 2019, CC BY-NC-ND 4.0 (비상업·원문 그대로·출처 표기 조건) |
| 中文 | 和合本 (Chinese Union Version, 简体) | Public Domain |
| 日本語 | Japanese Freedom Bible | Public Domain |
| Français | Louis Segond 1910 | Public Domain |
| Deutsch | Lutherbibel 1912 | Public Domain |
| Español | Reina-Valera 1909 | Public Domain |
| Русский | Синодальный перевод | Public Domain |

777 기도문 공식 문구: 세계복음화전도협회(WEEA) "777 기도 다국어 파일". 우르드어는 공식 파일이 없어 교회에서 번역.

새 언어 추가: eBible.org 에서 `<id>_vpl.zip` 을 받아 `python scripts/build_bible.py <vpl.txt> <언어코드>` 실행 →
`assets/config.js` 의 `BIBLES`·`LANGS` 수정, `assets/booknames.js` 에 책 이름 추가 → `content/i18n`, `content/gospel`, `content/prayer777` 번역 추가.

## 로컬 미리보기

```
python -m http.server 8000
```
브라우저에서 http://localhost:8000 을 엽니다.
