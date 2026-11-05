import { LANGS, BIBLES } from "./config.js";
import { parseRef, refLabel, refLabelHtml, renderInline, renderMarkdown, getVerses, esc } from "./scripture.js";

const READY = LANGS.filter((l) => l.ready).map((l) => l.code);
const app = document.getElementById("app");
const nav = document.getElementById("nav");
const langBar = document.getElementById("langs");
const footer = document.getElementById("footer");
const tabbar = document.getElementById("tabbar");

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
let church = null; // content/about/<언어>.json

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
  const locale = { ko: "ko-KR", en: "en-US", ur: "ur-PK", zh: "zh-CN", ja: "ja-JP", fr: "fr-FR", de: "de-DE", es: "es-ES", ru: "ru-RU" }[lang] || "en-US";
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
  // 교회 정보(소개 페이지·하단): 이 언어 파일이 없으면 영어, 그것도 없으면 한국어
  church = await load(`content/about/${lang}.json`).catch(() => load(`content/about/${lang === "ko" ? "ko" : "en"}.json`));
  document.documentElement.lang = lang;
  document.documentElement.dir = dirOf(lang);
  document.body.classList.toggle("dual", !!lang2);
  renderChrome(page, id);
  app.innerHTML = `<p class="muted pad">${esc(t.loading)}</p>`;
  try {
    const view = { "": home, pulpit: list, hq: list, gospel, prayer777, summit, about }[page];
    if (!view) return location.replace(href());
    app.innerHTML = page === "pulpit" || page === "hq" ? (id ? await message(page, id) : await view(page)) : await view();
    app.querySelectorAll("[data-vlist]").forEach((box) => applyVideoFilter(box, "", PAGE));
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="pad">⚠️ ${esc(String(e.message || e))}</p>`;
  }
  if (!sessionStorage.getItem("keepScroll")) window.scrollTo(0, 0);
  // 다른 페이지의 특정 위치로 가는 링크(예: 홈 → 교회 소개 · 오시는 길)
  const goto = sessionStorage.getItem("goto");
  if (goto) {
    sessionStorage.removeItem("goto");
    document.getElementById(goto)?.scrollIntoView();
  }
  document.title = `${t.church}`;
}

function renderChrome(page, id) {
  document.getElementById("brand").innerHTML = `<a href="${href()}"><img class="logo" src="assets/logo-mark.svg" alt="">${esc(t.church)}</a>`;
  const items = [
    ["about", t.nav_about],
    ["pulpit", t.nav_pulpit],
    ["hq", t.nav_hq],
    ["gospel", t.gospel],
    ["prayer777", t.prayer777],
    ["summit", t.nav_summit],
  ];
  nav.innerHTML =
    items.map(([p, label]) => `<a href="${href(p)}" class="${page === p ? "active" : ""}">${esc(label)}</a>`).join("") +
    (isInstalled() ? "" : `<button type="button" class="nav-install" data-install>📲 ${esc(t.install_app)}</button>`);
  // 주 언어를 두 번째 언어와 같은 것으로 고르면 두 언어를 맞바꿉니다.
  const primary = `<label class="lang1"><span aria-hidden="true">🌐</span>
      <select data-lang1 aria-label="Language">
        ${READY.map((c) => `<option value="${c}" ${c === lang ? "selected" : ""}>${nameOf(c)}</option>`).join("")}
      </select>
    </label>`;
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
  const soon = LANGS.filter((l) => !l.ready);
  langBar.innerHTML = `${primary}${second}${soon.length ? `<span class="soon">${soon.map((l) => l.name).join(" · ")} — ${esc(t.soon)}</span>` : ""}`;
  renderTabbar(page);
  const c = church;
  footer.innerHTML = `<div class="f-brand"><img src="assets/logo-mark.svg" alt="">${esc(c?.denomination || t.denomination)} ${esc(c?.name || t.church)}</div>
    ${
      c
        ? `<div class="f-info">
      <p><b>${esc(c.pastor.role)}</b> ${esc(c.pastor.name)}</p>
      <p><b>${esc(t.address)}</b> ${esc(c.address)}</p>
      <p><b>${esc(t.phone)}</b> <a href="tel:${esc(c.phone.replace(/-/g, ""))}">${esc(c.phone)}</a> · <b>${esc(t.email)}</b> <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>
      <p class="f-links">${c.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(" · ")} · <a href="${href("about")}">${esc(t.nav_about)} ›</a></p>
    </div>`
        : ""
    }
    <p>${esc(t.bible_credit)}: ${Object.entries(BIBLES)
    .filter(([c]) => c === lang || c === lang2 || c === "ko")
    .map(([, b]) => `${esc(b.name)} (${esc(b.license)})`)
    .join(" · ")}</p><p>© ${new Date().getFullYear()} ${esc(t.church)}</p>`;
}

// ---------- 폰: 아래 고정 탭바 (PC는 위쪽 메뉴 그대로) ----------
const ICON = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  pulpit: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10 9l5 2-5 2z" fill="currentColor"/><path d="M8 21h8"/>',
  hq: '<circle cx="12" cy="11" r="2"/><path d="M8.5 7.5a5 5 0 000 7M15.5 7.5a5 5 0 010 7M5.6 4.6a9 9 0 000 12.8M18.4 4.6a9 9 0 010 12.8"/><path d="M12 13v8"/>',
  tools: '<path d="M12 3v18M7 8h10"/>',
  more: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

function renderTabbar(page) {
  const tab = (key, label, attrs, on) => `<a ${attrs} class="tab ${on ? "on" : ""}">${icon(key)}<span>${esc(label)}</span></a>`;
  tabbar.innerHTML =
    tab("home", t.tab_home, `href="${href()}"`, page === "") +
    tab("pulpit", t.tab_pulpit, `href="${href("pulpit")}"`, page === "pulpit") +
    tab("hq", t.tab_hq, `href="${href("hq")}"`, page === "hq") +
    tab("tools", t.tab_tools, `href="#" role="button" data-sheet="tools"`, page === "gospel" || page === "prayer777") +
    tab("more", t.tab_more, `href="#" role="button" data-sheet="more"`, page === "about" || page === "summit");
}

/** 탭바의 '전도도구'·'더보기': 아래에서 올라오는 선택 창 */
function openSheet(kind) {
  const { page, id } = parseHash();
  const item = (p, emoji, label, sub = "") =>
    `<a class="sheet-item" href="${href(p)}" data-close><span class="sheet-ic">${emoji}</span><span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="sheet-go">›</span></a>`;
  const body =
    kind === "tools"
      ? item("gospel", "✝️", t.gospel, t.gospel_desc) + item("prayer777", "🙏", t.prayer777, t.prayer777_desc)
      : item("about", "⛪", t.nav_about, t.about_sheet_desc) +
        item("summit", "📘", t.nav_summit) +
        `<label class="sheet-item sheet-lang"><span class="sheet-ic">🌐</span><span><b>${esc(t.second_lang)}</b>
          <select data-lang2>
            <option value="">${esc(t.none)}</option>
            ${READY.filter((c) => c !== lang)
              .map((c) => `<option value="${c}" ${c === lang2 ? "selected" : ""}>${nameOf(c)}</option>`)
              .join("")}
          </select></span></label>` +
        (isInstalled() ? "" : `<button type="button" class="sheet-item" data-install><span class="sheet-ic">📲</span><span><b>${esc(t.install_app)}</b></span><span class="sheet-go">›</span></button>`);
  dlg.innerHTML = `<div class="v-wrap sheet">
    <div class="v-head"><h3>${esc(kind === "tools" ? t.tab_tools : t.tab_more)}</h3><button type="button" class="v-close" data-close aria-label="${esc(t.close)}">✕</button></div>
    <div class="sheet-list">${body}</div>
  </div>`;
  if (!dlg.open) dlg.showModal();
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
  const [idx, ytP, ytH] = await Promise.all([load("content/messages/index.json"), loadVideos("pulpit"), loadVideos("hq")]);
  const yt = { pulpit: ytP, hq: ytH };
  // 최근 영상 3개(영상이 없으면 글 메시지)
  const cards = (type) => {
    const vids = yt[type].videos.slice(0, 3);
    if (vids.length) return `<div class="vlist home">${vids.map((v) => videoRow(v, yt[type].cats, type)).join("")}</div>`;
    const rows = (idx[type] || []).slice(0, 3);
    if (!rows.length) return `<p class="muted">${esc(t.empty)}</p>`;
    return `<div class="cards">${rows.map((m) => msgCard(type, m)).join("")}</div>`;
  };
  return `
  ${
    church
      ? `<section class="home-info">
    <div class="hi-times">${church.worship
      .slice(0, 2)
      .concat(church.worship.slice(-1))
      .map((w) => `<span><b>${esc(w.name)}</b> ${esc(w.time)}</span>`)
      .join("")}</div>
    <div class="hi-actions">
      <a href="${href("about")}" data-goto="worship">⛪ ${esc(t.about_worship)}</a>
      <a href="${href("about")}" data-goto="location">📍 ${esc(t.about_location)}</a>
    </div>
  </section>`
      : ""
  }
  ${homeSection("pulpit", t.nav_pulpit, cards("pulpit"))}
  ${homeSection("hq", t.nav_hq, cards("hq"))}
  <section class="block">
    <div class="block-head"><div><h2>${esc(t.nav_tools)}</h2><p class="muted">${esc(t.tools_desc)}</p></div></div>
    <div class="tools">
      <a class="tool gospel" href="${href("gospel")}"><span class="tool-icon"><img src="assets/logo-mark.svg" alt=""></span><strong>${esc(t.gospel)}</strong><span>${esc(t.gospel_desc)}</span></a>
      <a class="tool prayer" href="${href("prayer777")}"><span class="tool-icon">🙏</span><strong>${esc(t.prayer777)}</strong><span>${esc(t.prayer777_desc)}</span></a>
    </div>
  </section>`;
}

const homeSection = (type, title, body) => `
  <section class="block">
    <div class="block-head">
      <h2>${esc(title)}</h2>
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

// ---------- 유튜브 영상 목록 (영상은 유튜브에 있고 여기엔 ID·제목만: scripts/sync_youtube.py) ----------
const PAGE = 20;
const loadVideos = async (type) => {
  const [cats, videos] = await Promise.all([load("content/videos/categories.json"), load(`content/videos/${type}.json`).catch(() => [])]);
  return { ...cats[type], videos: videos.filter((v) => !v.hidden) };
};
const catName = (c) => (c ? c[lang] ?? c.ko : "");

const vTitle = (v) => v.titles?.[lang] ?? v.title;
// 녹취가 있는 영상은 사이트 안 녹취 페이지로(영상도 그 페이지 위쪽에), 없으면 플레이어 팝업/유튜브
const videoRow = (v, cats, type) => {
  const c = cats.find((x) => x.id === v.cat);
  const tr = v.tr?.length;
  const link = tr
    ? `href="${href(type, "v_" + v.id)}"`
    : `href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener"${v.noembed ? "" : ` data-yt="${esc(v.id)}"`}`;
  return `<a class="vrow" ${link} data-cat="${esc(v.cat)}">
    <span class="vthumb"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg" alt="" loading="lazy"><span class="vplay" aria-hidden="true">▶</span></span>
    <span class="vtxt">
      <strong>${esc(vTitle(v))}</strong>
      <span class="vmeta">${c ? `<span class="vcat">${esc(catName(c))}</span>` : ""}${tr ? `<span class="vtr">📄 ${esc(t.transcript)}</span>` : ""}<time>${esc(formatDate(v.date))}</time>${v.preacher ? `<span>${esc(v.preacher)}</span>` : ""}</span>
    </span>
  </a>`;
};

async function list(type) {
  const [idx, yt] = await Promise.all([load("content/messages/index.json"), loadVideos(type)]);
  const rows = idx[type] || [];
  const title = type === "pulpit" ? t.nav_pulpit : t.nav_hq;
  const counts = {};
  yt.videos.forEach((v) => (counts[v.cat] = (counts[v.cat] || 0) + 1));
  const videos = yt.videos.length
    ? `<label class="vcat-select"><select data-vcatsel aria-label="Category">
        <option value="">${esc(t.all)} (${yt.videos.length})</option>
        ${yt.cats
          .filter((c) => counts[c.id])
          .map((c) => `<option value="${esc(c.id)}">${esc(catName(c))} (${counts[c.id]})</option>`)
          .join("")}
      </select></label>
      <div class="vlist" data-vlist>${yt.videos.map((v) => videoRow(v, yt.cats, type)).join("")}</div>
      <button type="button" class="vmore" data-vmore>${esc(t.show_more)}</button>
      <p class="vchannel"><a href="${esc(yt.channel)}" target="_blank" rel="noopener">▶ ${esc(t.watch_yt)} ›</a></p>`
    : "";
  const scripts = rows.length
    ? `${videos ? `<h2 class="sub-title">${esc(t.scripts)}</h2>` : ""}<div class="cards list">${rows.map((m) => msgCard(type, m)).join("")}</div>`
    : "";
  return `<section class="block">
    <h1 class="page-title">${esc(title)}</h1>
    ${videos}${scripts}${videos || scripts ? "" : `<p class="muted">${esc(t.empty)}</p>`}
  </section>`;
}

/** 목록으로 돌아가는 버튼(페이지 위·아래) */
const backBtn = (type, where = "") =>
  `<a class="back-btn ${where}" href="${href(type)}">‹ ${esc(t.back_list)} · ${esc(type === "pulpit" ? t.nav_pulpit : t.nav_hq)}</a>`;

/** 카테고리 바꾸기(드롭다운) */
function setVideoCat(block, cat) {
  applyVideoFilter(block.querySelector("[data-vlist]"), cat, PAGE);
}

/** 영상 + 녹취 페이지: #/<lang>/<pulpit|hq>/v_<videoId>. 녹취는 content/transcripts/<type>/<id>/<언어>.md */
async function videoPage(type, vid) {
  const yt = await loadVideos(type);
  const v = yt.videos.find((x) => x.id === vid);
  if (!v) return `<p class="pad">404</p>`;
  const c = yt.cats.find((x) => x.id === v.cat);
  const langs = v.tr || [];
  const src = langs.includes(lang) ? lang : langs[0];
  const base = `content/transcripts/${type}/${encodeURIComponent(vid)}`;
  const md = src ? await load(`${base}/${src}.md`, "text") : "";
  const has2 = lang2 && lang2 !== src && langs.includes(lang2);
  const md2 = has2 ? await load(`${base}/${lang2}.md`, "text") : null;
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`;
  // 채널이 퍼가기를 막은 영상은 썸네일을 눌러 유튜브에서 재생
  const player = v.noembed
    ? `<a class="player-frame player-off" href="${watch}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${encodeURIComponent(vid)}/hqdefault.jpg" alt=""><span class="vplay big">▶ ${esc(t.watch_yt)}</span></a>`
    : `<div class="player-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?rel=0&playsinline=1" title="${esc(vTitle(v))}"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  const body = !md
    ? ""
    : has2
      ? duo(renderMarkdown(md, src), src, renderMarkdown(md2, lang2), lang2)
      : `<div class="prose" lang="${src}" dir="${dirOf(src)}">${renderMarkdown(md, src)}</div>`;
  return `<article class="article vpage">
    ${backBtn(type)}
    <div class="vpage-player">${player}</div>
    <p class="vmeta">${c ? `<span class="vcat">${esc(catName(c))}</span>` : ""}<time>${esc(formatDate(v.date))}</time>${v.preacher ? `<span>${esc(v.preacher)}</span>` : ""}</p>
    <h1>${esc(vTitle(v))}${has2 && v.titles?.[lang2] ? sub2(v.titles[lang2]) : ""}</h1>
    ${md ? `<p class="notice">📄 ${esc(t.transcript_note)}${src !== lang ? " " + esc(t.not_translated) : ""}</p><p class="hint">👆 ${esc(t.tap_hint)}</p>` : ""}
    ${body}
    ${backBtn(type, "bottom")}
  </article>`;
}

/** 사이트 안 영상 플레이어(팝업). 닫으면 iframe을 지워 재생도 멈춤 */
function openPlayer(row) {
  const id = row.dataset.yt;
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  dlg.innerHTML = `<div class="v-wrap player">
    <div class="v-head"><span class="vmeta">${row.querySelector(".vmeta")?.innerHTML || ""}</span><button type="button" class="v-close" data-close aria-label="${esc(t.close)}">✕</button></div>
    <div class="player-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1" title="${esc(row.querySelector("strong")?.textContent || "")}"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <div class="player-info"><strong>${esc(row.querySelector("strong")?.textContent || "")}</strong>
      <a href="${watch}" target="_blank" rel="noopener">▶ ${esc(t.watch_yt)} ›</a></div>
    <button type="button" class="back-btn bottom player-back" data-close>‹ ${esc(t.back_list)}</button>
  </div>`;
  dlg.classList.add("wide");
  if (!dlg.open) dlg.showModal();
}

/** 카테고리 필터 + "더 보기": 행은 모두 그려 두고 보이는 것만 고름(숨긴 썸네일은 lazy라 안 받음) */
function applyVideoFilter(box, cat, limit) {
  let shown = 0,
    total = 0;
  for (const row of box.querySelectorAll(".vrow")) {
    const match = !cat || row.dataset.cat === cat;
    if (match) total++;
    const show = match && shown < limit;
    if (show) shown++;
    row.hidden = !show;
  }
  box.dataset.cat = cat;
  box.dataset.limit = limit;
  const more = box.parentElement.querySelector("[data-vmore]");
  if (more) more.hidden = shown >= total;
}

async function message(type, id) {
  if (id.startsWith("v_")) return videoPage(type, id.slice(2));
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
    ${backBtn(type)}
    <time>${esc(formatDate(m.date))}</time>
    <h1>${esc(pick(m.title))}${has2 ? sub2(m.title[lang2]) : ""}</h1>
    ${m.preacher ? `<p class="muted">${esc(t.preacher)}: ${esc(pick(m.preacher))}</p>` : ""}
    ${src !== lang ? `<p class="notice">${esc(t.not_translated)}</p>` : ""}
    <p class="hint">👆 ${esc(t.tap_hint)}</p>
    ${body}
    ${backBtn(type, "bottom")}
  </article>`;
}

// ---------- 교회 소개 (content/about/<언어>.json) ----------
async function about() {
  const c = church;
  const tel = c.phone.replace(/-/g, "");
  const q = encodeURIComponent(c.mapQuery);
  const copyBtn = (text) => `<button type="button" class="copy-btn" data-copytext="${esc(text)}">${esc(t.copy)}</button>`;
  return `<article class="about">
    <section class="about-hero">
      <img src="assets/logo-mark.svg" alt="">
      <div>
        <small>${esc(c.denomination)} · ${esc(c.founded)}</small>
        <h1>${esc(c.name)}</h1>
        <p class="about-meaning">${esc(c.meaning)}</p>
      </div>
    </section>
    <p class="about-intro">${renderInline(c.intro, lang, { auto: true })}</p>

    <section class="about-sec" id="worship">
      <h2>⛪ ${esc(t.about_worship)}</h2>
      <ul class="worship">${c.worship
        .map((w) => `<li><span class="w-name">${esc(w.name)}${w.note ? `<small>${esc(w.note)}</small>` : ""}</span><span class="w-time">${esc(w.time)}</span></li>`)
        .join("")}</ul>
    </section>

    <section class="about-sec">
      <h2>🙏 ${esc(t.about_people)}</h2>
      <dl class="people">
        <div><dt>${esc(c.pastor.role)}</dt><dd>${esc(c.pastor.name)}</dd></div>
        <div><dt>${esc(t.about_missionaries)}</dt><dd>${c.missionaries.map((m) => `<span><b>${esc(m.country)}</b> ${esc(m.names)}</span>`).join("")}</dd></div>
      </dl>
    </section>

    <section class="about-sec" id="location">
      <h2>📍 ${esc(t.about_location)}</h2>
      <div class="loc-card">
        <p class="addr">${esc(c.address)} ${copyBtn(c.address)}</p>
        ${c.landmark ? `<p class="landmark">🚩 ${esc(c.landmark)}</p>` : ""}
      </div>
      <div class="map-links">
        <a href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">${esc(t.map_naver)}</a>
        <a href="https://map.kakao.com/link/search/${q}" target="_blank" rel="noopener">${esc(t.map_kakao)}</a>
        <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${esc(t.map_google)}</a>
      </div>
    </section>

    <section class="about-sec">
      <h2>☎️ ${esc(t.about_contact)}</h2>
      <div class="contact">
        <a class="contact-btn" href="tel:${esc(tel)}"><span>📞</span><b>${esc(t.phone)}</b>${esc(c.phone)}</a>
        <a class="contact-btn" href="mailto:${esc(c.email)}"><span>✉️</span><b>${esc(t.email)}</b>${esc(c.email)}</a>
        ${c.links.map((l) => `<a class="contact-btn" href="${esc(l.url)}" target="_blank" rel="noopener"><span>🔗</span><b>${esc(l.label)}</b>${esc(l.url.replace(/^https?:\/\/(www\.)?/, ""))}</a>`).join("")}
      </div>
    </section>

    <section class="about-sec">
      <h2>💝 ${esc(t.about_offering)}</h2>
      <p class="muted">${esc(c.offering.text)}</p>
      <div class="accounts">${c.offering.accounts
        .map(
          (a) => `<div class="account"><span class="acc-label">${esc(a.label)}</span><span class="acc-no">${esc(a.bank)} <b>${esc(a.number)}</b></span><span class="acc-holder">${esc(t.holder)}: ${esc(a.holder)}</span>${copyBtn(`${a.bank} ${a.number}`)}</div>`,
        )
        .join("")}</div>
    </section>

    <section class="about-sec">
      <h2>🌱 ${esc(t.about_ministries)}</h2>
      <div class="ministries">${(c.ministries || [])
        .map(
          (m) => `<div class="ministry"><strong>${esc(m.name)}</strong>${m.desc ? `<span class="muted">${esc(m.desc)}</span>` : ""}
            <span class="ministry-act">${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(t.visit)} ›</a>` : ""}${
              m.phone ? `<a href="tel:${esc(m.phone.replace(/-/g, ""))}">📞 ${esc(m.phoneLabel || t.phone)} ${esc(m.phone)}</a>` : ""
            }</span></div>`,
        )
        .join("")}</div>
    </section>
  </article>`;
}

// ---------- 서밋러닝 (외부 블로그·유튜브로 연결) ----------
const SUMMIT = {
  blog: "https://blog.naver.com/summitlearning",
  youtube: "https://www.youtube.com/@%EC%84%9C%EB%B0%8B%EB%9F%AC%EB%8B%9D",
};
async function summit() {
  return `<section class="block">
    <h1 class="page-title">${esc(t.nav_summit)}</h1>
    <div class="links">
      <a class="link-card blog" href="${SUMMIT.blog}" target="_blank" rel="noopener">
        <span class="link-icon">N</span><span><strong>${esc(t.summit_blog)}</strong><small>blog.naver.com/summitlearning</small></span><span class="link-go">›</span>
      </a>
      <a class="link-card yt" href="${SUMMIT.youtube}" target="_blank" rel="noopener">
        <span class="link-icon">▶</span><span><strong>${esc(t.summit_youtube)}</strong><small>youtube.com/@서밋러닝</small></span><span class="link-go">›</span>
      </a>
    </div>
  </section>`;
}

// ---------- 홈 화면에 추가(앱처럼 설치) ----------
let installPrompt = null; // 안드로이드 크롬·엣지: 설치 창을 바로 띄울 수 있음
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener("appinstalled", () => document.querySelectorAll("[data-install]").forEach((b) => (b.hidden = true)));
const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    return;
  }
  // 아이폰이나 설치 창을 띄울 수 없는 브라우저: 직접 추가하는 방법 안내
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua);
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || ios;
  const steps = inApp ? t.install_inapp : ios ? t.install_ios : mobile ? t.install_android : t.install_pc;
  dlg.innerHTML = `<div class="v-wrap">
    <div class="v-head"><h3>📲 ${esc(t.install_app)}</h3><button type="button" class="v-close" data-close aria-label="${esc(t.close)}">✕</button></div>
    <div class="v-body install-help">
      <img src="assets/icons/icon-192.png" alt="" width="64" height="64">
      <ol>${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
    </div>
  </div>`;
  if (!dlg.open) dlg.showModal();
}

// ---------- 777 기도 ----------
/** "[[ACT 1:3]] 하나님 나라" 같은 문구를 성구 버튼 포함 HTML로 (줄바꿈 유지) */
const rich = (s, l = lang) => (s || "").split("\n").map((x) => inline(x, l)).join("<br>");

/**
 * 777 그림: 7망대·7여정·7이정표를 7행 × 3열 한 판에 모두 보여 줌.
 * 칸을 누르면 팝업으로 요약·세부 내용과 해당 기도문(‹ › 로 다음 항목).
 */
async function prayer777() {
  const p = await load(`content/prayer777/${lang}.json`);
  const p2 = lang2 ? await load(`content/prayer777/${lang2}.json`).catch(() => null) : null;
  const big = store.get("big") === "1";
  document.body.classList.toggle("big", big);
  const onlyPrayer = store.get("p7pray") === "1";
  const [B, J, G] = p.groups;

  const head = `<header class="g-hero">
      <h1>${esc(p.title)}${p2 ? sub2(p2.title) : ""}</h1>
      <p class="g-sub">${esc(p.subtitle)}${p2 ? sub2(p2.subtitle) : ""}</p>
    </header>
    <div class="toolbar">
      <button type="button" class="toggle on" data-toggle="p7pray">${esc(onlyPrayer ? t.chart_view : t.full_prayer)}</button>
      <button type="button" class="toggle ${big ? "on" : ""}" data-toggle="big">A+ ${esc(t.big_text)}</button>
    </div>`;
  const closing = `<div class="p7-closing">${p.closing.map((c, i) => `<p>${esc(c)}${sub2(p2?.closing[i])}</p>`).join("")}</div>
    <p class="p7-source">${esc(t.source)}: ${esc(p.source)}</p>`;

  if (onlyPrayer) {
    return `<article class="p7">${head}
      ${p.groups
        .map(
          (g, gi) => `<section class="p7-pray-only p7-${g.id}">
            <h2>${esc(g.name)} <small>${esc(g.where)}</small>${sub2(p2?.groups[gi].name)}</h2>
            ${g.items
              .map(
                (it, ii) => `<div class="p7-pl"><span class="p7-pl-name">${esc(it.name)}</span>${it.prayer
                  .map((line, k) => `<p>${esc(line)}${sub2(p2?.groups[gi].items[ii].prayer[k])}</p>`)
                  .join("")}</div>`,
              )
              .join("")}
          </section>`,
        )
        .join("")}
      ${closing}
    </article>`;
  }

  p7Data = { p, p2 };
  // 한눈에 보는 777 판: 7행 × 3열(망대·여정·이정표). 칸을 누르면 내용과 기도문이 팝업으로 열림
  const colHead = (g, gi) => `<div class="p7b-head p7-${g.id}">
      <strong class="p7b-title">${esc(g.name)}</strong><small>${esc(g.where)}</small>${sub2(p2?.groups[gi].name)}
    </div>`;
  const cells = [];
  for (let ii = 0; ii < 7; ii++) {
    cells.push(`<span class="p7b-no">${ii + 1}</span>`);
    p.groups.forEach((g, gi) => {
      const it = g.items[ii];
      cells.push(
        it
          ? `<button type="button" class="p7b-cell p7-${g.id}" data-p7="${gi}.${ii}"><span class="p7b-name">${esc(it.name)}</span>${sub2(p2?.groups[gi].items[ii]?.name)}</button>`
          : "<span></span>",
      );
    });
  }
  const board = `<div class="p7-board"><span></span>${p.groups.map(colHead).join("")}${cells.join("")}</div>`;

  return `<article class="p7">${head}
    <p class="hint">👆 ${esc(t.p7_hint)}</p>
    ${board}
    ${closing}
  </article>`;
}

// 777 항목 팝업 (판의 칸, 팝업 안의 ‹ › 버튼)
let p7Data = null;
function p7ItemBody(gi, ii) {
  const { p, p2 } = p7Data;
  const it = p.groups[gi].items[ii];
  const stripR = (s) => stripRefs(s).replace(/\s+/g, " ");
    const it2 = p2?.groups[gi].items[ii];
    // 10비밀·10발판처럼 짧은 항목이 많으면 두 칸으로 촘촘하게
    const compact = it.rows.length > 4 && it.rows.every(([k, v]) => typeof v === "string" && (k + v).length <= 45);
    // 행 형식: [이름, 설명] · 이름이 "#"로 시작하면 소제목 · 설명이 배열이면 표
    const table = (cells) =>
      `<table class="p7-table">${cells.map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join("")}</tr>`).join("")}</table>`;
    const rows = it.rows.length
      ? `<dl class="p7-rows ${compact ? "compact" : ""}">${it.rows
          .map(([k, v], ri) => {
            const v2 = it2?.rows[ri]?.[1];
            const no = it.numbered ? `<span class="p7-rn">${ri + 1}</span>` : "";
            if (k.startsWith("#") || Array.isArray(v)) {
              const h = k.replace(/^#/, "");
              return `<div class="p7-block">${h ? `<dt class="p7-rh">${esc(h)}</dt>` : ""}<dd>${Array.isArray(v) ? table(v) : rich(v)}${
                typeof v2 === "string" ? sub2(stripR(v2)) : ""
              }</dd></div>`;
            }
            return `<div>${k ? `<dt>${no}${rich(k)}</dt>` : ""}<dd>${rich(v)}${typeof v2 === "string" ? sub2(stripR(v2)) : ""}${
              !v && it2?.rows[ri]?.[0] && it2.rows[ri][0] !== k ? sub2(it2.rows[ri][0]) : ""
            }</dd></div>`;
          })
          .join("")}</dl>`
      : "";
    // 규칙: 세부 행(rows)이 있으면 그것이 설명이므로 요약은 생략(중복 방지).
    // 행이 없는 항목만 요약을 설명으로 표시. 이름과 똑같은 요약도 생략.
    const sumShown = it.sum && it.sum !== it.name && !it.rows.length;
    const sum = sumShown ? `<p class="p7-sum">${inline(it.sum)}${it2?.sum ? sub2(stripR(it2.sum)) : ""}</p>` : "";
    return `<div class="p7-body">
        ${sum}
        ${rows}
        <div class="p7-prayer">${it.prayer.map((line, k) => `<p>${esc(line)}${sub2(it2?.prayer[k])}</p>`).join("")}</div>
      </div>`;
}

function openP7(gi, ii) {
  const { p, p2 } = p7Data;
  const flat = p.groups.flatMap((g, a) => g.items.map((_, b) => [a, b]));
  const at = flat.findIndex(([a, b]) => a === gi && b === ii);
  const [pg, pi] = flat[(at - 1 + flat.length) % flat.length];
  const [ng, ni] = flat[(at + 1) % flat.length];
  const g = p.groups[gi];
  const it = g.items[ii];
  dlg.innerHTML = `<div class="v-wrap p7 p7-dlg"><div class="p7-${g.id}">
    <div class="v-head">
      <span class="p7d-title"><span class="p7d-group">${esc(g.name)}</span><span class="p7-no">${ii + 1}</span><strong>${esc(it.name)}</strong>${sub2(p2?.groups[gi].items[ii]?.name)}</span>
      <button type="button" class="v-close" data-close aria-label="${esc(t.close)}">✕</button>
    </div>
    <div class="v-body d-body"><div class="d-lang" lang="${lang}" dir="${dirOf(lang)}">${p7ItemBody(gi, ii)}</div></div>
    <div class="p7d-nav">
      <button type="button" data-p7="${pg}.${pi}">‹ ${esc(p.groups[pg].items[pi].name)}</button>
      <button type="button" data-p7="${ng}.${ni}">${esc(p.groups[ng].items[ni].name)} ›</button>
    </div>
  </div></div>`;
  if (!dlg.open) dlg.showModal();
  dlg.querySelector(".v-body").scrollTop = 0;
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
  if (ref) {
    if (ref.closest("summary")) e.preventDefault(); // 접힌 줄의 성구는 펼침 없이 말씀만 열기
    return ref.closest(".d-body") ? toggleInlineVerse(ref) : openVerse(ref.dataset.ref);
  }
  const p7 = e.target.closest("[data-p7]");
  if (p7 && p7Data) {
    const [gi, ii] = p7.dataset.p7.split(".").map(Number);
    return openP7(gi, ii);
  }
  // 영상: 유튜브로 나가지 않고 사이트 안 플레이어 팝업으로 재생 (새 탭/Ctrl+클릭은 그대로 유튜브)
  // 채널이 퍼가기를 막은 영상(noembed)은 data-yt가 없어 링크대로 유튜브에서 열림
  const vrow = e.target.closest("[data-yt]");
  if (vrow && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    return openPlayer(vrow);
  }
  if (e.target.closest("[data-install]")) return installApp();
  const g = e.target.closest("[data-goto]");
  if (g) sessionStorage.setItem("goto", g.dataset.goto);
  const sh = e.target.closest("[data-sheet]");
  if (sh) return openSheet(sh.dataset.sheet);
  const cp = e.target.closest("[data-copytext]");
  if (cp) {
    navigator.clipboard?.writeText(cp.dataset.copytext).then(() => {
      cp.textContent = t.copied;
      setTimeout(() => (cp.textContent = t.copy), 1500);
    });
    return;
  }
  const more = e.target.closest("[data-vmore]");
  if (more) {
    const box = more.parentElement.querySelector("[data-vlist]");
    return applyVideoFilter(box, box.dataset.cat, Number(box.dataset.limit) + PAGE);
  }
  const all = e.target.closest("[data-p7all]");
  if (all) {
    const items = [...document.querySelectorAll(".p7-item")];
    const open = !items.every((d) => d.open);
    items.forEach((d) => (d.open = open));
    all.textContent = open ? t.collapse_all : t.expand_all;
    all.classList.toggle("on", open);
    return;
  }
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
  if (e.target.matches("[data-vcatsel]")) return setVideoCat(e.target.closest(".block"), e.target.value);
  const { page, id } = parseHash();
  if (e.target.matches("[data-lang2]")) location.hash = href(page, id, lang, e.target.value || null);
  // 주 언어를 두 번째 언어와 같은 것으로 고르면 두 언어를 맞바꿉니다.
  if (e.target.matches("[data-lang1]")) {
    const c = e.target.value;
    location.hash = href(page, id, c, c === lang2 ? lang : lang2);
  }
});

window.addEventListener("hashchange", route);

// ---------- 성구 팝업 ----------
const dlg = document.getElementById("verse");
// 팝업을 닫으면 영상 재생을 멈추고 넓은 모드 해제
dlg.addEventListener("close", () => {
  if (dlg.classList.contains("wide")) {
    dlg.classList.remove("wide");
    dlg.innerHTML = "";
  }
});
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
    : `<div class="v-tabs">${[...new Set([lang, "ko", "en"])]
        .filter((c) => BIBLES[c])
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
