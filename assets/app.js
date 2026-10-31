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

  return `<article class="gospel-page">
    <header class="g-hero">
      <h1>${esc(g.title)}</h1>
      <p class="g-sub">${esc(g.subtitle)}</p>
    </header>
    <div class="toolbar">
      <button type="button" class="toggle ${big ? "on" : ""}" data-toggle="big">A+ ${esc(t.big_text)}</button>
      ${lang !== "ko" ? `<button type="button" class="toggle ${bilingual ? "on" : ""}" data-toggle="bilingual">가 ${esc(t.bilingual)}</button>` : ""}
    </div>
    <nav class="toc" aria-label="${esc(t.contents)}">${g.sections
      .map((s, i) => `<a href="#g${i}" data-jump="g${i}">${s.no ? esc(s.no) + ". " : ""}${esc(s.title.split(/[—“"(:]/)[0].trim())}</a>`)
      .join("")}</nav>
    <p class="hint">👆 ${esc(t.tap_hint)}</p>
    <p class="intro">${esc(g.intro)}</p>
    ${sections}
  </article>`;
}

// ---------- 이벤트 ----------
document.addEventListener("click", (e) => {
  const ref = e.target.closest(".ref");
  if (ref) return openVerse(ref.dataset.ref);
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

async function openVerse(key) {
  const r = parseRef(key);
  if (!r) return;
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
