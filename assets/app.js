import { LANGS, BIBLES } from "./config.js";
import { parseRef, refLabel, refLabelHtml, renderInline, renderMarkdown, getVerses, esc } from "./scripture.js";

const READY = LANGS.filter((l) => l.ready).map((l) => l.code);
const app = document.getElementById("app");
const nav = document.getElementById("nav");
const langBar = document.getElementById("langs");
const footer = document.getElementById("footer");

const store = {
  get: (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

let lang = "ko";
let t = {};

// ---------- 데이터 로딩 ----------
const jsonCache = new Map();
function load(path, type = "json") {
  const key = `${type}:${path}`;
  if (!jsonCache.has(key)) {
    jsonCache.set(
      key,
      fetch(path).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${path}`);
        return type === "json" ? r.json() : r.text();
      }),
    );
  }
  return jsonCache.get(key).catch((e) => {
    jsonCache.delete(key);
    throw e;
  });
}

const pick = (obj) => (obj ? obj[lang] ?? obj.ko ?? Object.values(obj)[0] : "");
const inline = (s) => renderInline(s || "", lang);

function formatDate(d) {
  const locale = { ko: "ko-KR", en: "en-US", ur: "ur-PK" }[lang] || "en-US";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d;
  }
}

// ---------- 라우팅: #/<lang>/<page>/<id> ----------
function parseHash() {
  const [l, page = "", id = ""] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  return { l, page, id };
}

function detectLang() {
  const saved = store.get("lang");
  if (READY.includes(saved)) return saved;
  const nav = (navigator.language || "ko").slice(0, 2);
  return READY.includes(nav) ? nav : "ko";
}

const href = (page = "", id = "", l = lang) => `#/${l}${page ? "/" + page : ""}${id ? "/" + encodeURIComponent(id) : ""}`;

async function route() {
  const { l, page, id } = parseHash();
  if (!READY.includes(l)) {
    location.replace(href(page, id, detectLang()));
    return;
  }
  if (l !== lang || !t.church) {
    lang = l;
    store.set("lang", lang);
    t = await load(`content/i18n/${lang}.json`);
  }
  const meta = LANGS.find((x) => x.code === lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = meta.dir;
  renderChrome(page);
  app.innerHTML = `<p class="muted pad">${esc(t.loading)}</p>`;
  try {
    const view = { "": home, pulpit: list, hq: list, gospel, prayer777 }[page];
    if (!view) return location.replace(href());
    app.innerHTML = page === "pulpit" || page === "hq" ? (id ? await message(page, id) : await view(page)) : await view();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="pad">⚠️ ${esc(String(e.message || e))}</p>`;
  }
  if (!sessionStorage.getItem("keepScroll")) window.scrollTo(0, 0);
  document.title = `${t.church}`;
}

function renderChrome(page) {
  document.getElementById("brand").innerHTML = `<a href="${href()}"><span class="logo">✝</span>${esc(t.church)}</a>`;
  const items = [
    ["pulpit", t.nav_pulpit],
    ["hq", t.nav_hq],
    ["gospel", t.gospel],
    ["prayer777", t.prayer777],
  ];
  nav.innerHTML = items
    .map(([p, label]) => `<a href="${href(p)}" class="${page === p ? "active" : ""}">${esc(label)}</a>`)
    .join("");
  const { page: p, id } = parseHash();
  langBar.innerHTML =
    LANGS.filter((l) => l.ready)
      .map((l) => `<a href="${href(p, id, l.code)}" class="${l.code === lang ? "active" : ""}" lang="${l.code}">${l.name}</a>`)
      .join("") +
    `<span class="soon" title="${esc(t.soon)}">${LANGS.filter((l) => !l.ready)
      .map((l) => l.name)
      .join(" · ")} — ${esc(t.soon)}</span>`;
  footer.innerHTML = `<p>${esc(t.bible_credit)}: ${Object.entries(BIBLES)
    .map(([, b]) => `${esc(b.name)} (${esc(b.license)})`)
    .join(" · ")}</p><p>© ${new Date().getFullYear()} ${esc(t.church)}</p>`;
}

// ---------- 화면들 ----------
async function home() {
  const idx = await load("content/messages/index.json");
  const cards = (type) => {
    const rows = (idx[type] || []).slice(0, 3);
    if (!rows.length) return `<p class="muted">${esc(t.empty)}</p>`;
    return `<div class="cards">${rows.map((m) => msgCard(type, m)).join("")}</div>`;
  };
  return `
  <section class="hero">
    <h1>${esc(t.church)}</h1>
    <p>${esc(t.tagline)}</p>
  </section>
  ${homeSection("pulpit", t.nav_pulpit, t.pulpit_desc, cards("pulpit"))}
  ${homeSection("hq", t.nav_hq, t.hq_desc, cards("hq"))}
  <section class="block">
    <div class="block-head"><div><h2>${esc(t.nav_tools)}</h2><p class="muted">${esc(t.tools_desc)}</p></div></div>
    <div class="tools">
      <a class="tool gospel" href="${href("gospel")}"><span class="tool-icon">✝</span><strong>${esc(t.gospel)}</strong><span>${esc(t.gospel_desc)}</span></a>
      <a class="tool prayer" href="${href("prayer777")}"><span class="tool-icon">🙏</span><strong>${esc(t.prayer777)}</strong><span>${esc(t.prayer777_desc)}</span></a>
    </div>
  </section>`;
}

const homeSection = (type, title, desc, body) => `
  <section class="block">
    <div class="block-head">
      <div><h2>${esc(title)}</h2><p class="muted">${esc(desc)}</p></div>
      <a class="more" href="${href(type)}">${esc(t.more)} ›</a>
    </div>
    ${body}
  </section>`;

const msgCard = (type, m) => `
  <a class="card" href="${href(type, m.id)}">
    <time>${esc(formatDate(m.date))}</time>
    <strong>${esc(pick(m.title))}</strong>
    ${m.preacher ? `<span class="muted">${esc(pick(m.preacher))}</span>` : ""}
    ${m.langs.includes(lang) ? "" : `<span class="badge">한국어</span>`}
  </a>`;

async function list(type) {
  const idx = await load("content/messages/index.json");
  const rows = idx[type] || [];
  const title = type === "pulpit" ? t.nav_pulpit : t.nav_hq;
  const desc = type === "pulpit" ? t.pulpit_desc : t.hq_desc;
  return `<section class="block">
    <h1 class="page-title">${esc(title)}</h1><p class="muted">${esc(desc)}</p>
    ${rows.length ? `<div class="cards list">${rows.map((m) => msgCard(type, m)).join("")}</div>` : `<p class="muted">${esc(t.empty)}</p>`}
  </section>`;
}

async function message(type, id) {
  const idx = await load("content/messages/index.json");
  const m = (idx[type] || []).find((x) => x.id === id);
  if (!m) return `<p class="pad">404</p>`;
  const src = m.langs.includes(lang) ? lang : m.langs[0];
  const md = await load(`content/messages/${type}/${id}/${src}.md`, "text");
  return `<article class="article">
    <a class="back" href="${href(type)}">‹ ${esc(type === "pulpit" ? t.nav_pulpit : t.nav_hq)}</a>
    <time>${esc(formatDate(m.date))}</time>
    <h1>${esc(pick(m.title))}</h1>
    ${m.preacher ? `<p class="muted">${esc(t.preacher)}: ${esc(pick(m.preacher))}</p>` : ""}
    ${src !== lang ? `<p class="notice">${esc(t.not_translated)}</p>` : ""}
    <p class="hint">👆 ${esc(t.tap_hint)}</p>
    <div class="prose" ${src !== lang ? `lang="${src}" dir="${LANGS.find((l) => l.code === src).dir}"` : ""}>${renderMarkdown(md, lang)}</div>
  </article>`;
}

async function prayer777() {
  const md = await load(`content/prayer777/${lang}.md`, "text").catch(() => load("content/prayer777/ko.md", "text"));
  return `<article class="article">
    <h1>${esc(t.prayer777)}</h1>
    <p class="muted">${esc(t.prayer777_desc)}</p>
    <div class="prose">${renderMarkdown(md, lang)}</div>
  </article>`;
}

async function gospel() {
  const g = await load(`content/gospel/${lang}.json`);
  const bilingual = lang !== "ko" && store.get("bilingual") === "1";
  const ko = bilingual ? await load("content/gospel/ko.json") : null;
  const big = store.get("big") === "1";
  document.body.classList.toggle("big", big);

  const sub = (s) => (s ? `<span class="ko-sub" lang="ko" dir="ltr">${esc(s)}</span>` : "");
  const stripRefs = (s) => (s || "").replace(/\[\[[^\]]+\]\]/g, "").replace(/→/g, "").trim();

  const itemHtml = (it, koIt, n) => {
    const [refs, ...rest] = (it.body || "").split("\n");
    const koText = koIt ? koIt.body.split("\n").slice(1).join(" ") : "";
    return `<li class="item">
      ${n ? `<span class="num">${n}</span>` : ""}
      <div>
        ${it.title ? `<h4>${esc(it.title)}${sub(koIt?.title)}</h4>` : ""}
        ${refs ? `<div class="refs">${inline(refs)}</div>` : ""}
        ${rest.length ? `<p>${inline(rest.join(" "))}</p>${koText ? `<p class="ko-sub" lang="ko" dir="ltr">${esc(stripRefs(koText))}</p>` : ""}` : ""}
      </div>
    </li>`;
  };

  const sections = g.sections
    .map((s, si) => {
      const ks = ko?.sections[si];
      const groups = s.groups || [{ items: s.items, numbered: true }];
      const body = groups
        .map(
          (gr, gi) =>
            `<ol class="items ${gr.numbered ? "" : "plain"}">${gr.items
              .map((it, ii) => itemHtml(it, (ks?.groups?.[gi]?.items || ks?.items)?.[ii], gr.numbered && it.title ? ii + 1 : ""))
              .join("")}</ol>`,
        )
        .join("");
      const prayer = s.prayer
        ? `<div class="prayer"><h4>🙏 ${esc(s.prayer.title)}</h4><p>${esc(s.prayer.body)}</p>${
            ks?.prayer ? `<p class="ko-sub" lang="ko" dir="ltr">${esc(ks.prayer.body)}</p>` : ""
          }</div>`
        : "";
      return `<section class="g-section ${s.highlight ? "highlight" : ""}" id="g${si}">
        <h3>${s.no ? `<span class="sec-no">${esc(s.no)}</span>` : ""}${esc(s.title)}${sub(ks?.title)}</h3>
        ${s.lead ? `<div class="refs lead">${inline(s.lead)}</div>` : ""}
        ${body}
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
        ${prayer}
      </section>`;
    })
    .join("");

  gospelData = { g, ko };
  const listView = store.get("glist") === "1";
  const head = `<header class="g-hero">
      <h1>${esc(g.title)}</h1>
      <p class="g-sub">${esc(g.subtitle)}</p>
    </header>
    <div class="toolbar">
      <button type="button" class="toggle on" data-toggle="glist">${esc(listView ? t.view_cross : t.view_list)}</button>
      <button type="button" class="toggle ${big ? "on" : ""}" data-toggle="big">A+ ${esc(t.big_text)}</button>
      ${lang !== "ko" ? `<button type="button" class="toggle ${bilingual ? "on" : ""}" data-toggle="bilingual">가 ${esc(t.bilingual)}</button>` : ""}
    </div>`;

  if (!listView) {
    return `<article class="gospel-page">${head}
      <p class="hint">👆 ${esc(t.tap_item)}</p>
      ${crossMap(g)}
      <details class="x-intro"><summary>${esc(t.intro)}</summary><p>${esc(g.intro)}</p></details>
    </article>`;
  }

  return `<article class="gospel-page">${head}
    <nav class="toc" aria-label="${esc(t.contents)}">${g.sections
      .map((s, i) => `<a href="#g${i}" data-jump="g${i}">${s.no ? esc(s.no) + ". " : ""}${esc(s.title.split(/[—“"(:]/)[0].trim())}</a>`)
      .join("")}</nav>
    <p class="hint">👆 ${esc(t.tap_hint)}</p>
    <p class="intro">${esc(g.intro)}</p>
    ${sections}
  </article>`;
}

// ---------- 복음 메시지: 십자가 도식 ----------
let gospelData = null;
const shortTitle = (s) => s.split(" — ")[0];

/**
 * 책받침과 같은 배치. 가운데 십자가(5), 가로대 띠에 6(왼쪽)·3(오른쪽),
 * 위쪽 1·2, 오른쪽 아래 4(십자가를 향한 화살표), 맨 아래 7과 결론.
 * RTL(우르드어)에서는 grid가 자동으로 좌우 반전됩니다.
 */
function crossMap(g) {
  const S = g.sections;
  const head = (si, cls = "") =>
    `<button type="button" class="x-head ${cls}" data-sec="${si}">${S[si].no ? `<span class="xn">${esc(S[si].no)}</span>` : ""}${esc(S[si].short || S[si].title)}</button>`;
  const items = (si, gi = null, { numbered = true, cls = "" } = {}) => {
    const list = gi === null ? S[si].items : S[si].groups[gi].items;
    return `<ol class="x-items ${cls}">${list
      .map(
        (it, ii) =>
          `<li><button type="button" class="xi" data-item="${si}.${gi ?? ""}.${ii}">${
            numbered ? `<span class="xi-no">${ii + 1}</span>` : ""
          }<span>${esc(shortTitle(it.title))}</span></button></li>`,
      )
      .join("")}</ol>`;
  };
  const five = S[4];
  const fiveLabel = five.title.replace(/[“"”«].*$/, "").replace(/[:：]\s*$/, "").trim();
  const end = S[7];

  return `<div class="xmap">
    <section class="x-cell x-s1">${head(0)}${items(0)}</section>
    <section class="x-cell x-s2">${head(1)}${items(1)}</section>

    <div class="x-top">
      <button type="button" class="x-five" data-sec="4">
        <span class="xn">5</span>
        <small>${esc(fiveLabel)}</small>
        <strong>${esc(five.short)}</strong>
      </button>
      <div class="x-lead">${inline(five.lead)}</div>
    </div>

    <div class="x-band x-b6">${head(5, "on-band")}</div>
    <div class="x-arm">${items(4, 0, { numbered: false, cls: "triad" })}</div>
    <div class="x-band x-b3">${head(2, "on-band")}</div>

    <section class="x-cell x-l6">${items(5)}</section>
    <div class="x-stem">
      ${items(4, 1)}
      <button type="button" class="x-pray" data-prayer>🙏 ${esc(t.prayer_btn)}</button>
    </div>
    <section class="x-cell x-l3">${items(2)}</section>
    <section class="x-cell x-s4">${head(3)}${items(3, null, { numbered: false, cls: "arrows" })}</section>

    <section class="x-cell x-s7">${head(6)}${items(6, null, { cls: "pills" })}</section>
    <section class="x-cell x-end">${head(7)}<div class="refs">${end.items.map((it) => inline(it.body)).join(" ")}</div></section>
  </div>`;
}

/** 십자가 도식에서 누른 항목/섹션/영접기도를 팝업으로 보여 줍니다. */
function openDetail(kind, key) {
  const { g, ko } = gospelData;
  let html = "";
  if (kind === "item") {
    const [si, gi, ii] = key.split(".");
    const sec = g.sections[+si];
    const it = gi === "" ? sec.items[+ii] : sec.groups[+gi].items[+ii];
    const [refs, ...rest] = (it.body || "").split("\n");
    html = `<p class="d-sec">${sec.no ? esc(sec.no) + ". " : ""}${esc(sec.title)}</p>
      <h3 class="d-title">${esc(it.title)}</h3>
      ${refs ? `<div class="refs">${inline(refs)}</div>` : ""}
      ${rest.length ? `<p>${inline(rest.join(" "))}</p>` : ""}`;
  } else if (kind === "sec") {
    const sec = g.sections[+key];
    const groups = sec.groups || [{ items: sec.items }];
    html = `<h3 class="d-title">${sec.no ? esc(sec.no) + ". " : ""}${esc(sec.title)}</h3>
      ${sec.lead ? `<div class="refs">${inline(sec.lead)}</div>` : ""}
      ${groups
        .map(
          (gr) =>
            `<ul class="d-list">${gr.items
              .map((it) => {
                const [refs, ...rest] = (it.body || "").split("\n");
                return `<li>${it.title ? `<strong>${esc(it.title)}</strong>` : ""}${refs ? `<div class="refs">${inline(refs)}</div>` : ""}${
                  rest.length ? `<p>${inline(rest.join(" "))}</p>` : ""
                }</li>`;
              })
              .join("")}</ul>`,
        )
        .join("")}
      ${sec.note ? `<p class="note">${esc(sec.note)}</p>` : ""}`;
  } else {
    const p = g.sections[4].prayer;
    html = `<h3 class="d-title">🙏 ${esc(p.title)}</h3><p class="d-prayer">${esc(p.body)}</p>`;
  }
  detailBack = { kind, key };
  dlg.innerHTML = `<div class="v-wrap">
    <div class="v-head"><span></span><button type="button" class="v-close" data-close aria-label="${esc(t.close)}">✕</button></div>
    <div class="v-body d-body">${html}</div>
  </div>`;
  if (!dlg.open) dlg.showModal();
}

// ---------- 이벤트 ----------
document.addEventListener("click", (e) => {
  const ref = e.target.closest(".ref");
  if (ref) return openVerse(ref.dataset.ref, dlg.contains(ref));
  const item = e.target.closest("[data-item]");
  if (item) return openDetail("item", item.dataset.item);
  const sec = e.target.closest("[data-sec]");
  if (sec) return openDetail("sec", sec.dataset.sec);
  if (e.target.closest("[data-prayer]")) return openDetail("prayer");
  const jump = e.target.closest("[data-jump]");
  if (jump) {
    e.preventDefault();
    document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const tog = e.target.closest("[data-toggle]");
  if (tog) {
    const k = tog.dataset.toggle;
    store.set(k, store.get(k) === "1" ? "0" : "1");
    const y = window.scrollY;
    sessionStorage.setItem("keepScroll", "1");
    route().then(() => {
      sessionStorage.removeItem("keepScroll");
      window.scrollTo(0, y);
    });
  }
});

window.addEventListener("hashchange", route);

// ---------- 성구 팝업 ----------
const dlg = document.getElementById("verse");
let current = null;
let shownLang = null;
let detailBack = null; // 십자가 도식 팝업에서 성구를 열었을 때 돌아갈 곳

async function openVerse(key, fromDetail = false) {
  const r = parseRef(key);
  if (!r) return;
  if (!fromDetail) detailBack = null;
  current = r;
  shownLang = BIBLES[lang] ? lang : "ko";
  if (!dlg.open) dlg.showModal();
  await paintVerse();
}

async function paintVerse() {
  const r = current;
  const l = shownLang;
  const dir = LANGS.find((x) => x.code === l)?.dir || "ltr";
  const tabs = Object.keys(BIBLES)
    .map((c) => `<button type="button" data-vlang="${c}" class="${c === l ? "active" : ""}">${LANGS.find((x) => x.code === c).name}</button>`)
    .join("");
  dlg.innerHTML = `<div class="v-wrap">
    <div class="v-head">
      ${detailBack ? `<button type="button" class="v-back" data-back aria-label="${esc(t.back)}">‹</button>` : ""}
      <h3>${refLabelHtml(r, l)}</h3>
      <button type="button" class="v-close" data-close aria-label="${esc(t.close)}">✕</button>
    </div>
    <div class="v-tabs">${tabs}</div>
    <div class="v-body" lang="${l}" dir="${dir}"><p class="muted">${esc(t.loading)}</p></div>
    <div class="v-foot">
      <small class="muted">${esc(BIBLES[l].name)}</small>
      <button type="button" class="v-copy" data-copy>${esc(t.copy)}</button>
    </div>
  </div>`;
  const body = dlg.querySelector(".v-body");
  try {
    const verses = await getVerses(r, l);
    if (current !== r || shownLang !== l) return;
    body.innerHTML = verses.length
      ? verses.map((v) => `<p><sup>${v.v}</sup>${esc(v.text)}</p>`).join("")
      : `<p class="muted">—</p>`;
    body.dataset.copy = `${refLabel(r, l)}\n${verses.map((v) => (verses.length > 1 ? `${v.v} ` : "") + v.text).join("\n")}`;
  } catch {
    body.innerHTML = `<p class="muted">${esc(t.verse_error)}</p>`;
  }
}

dlg.addEventListener("click", async (e) => {
  if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
  if (e.target.closest("[data-back]") && detailBack) return openDetail(detailBack.kind, detailBack.key);
  const tab = e.target.closest("[data-vlang]");
  if (tab) {
    shownLang = tab.dataset.vlang;
    return paintVerse();
  }
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(dlg.querySelector(".v-body").dataset.copy || "");
      copy.textContent = t.copied;
    } catch {}
  }
});

route();
