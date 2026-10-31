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

let lang = "ko"; // 주 언어 (화면 문구도 이 언어)
let lang2 = null; // 함께 볼 언어 (전도 대상자 또는 전도자용)
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

const dirOf = (l) => LANGS.find((x) => x.code === l)?.dir || "ltr";
const nameOf = (l) => LANGS.find((x) => x.code === l)?.name || l;
const pick = (obj, l = lang) => (obj ? obj[l] ?? obj.ko ?? Object.values(obj)[0] : "");
const inline = (s, l = lang) => renderInline(s || "", l);
/** 두 번째 언어로 된 보조 줄 */
const sub2 = (s, tag = "span") => (s && lang2 ? `<${tag} class="sub2" lang="${lang2}" dir="${dirOf(lang2)}">${esc(s)}</${tag}>` : "");

function formatDate(d) {
  const locale = { ko: "ko-KR", en: "en-US", ur: "ur-PK" }[lang] || "en-US";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d;
  }
}

// ---------- 라우팅: #/<lang>[+<lang2>]/<page>/<id>  예) #/en+ur/gospel ----------
function parseHash() {
  const [l = "", page = "", id = ""] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [l1, l2] = l.split("+");
  return { l1, l2: READY.includes(l2) && l2 !== l1 ? l2 : null, page, id };
}

function detectLang() {
  const saved = store.get("lang");
  if (READY.includes(saved)) return saved;
  const nav = (navigator.language || "ko").slice(0, 2);
  return READY.includes(nav) ? nav : "ko";
}

const href = (page = "", id = "", l = lang, l2 = lang2) =>
  `#/${l}${l2 && l2 !== l ? "+" + l2 : ""}${page ? "/" + page : ""}${id ? "/" + encodeURIComponent(id) : ""}`;

async function route() {
  const { l1, l2, page, id } = parseHash();
  if (!READY.includes(l1)) {
    const saved2 = store.get("lang2");
    location.replace(href(page, id, detectLang(), READY.includes(saved2) ? saved2 : null));
    return;
  }
  lang2 = l2;
  store.set("lang2", lang2 || "");
  if (l1 !== lang || !t.church) {
    lang = l1;
    store.set("lang", lang);
    t = await load(`content/i18n/${lang}.json`);
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = dirOf(lang);
  document.body.classList.toggle("dual", !!lang2);
  renderChrome(page, id);
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

function renderChrome(page, id) {
  document.getElementById("brand").innerHTML = `<a href="${href()}"><img class="logo" src="assets/logo-mark.svg" alt="">${esc(t.church)}</a>`;
  const items = [
    ["pulpit", t.nav_pulpit],
    ["hq", t.nav_hq],
    ["gospel", t.gospel],
    ["prayer777", t.prayer777],
  ];
  nav.innerHTML = items
    .map(([p, label]) => `<a href="${href(p)}" class="${page === p ? "active" : ""}">${esc(label)}</a>`)
    .join("");
  // 주 언어를 두 번째 언어와 같은 것으로 고르면 두 언어를 맞바꿉니다.
  const primary = READY.map(
    (c) =>
      `<a href="${href(page, id, c, c === lang2 ? lang : lang2)}" class="${c === lang ? "active" : ""}" lang="${c}">${nameOf(c)}</a>`,
  ).join("");
  const second = `<label class="lang2">
      <span>+ ${esc(t.second_lang)}</span>
      <select data-lang2>
        <option value="">${esc(t.none)}</option>
        ${READY.filter((c) => c !== lang)
          .map((c) => `<option value="${c}" ${c === lang2 ? "selected" : ""}>${nameOf(c)}</option>`)
          .join("")}
      </select>
    </label>
    ${lang2 ? `<a class="swap" href="${href(page, id, lang2, lang)}" title="${esc(t.swap)}" aria-label="${esc(t.swap)}">⇄</a>` : ""}`;
  langBar.innerHTML = `${primary}${second}<span class="soon">${LANGS.filter((l) => !l.ready)
    .map((l) => l.name)
    .join(" · ")} — ${esc(t.soon)}</span>`;
  footer.innerHTML = `<div class="f-brand"><img src="assets/logo-mark.svg" alt="">${esc(t.denomination)} ${esc(t.church)}</div><p>${esc(t.bible_credit)}: ${Object.entries(BIBLES)
    .map(([, b]) => `${esc(b.name)} (${esc(b.license)})`)
    .join(" · ")}</p><p>© ${new Date().getFullYear()} ${esc(t.church)}</p>`;
}

/** 두 언어 본문: 넓은 화면은 좌우 2단, 좁은 화면은 탭으로 전환 */
const duo = (a, la, b, lb) => `<div class="duo">
    <div class="duo-tabs">
      <button type="button" data-duo="0" class="active">${nameOf(la)}</button>
      <button type="button" data-duo="1">${nameOf(lb)}</button>
    </div>
    <div class="duo-cols">
      <div class="prose duo-col active" lang="${la}" dir="${dirOf(la)}">${a}</div>
      <div class="prose duo-col" lang="${lb}" dir="${dirOf(lb)}">${b}</div>
    </div>
  </div>`;

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
    <div class="hero-in">
      <img class="hero-mark" src="assets/logo-mark.svg" alt="">
      <div>
        <small>${esc(t.denomination)}</small>
        <h1>${esc(t.church)}</h1>
        <p>${esc(t.tagline)}</p>
      </div>
    </div>
    <div class="split-bar"></div>
  </section>
  ${homeSection("pulpit", t.nav_pulpit, t.pulpit_desc, cards("pulpit"))}
  ${homeSection("hq", t.nav_hq, t.hq_desc, cards("hq"))}
  <section class="block">
    <div class="block-head"><div><h2>${esc(t.nav_tools)}</h2><p class="muted">${esc(t.tools_desc)}</p></div></div>
    <div class="tools">
      <a class="tool gospel" href="${href("gospel")}"><span class="tool-icon"><img src="assets/logo-mark.svg" alt=""></span><strong>${esc(t.gospel)}</strong><span>${esc(t.gospel_desc)}</span></a>
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
    ${lang2 && m.title[lang2] && m.title[lang2] !== pick(m.title) ? sub2(m.title[lang2]) : ""}
    ${m.preacher ? `<span class="muted">${esc(pick(m.preacher))}</span>` : ""}
    ${m.langs.includes(lang) ? "" : `<span class="badge">${nameOf(m.langs[0])}</span>`}
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
  const has2 = lang2 && lang2 !== src && m.langs.includes(lang2);
  const md2 = has2 ? await load(`content/messages/${type}/${id}/${lang2}.md`, "text") : null;
  const body = has2
    ? duo(renderMarkdown(md, src), src, renderMarkdown(md2, lang2), lang2)
    : `<div class="prose" lang="${src}" dir="${dirOf(src)}">${renderMarkdown(md, src)}</div>`;
  return `<article class="article">
    <a class="back" href="${href(type)}">‹ ${esc(type === "pulpit" ? t.nav_pulpit : t.nav_hq)}</a>
    <time>${esc(formatDate(m.date))}</time>
    <h1>${esc(pick(m.title))}${has2 ? sub2(m.title[lang2]) : ""}</h1>
    ${m.preacher ? `<p class="muted">${esc(t.preacher)}: ${esc(pick(m.preacher))}</p>` : ""}
    ${src !== lang ? `<p class="notice">${esc(t.not_translated)}</p>` : ""}
    <p class="hint">👆 ${esc(t.tap_hint)}</p>
    ${body}
  </article>`;
}

async function prayer777() {
  const md = await load(`content/prayer777/${lang}.md`, "text").catch(() => load("content/prayer777/ko.md", "text"));
  const md2 = lang2 ? await load(`content/prayer777/${lang2}.md`, "text").catch(() => null) : null;
  return `<article class="article">
    <h1>${esc(t.prayer777)}</h1>
    <p class="muted">${esc(t.prayer777_desc)}</p>
    ${md2 ? duo(renderMarkdown(md, lang), lang, renderMarkdown(md2, lang2), lang2) : `<div class="prose">${renderMarkdown(md, lang)}</div>`}
  </article>`;
}

// ---------- 복음 메시지 ----------
let gospelData = null;
const shortTitle = (s) => (s || "").split(" — ")[0];
const stripRefs = (s) => (s || "").replace(/\[\[[^\]]+\]\]/g, "").replace(/[→←]/g, "").trim();
const itemAt = (doc, si, gi, ii) => {
  const sec = doc?.sections[si];
  return gi === null || gi === "" ? sec?.items?.[ii] : sec?.groups?.[gi]?.items?.[ii];
};

async function gospel() {
  const g = await load(`content/gospel/${lang}.json`);
  const g2 = lang2 ? await load(`content/gospel/${lang2}.json`).catch(() => null) : null;
  gospelData = { g, g2 };
  const big = store.get("big") === "1";
  document.body.classList.toggle("big", big);
  const listView = store.get("glist") === "1";

  const head = `<header class="g-hero">
      <h1>${esc(g.title)}${g2 ? sub2(g2.title) : ""}</h1>
      <p class="g-sub">${esc(g.subtitle)}${g2 ? sub2(g2.subtitle) : ""}</p>
    </header>
    <div class="toolbar">
      <button type="button" class="toggle on" data-toggle="glist">${esc(listView ? t.view_cross : t.view_list)}</button>
      <button type="button" class="toggle ${big ? "on" : ""}" data-toggle="big">A+ ${esc(t.big_text)}</button>
    </div>`;
  const intro = `<p>${esc(g.intro)}</p>${g2 ? sub2(g2.intro, "p") : ""}`;

  if (!listView) {
    return `<article class="gospel-page">${head}
      <details class="x-intro"><summary>${esc(t.intro)}</summary>${intro}</details>
      <p class="hint">👆 ${esc(t.tap_item)}</p>
      ${crossMap(g, g2)}
    </article>`;
  }

  const itemHtml = (it, it2, n) => {
    const [refs, ...rest] = (it.body || "").split("\n");
    const text2 = it2 ? stripRefs(it2.body.split("\n").slice(1).join(" ")) : "";
    return `<li class="item">
      ${n ? `<span class="num">${n}</span>` : ""}
      <div>
        <div class="d-line">${it.title ? `<h4>${esc(it.title)}${sub2(it2?.title)}</h4>` : ""}${refs ? `<span class="refs">${inline(refs)}</span>` : ""}</div>
        ${rest.length ? `<p>${inline(rest.join(" "))}</p>${sub2(text2, "p")}` : ""}
      </div>
    </li>`;
  };

  const sections = g.sections
    .map((s, si) => {
      const s2 = g2?.sections[si];
      const groups = s.groups || [{ items: s.items, numbered: true }];
      const body = groups
        .map(
          (gr, gi) =>
            `<ol class="items ${gr.numbered ? "" : "plain"}">${gr.items
              .map((it, ii) => itemHtml(it, itemAt(g2, si, s.groups ? gi : null, ii), gr.numbered && it.title ? ii + 1 : ""))
              .join("")}</ol>`,
        )
        .join("");
      const prayer = s.prayer
        ? `<div class="prayer"><h4>🙏 ${esc(s.prayer.title)}</h4><p>${esc(s.prayer.body)}</p>${sub2(s2?.prayer?.body, "p")}</div>`
        : "";
      return `<section class="g-section ${s.highlight ? "highlight" : ""}" id="g${si}">
        <h3>${s.no ? `<span class="sec-no">${esc(s.no)}</span>` : ""}${esc(s.title)}${s.lead ? `<span class="refs lead">${inline(s.lead)}</span>` : ""}${sub2(s2?.title)}</h3>
        ${body}
        ${s.note ? `<p class="note">${esc(s.note)}${sub2(s2?.note, "span")}</p>` : ""}
        ${prayer}
      </section>`;
    })
    .join("");

  return `<article class="gospel-page">${head}
    <nav class="toc" aria-label="${esc(t.contents)}">${g.sections
      .map((s, i) => `<a href="#g${i}" data-jump="g${i}">${s.no ? esc(s.no) + ". " : ""}${esc(s.short || s.title)}</a>`)
      .join("")}</nav>
    <p class="hint">👆 ${esc(t.tap_hint)}</p>
    <div class="intro">${intro}</div>
    ${sections}
  </article>`;
}

/**
 * 책받침과 같은 배치. 가운데 십자가(5), 가로대 띠에 6(왼쪽)·3(오른쪽),
 * 위쪽 1·2, 오른쪽 아래 4(십자가를 향한 화살표), 맨 아래 7과 결론.
 * RTL(우르드어)에서는 grid가 자동으로 좌우 반전됩니다.
 */
function crossMap(g, g2) {
  const S = g.sections;
  const S2 = g2?.sections;
  const head = (si, cls = "") =>
    `<button type="button" class="x-head ${cls}" data-sec="${si}">${S[si].no ? `<span class="xn">${esc(S[si].no)}</span>` : ""}<span>${esc(
      S[si].short || S[si].title,
    )}${sub2(S2?.[si]?.short)}</span></button>`;
  const items = (si, gi = null, { numbered = true, cls = "" } = {}) => {
    const list = gi === null ? S[si].items : S[si].groups[gi].items;
    return `<ol class="x-items ${cls}">${list
      .map(
        (it, ii) =>
          `<li><button type="button" class="xi" data-item="${si}.${gi ?? ""}.${ii}">${
            numbered ? `<span class="xi-no">${ii + 1}</span>` : ""
          }<span>${esc(shortTitle(it.title))}${sub2(shortTitle(itemAt(g2, si, gi, ii)?.title))}</span></button></li>`,
      )
      .join("")}</ol>`;
  };
  const five = S[4];
  const fiveLabel = (s) => s.title.replace(/[“"”«].*$/, "").replace(/[:：]\s*$/, "").trim();
  const end = S[7];

  return `<div class="xmap">
    <section class="x-cell x-s1">${head(0)}${items(0)}</section>
    <section class="x-cell x-s2">${head(1)}${items(1)}</section>

    <div class="x-top">
      <button type="button" class="x-five" data-sec="4">
        <span class="xn">5</span>
        <small>${esc(fiveLabel(five))}</small>
        <strong>${esc(five.short)}</strong>
        ${S2 ? sub2(S2[4].short) : ""}
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

/** 한 언어 분량의 상세 내용 (항목 / 섹션 / 영접기도) */
function detailHtml(doc, l, kind, key) {
  const il = (s) => inline(s, l);
  if (kind === "item") {
    const [si, gi, ii] = key.split(".");
    const sec = doc.sections[+si];
    const it = itemAt(doc, +si, gi === "" ? null : +gi, +ii);
    const [refs, ...rest] = (it.body || "").split("\n");
    return `<p class="d-sec">${sec.no ? esc(sec.no) + ". " : ""}${esc(sec.title)}</p>
      <div class="d-line"><h3 class="d-title">${esc(it.title)}</h3>${refs ? `<span class="refs">${il(refs)}</span>` : ""}</div>
      ${rest.length ? `<p>${il(rest.join(" "))}</p>` : ""}`;
  }
  if (kind === "sec") {
    const sec = doc.sections[+key];
    const groups = sec.groups || [{ items: sec.items }];
    return `<div class="d-line"><h3 class="d-title">${sec.no ? esc(sec.no) + ". " : ""}${esc(sec.title)}</h3>${
      sec.lead ? `<span class="refs">${il(sec.lead)}</span>` : ""
    }</div>
      ${groups
        .map(
          (gr) =>
            `<ul class="d-list">${gr.items
              .map((it) => {
                const [refs, ...rest] = (it.body || "").split("\n");
                return `<li><div class="d-line">${it.title ? `<strong>${esc(it.title)}</strong>` : ""}${refs ? `<span class="refs">${il(refs)}</span>` : ""}</div>${
                  rest.length ? `<p>${il(rest.join(" "))}</p>` : ""
                }</li>`;
              })
              .join("")}</ul>`,
        )
        .join("")}
      ${sec.note ? `<p class="note">${esc(sec.note)}</p>` : ""}`;
  }
  const p = doc.sections[4].prayer;
  return `<h3 class="d-title">🙏 ${esc(p.title)}</h3><p class="d-prayer">${esc(p.body)}</p>`;
}

/** 십자가 도식에서 누른 항목/섹션/영접기도를 팝업으로 보여 줍니다. 두 언어면 위아래로. */
function openDetail(kind, key) {
  const { g, g2 } = gospelData;
  const block = (doc, l) => `<div class="d-lang" lang="${l}" dir="${dirOf(l)}">${detailHtml(doc, l, kind, key)}</div>`;
  dlg.innerHTML = `<div class="v-wrap">
    <div class="v-head"><span></span><button type="button" class="v-close" data-close aria-label="${esc(t.close)}">✕</button></div>
    <div class="v-body d-body">${block(g, lang)}${g2 ? `<hr class="d-split">${block(g2, lang2)}` : ""}</div>
  </div>`;
  if (!dlg.open) dlg.showModal();
}

/**
 * 설명 팝업 안의 성구: 화면을 바꾸지 않고 설명 바로 아래에 본문을 펼칩니다(다시 누르면 접힘).
 * 두 언어 모드에서는 각 언어 블록의 같은 성구도 함께 펼쳐 두 설명이 나란히 유지됩니다.
 */
function toggleInlineVerse(chip) {
  const key = chip.dataset.ref;
  const r = parseRef(key);
  if (!r) return;
  const open = chip.classList.contains("on");
  for (const block of dlg.querySelectorAll(".d-lang")) {
    const l = block.getAttribute("lang");
    // 같은 블록에서 누른 칩과 같은 위치(같은 li 또는 같은 성구 줄)의 칩을 찾음
    const twin = block.contains(chip) ? chip : block.querySelector(`.ref[data-ref="${key}"]`);
    if (!twin) continue;
    const host = twin.closest("li") || block;
    host.querySelector(`.d-verse[data-for="${key}"]`)?.remove();
    twin.classList.toggle("on", !open);
    if (open) continue;
    const box = document.createElement("div");
    box.className = "d-verse";
    box.dataset.for = key;
    box.innerHTML = `<p class="v-label">${refLabelHtml(r, l)} · ${esc(BIBLES[l]?.name || "")}</p><div class="v-text"><p class="muted">${esc(t.loading)}</p></div>`;
    // li 안이면 그 항목 끝(설명 아래), 아니면 성구 줄 다음의 설명 문단 아래
    if (twin.closest("li")) host.append(box);
    else {
      const line = twin.closest(".d-line") || twin.closest(".refs");
      let after = line?.nextElementSibling?.tagName === "P" ? line.nextElementSibling : line || block.lastElementChild;
      while (after.nextElementSibling?.classList.contains("d-verse")) after = after.nextElementSibling; // 누른 순서대로 쌓기
      after.after(box);
    }
    getVerses(r, BIBLES[l] ? l : "ko")
      .then((vs) => {
        box.querySelector(".v-text").innerHTML = vs.length
          ? vs.map((v) => `<p><sup>${v.v}</sup>${esc(v.text)}</p>`).join("")
          : `<p class="muted">—</p>`;
      })
      .catch(() => {
        box.querySelector(".v-text").innerHTML = `<p class="muted">${esc(t.verse_error)}</p>`;
      });
  }
}

// ---------- 이벤트 ----------
document.addEventListener("click", (e) => {
  const ref = e.target.closest(".ref");
  if (ref) return ref.closest(".d-body") ? toggleInlineVerse(ref) : openVerse(ref.dataset.ref);
  const item = e.target.closest("[data-item]");
  if (item) return openDetail("item", item.dataset.item);
  const sec = e.target.closest("[data-sec]");
  if (sec) return openDetail("sec", sec.dataset.sec);
  if (e.target.closest("[data-prayer]")) return openDetail("prayer");
  const tab = e.target.closest("[data-duo]");
  if (tab) {
    const box = tab.closest(".duo");
    const n = +tab.dataset.duo;
    box.querySelectorAll("[data-duo]").forEach((b, i) => b.classList.toggle("active", i === n));
    box.querySelectorAll(".duo-col").forEach((c, i) => c.classList.toggle("active", i === n));
    return;
  }
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

document.addEventListener("change", (e) => {
  if (!e.target.matches("[data-lang2]")) return;
  const { page, id } = parseHash();
  location.hash = href(page, id, lang, e.target.value || null);
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

/** 두 언어 모드면 두 번역본을 위아래로, 아니면 탭으로 번역본 전환 */
async function paintVerse() {
  const r = current;
  const l = shownLang;
  const dual = lang2 && BIBLES[lang2] ? [l, lang2] : null;
  const langs = dual || [l];
  const tabs = dual
    ? ""
    : `<div class="v-tabs">${Object.keys(BIBLES)
        .map((c) => `<button type="button" data-vlang="${c}" class="${c === l ? "active" : ""}">${nameOf(c)}</button>`)
        .join("")}</div>`;
  dlg.innerHTML = `<div class="v-wrap">
    <div class="v-head">
      <h3>${refLabelHtml(r, l)}</h3>
      <button type="button" class="v-close" data-close aria-label="${esc(t.close)}">✕</button>
    </div>
    ${tabs}
    <div class="v-scroll">${langs
      .map(
        (c) => `<div class="v-body" lang="${c}" dir="${dirOf(c)}">
          ${dual ? `<p class="v-label">${refLabelHtml(r, c)} · ${esc(BIBLES[c].name)}</p>` : ""}
          <div class="v-text"><p class="muted">${esc(t.loading)}</p></div>
        </div>`,
      )
      .join("")}</div>
    <div class="v-foot">
      <small class="muted">${dual ? "" : esc(BIBLES[l].name)}</small>
      <button type="button" class="v-copy" data-copy>${esc(t.copy)}</button>
    </div>
  </div>`;
  const copies = [];
  await Promise.all(
    langs.map(async (c, i) => {
      const box = dlg.querySelectorAll(".v-text")[i];
      try {
        const verses = await getVerses(r, c);
        if (current !== r || shownLang !== l || !box.isConnected) return;
        box.innerHTML = verses.length ? verses.map((v) => `<p><sup>${v.v}</sup>${esc(v.text)}</p>`).join("") : `<p class="muted">—</p>`;
        copies[i] = `${refLabel(r, c)}\n${verses.map((v) => (verses.length > 1 ? `${v.v} ` : "") + v.text).join("\n")}`;
      } catch {
        box.innerHTML = `<p class="muted">${esc(t.verse_error)}</p>`;
      }
    }),
  );
  const foot = dlg.querySelector(".v-foot");
  if (foot) foot.dataset.copy = copies.filter(Boolean).join("\n\n");
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
      await navigator.clipboard.writeText(dlg.querySelector(".v-foot").dataset.copy || "");
      copy.textContent = t.copied;
    } catch {}
  }
});

route();
