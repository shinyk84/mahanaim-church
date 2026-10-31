# 마하나임교회 웹앱 — 강단 메시지 · 본부 메시지 · 전도 도구

빌드 과정이 없는 정적 웹앱입니다(HTML + JS 모듈 + JSON). Vercel이 파일을 그대로 서비스합니다.

- 화면 순서: **강단 메시지 → 본부 메시지 → 전도 도구(복음 메시지, 777 기도문)**
- 언어: 한국어 · English · اردو (RTL) — 중국어·일본어·프랑스어·독일어·스페인어·러시아어는 자리만 잡혀 있음
- 성구 버튼을 누르면 팝업으로 본문이 열리고, 팝업 안에서 한국어/영어/우르드어 본문을 바로 바꿔 볼 수 있습니다.

## 폴더 구조

```
index.html                 앱 껍데기
assets/config.js           언어 목록, 성경 번역본, 66권 책 이름(한/영/우르드)
assets/scripture.js        성구 인식·Markdown 렌더링·성경 본문 로딩
assets/app.js              화면(라우팅), 성구 팝업
content/i18n/<언어>.json    화면 문구
content/gospel/<언어>.json  복음 메시지(구원의 길)
content/prayer777/<언어>.md 777 기도문
content/messages/index.json 강단/본부 메시지 목록
content/messages/<pulpit|hq>/<id>/<언어>.md  메시지 본문
bible/<언어>/<책코드>.json   성경 본문(책별로 필요할 때만 내려받음)
scripts/build_bible.py     eBible.org 파일 → bible/ 변환
```

## 메시지 올리는 법

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

새 언어 추가: eBible.org 에서 `<id>_vpl.zip` 을 받아 `python scripts/build_bible.py <vpl.txt> <언어코드>` 실행 →
`assets/config.js` 의 `BIBLES`·`LANGS` 수정 → `content/i18n`, `content/gospel` 번역 추가.

## 로컬 미리보기

```
python -m http.server 8000
```
브라우저에서 http://localhost:8000 을 엽니다.
