import { BOOKS, BOOK_ALIASES, BIBLES } from "./config.js";

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const names = [...BOOK_ALIASES.keys()].sort((a, b) => b.length - a.length).map(reEsc).join("|");
// 예: 요한복음 3:16 · 요 3:16 · 요한복음 3장 16절 · 요한복음 14:13~14 · John 3:16-17
const REF_BODY = String.raw`\s*(\d+)\s*(?::|장\s*)(\d+)\s*절?(?:\s*[-~–]\s*(\d+)\s*절?)?`;
const AUTO_RE = new RegExp(String.raw`(?<![가-힣A-Za-z])(${names})${REF_BODY}`, "g");
const CONT_RE = /^\s*[,;]\s*(\d+):(\d+)(?:\s*[-~–]\s*(\d+))?/;
const TOKEN_RE = /\[\[([^\]]+)\]\]/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;

/** "JOH 14:13-14" / "요 3:16" → { book, ch, v1, v2 } */
export function parseRef(str) {
  const m = str.trim().match(/^(.+?)\s*(\d+)\s*(?::|장\s*)(\d+)\s*절?(?:\s*[-~–]\s*(\d+))?\s*절?$/);
  if (!m) return null;
  const key = m[1].trim();
  const book = BOOKS[key.toUpperCase()] ? key.toUpperCase() : BOOK_ALIASES.get(key);
  if (!book) return null;
  const v1 = +m[3];
  return { book, ch: +m[2], v1, v2: m[4] ? Math.max(+m[4], v1) : v1 };
}

export const refKey = (r) => `${r.book} ${r.ch}:${r.v1}${r.v2 > r.v1 ? "-" + r.v2 : ""}`;

export function refLabel(r, lang) {
  const b = BOOKS[r.book];
  const name = b[lang] || b.en;
  return `${name} ${r.ch}:${r.v1}${r.v2 > r.v1 ? "-" + r.v2 : ""}`;
}

/** 우르드어(RTL)에서도 "3:1-6"이 뒤집히지 않도록 장:절을 LTR로 격리 */
export function refLabelHtml(r, lang) {
  const b = BOOKS[r.book];
  return `${esc(b[lang] || b.en)} <bdi dir="ltr">${r.ch}:${r.v1}${r.v2 > r.v1 ? "-" + r.v2 : ""}</bdi>`;
}

const chip = (r, lang) =>
  `<button type="button" class="ref" data-ref="${refKey(r)}">${refLabelHtml(r, lang)}</button>`;

/**
 * 한 줄의 텍스트를 HTML로 변환합니다.
 * - [[JOH 3:16]] 토큰 → 성구 버튼
 * - auto=true면 "요한복음 3:16", "John 3:16" 같은 표기도 자동으로 버튼화
 * - **굵게**
 */
export function renderInline(text, lang, { auto = false } = {}) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    parts.push(plain(text.slice(last, m.index), lang, auto));
    const r = parseRef(m[1]);
    parts.push(r ? chip(r, lang) : esc(m[0]));
    last = m.index + m[0].length;
  }
  parts.push(plain(text.slice(last), lang, auto));
  return parts.join("");
}

function plain(text, lang, auto) {
  if (!auto) return bold(esc(text));
  let out = "";
  let last = 0;
  AUTO_RE.lastIndex = 0;
  let m;
  while ((m = AUTO_RE.exec(text))) {
    out += bold(esc(text.slice(last, m.index)));
    const book = BOOK_ALIASES.get(m[1]);
    const v1 = +m[3];
    out += chip({ book, ch: +m[2], v1, v2: m[4] ? Math.max(+m[4], v1) : v1 }, lang);
    let end = m.index + m[0].length;
    // "요한복음 14:13-14, 16:24" 처럼 이어지는 장:절
    let c;
    while ((c = text.slice(end).match(CONT_RE))) {
      const cv1 = +c[2];
      out += esc(text.slice(end, end + c[0].indexOf(c[1]))) +
        chip({ book, ch: +c[1], v1: cv1, v2: c[3] ? Math.max(+c[3], cv1) : cv1 }, lang);
      end += c[0].length;
    }
    last = end;
    AUTO_RE.lastIndex = end;
  }
  return out + bold(esc(text.slice(last)));
}

const bold = (html) => html.replace(BOLD_RE, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");

/** 아주 단순한 Markdown(제목, 목록, 인용, 구분선, 문단) → HTML. 성구는 자동 인식. */
export function renderMarkdown(md, lang) {
  const lines = md.replace(/\r/g, "").split("\n");
  const html = [];
  let para = [];
  let list = null;
  const inline = (t) => renderInline(t, lang, { auto: true });
  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (const line of lines) {
    let m;
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara();
      flushList();
      const n = m[1].length + 1;
      html.push(`<h${n}>${inline(m[2])}</h${n}>`);
    } else if (/^---+\s*$/.test(line)) {
      flushPara();
      flushList();
      html.push("<hr>");
    } else if ((m = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/))) {
      flushPara();
      const tag = m[1] ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push(m[3]);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      html.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return html.join("\n");
}

const cache = new Map();

/** bible/<lang>/<BOOK>.json 을 불러와 해당 구절 배열 [{v, text}]을 돌려줍니다. */
export async function getVerses(r, lang) {
  if (!BIBLES[lang]) return [];
  const key = `${lang}/${r.book}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`bible/${key}.json`).then((res) => {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      }),
    );
  }
  let data;
  try {
    data = await cache.get(key);
  } catch (e) {
    cache.delete(key);
    throw e;
  }
  const chapter = data[r.ch] || {};
  const out = [];
  for (let v = r.v1; v <= r.v2; v++) if (chapter[v]) out.push({ v, text: chapter[v] });
  return out;
}

export { esc };
