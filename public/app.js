/* =========================
   PreCheck — public/app.js (FULL)
   Compatible with your index.html IDs:
   - #btnMenu, #drawerBackdrop, #btnDrawerClose
   - #drawerHome, #drawerAlerts, #drawerManager, #drawerSummary, #drawerWISR, #drawerLogout
   - #main, #roleHost, #sessionLine
   - modal: #modalBackdrop #modalClose #modalTitle #modalBody
   - #toast
   ========================= */

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- Polyfills ---------- */
// Some Android WebViews can miss CSS.escape -> crash when using querySelector with dynamic keys
if (!window.CSS) window.CSS = {};
if (typeof window.CSS.escape !== "function") {
  window.CSS.escape = (value) => {
    const str = String(value ?? "");
    // Minimal safe escape for attribute selectors
    return str.replace(/["\\#.:;\[\](),=<>+~*^$|!?/\s]/g, "\\$&");
  };
}

/* ---------- safe small helpers ---------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function pad2(n) { return String(n).padStart(2, "0"); }
function dayKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function ymd(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function todayISO() { return ymd(new Date()); }
function addDaysISO(baseISO, days) {
  const dt = new Date(baseISO + "T00:00:00");
  dt.setDate(dt.getDate() + days);
  return ymd(dt);
}
function formatDMY(iso) {
  if (!iso) return "";
  const dt = new Date(String(iso).slice(0, 10) + "T00:00:00");
  const day = dt.getDate();
  const mon = dt.toLocaleString("en-GB", { month: "short" });
  const year = dt.getFullYear();
  return `${day} ${mon} ${year}`;
}
function normText(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- localStorage ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

/* ---------- Toast ---------- */
let _toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

/* ---------- Modal ---------- */
function openModal(title, html, opts = {}) {
  const b = $("#modalBackdrop");
  if (!b) return;

  $("#modalTitle").textContent = title || "Modal";
  $("#modalBody").innerHTML = html || "";
  b.classList.remove("hidden");

  // block closing when required
  b.dataset.lock = opts.noBackdropClose ? "1" : "0";
}
function closeModal() {
  const b = $("#modalBackdrop");
  if (!b) return;
  b.classList.add("hidden");
  $("#modalBody").innerHTML = "";
  b.dataset.lock = "0";
}
function bindModal() {
  const b = $("#modalBackdrop");
  const c = $("#modalClose");
  if (c) c.addEventListener("click", () => closeModal());
  if (b) {
    b.addEventListener("click", (e) => {
      if (e.target !== b) return;
      if (b.dataset.lock === "1") return;
      closeModal();
    });
  }
}

/* ---------- Drawer ---------- */
function openDrawer() { $("#drawerBackdrop")?.classList.remove("hidden"); }
function closeDrawer() { $("#drawerBackdrop")?.classList.add("hidden"); }

function bindDrawer() {
  $("#btnMenu")?.addEventListener("click", (e) => { e.preventDefault(); openDrawer(); });
  $("#btnDrawerClose")?.addEventListener("click", (e) => { e.preventDefault(); closeDrawer(); });

  $("#drawerBackdrop")?.addEventListener("click", (e) => {
    if (e.target === $("#drawerBackdrop")) closeDrawer();
  });

  $("#drawerHome")?.addEventListener("click", () => { closeDrawer(); goHome(); });
  $("#drawerAlerts")?.addEventListener("click", () => { closeDrawer(); setView({ page: "alerts" }, true); });
  $("#drawerManager")?.addEventListener("click", () => { closeDrawer(); setView({ page: "manager" }, true); });
  $("#drawerSummary")?.addEventListener("click", () => { closeDrawer(); setView({ page: "summaryHome" }, true); });
  $("#drawerWISR")?.addEventListener("click", () => { closeDrawer(); setView({ page: "wisr" }, true); });
  $("#drawerLogout")?.addEventListener("click", () => { closeDrawer(); doLogout(); });
}

/* ---------- API ---------- */
async function apiGet(path, token = "") {
  const r = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t || `GET ${path} failed`);
  return t ? JSON.parse(t) : {};
}
async function apiPost(path, body, token = "") {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t || `POST ${path} failed`);
  return t ? JSON.parse(t) : {};
}
async function apiPatch(path, body, token = "") {
  const r = await fetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t || `PATCH ${path} failed`);
  return t ? JSON.parse(t) : {};
}
async function apiDel(path, token = "") {
  const r = await fetch(path, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t || `DELETE ${path} failed`);
  return t ? JSON.parse(t) : {};
}

/* =========================================================
   CONFIG
   ========================================================= */
const POPUP_ITEMS = [
  "Mix green",
  "Mac&cheese",
  "Lettuce",
  "Chicken Bacon (c)",
  "Liquid Egg",
  "Flatbread(Thawing)",
  "Avocado",
];

// Home categories emoji (BIG)
const CAT_EMOJI = {
  "Prepared items": "🥪",
  "Unopened chiller": "🧊",
  "Thawing": "💧",
  "Vegetables": "🥕",
  "Backroom": "📦",
  "Back counter": "🍞",
  "Front counter": "🥪",
  "Back counter chiller": "❄️",
  "Fountain Drinks": "🥤",
  "Sauce": "🧴",
};

// Sauce subcategories (3 colors, big emoji)
const SAUCE_SUBS = [
  { name: "Standby", emoji: "🧃", tone: "t-teal" },
  { name: "Open Inner", emoji: "🧴", tone: "t-purple" },
  { name: "Sandwich Unit", emoji: "🌶️", tone: "t-orange" },
];

// Categories forced to manual date (single bar)
const FORCE_MANUAL_DATE_CATS = new Set(["Unopened chiller", "Fountain Drinks"]);

function isChickenBaconC(name) {
  const t = normText(name).replace(/\s+/g, " ");
  return t === "chicken bacon (c)" || t === "chicken bacon(c)" || t === "chicken bacon c";
}

/* =========================================================
   STATE
   ========================================================= */
const state = {
  view: { page: "home", category: null, sauceSub: null, bucket: null, summaryMode: null },
  navStack: [],
  session: loadJSON("session", {
    store: "",
    staff: "",
    shift: "AM",
    isManager: false,
    managerToken: "",
    sessionDayKey: "",
  }),
  data: {
    categories: [],
    items: [],
  },
  drafts: {}, // itemKey -> { qty, expType, expDateISO }
};

/* =========================================================
   BOOT
   ========================================================= */
bindModal();
bindDrawer();
bindRoleBadge();
startMidnightWatcher();

boot().catch((e) => {
  console.error(e);
  toast("App error — check console");
});

async function boot() {
  ensureSessionDayKey();

  // If session missing -> session setup
  if (!state.session.store || !state.session.staff) {
    renderShell();
    openSessionSetup();
    return;
  }

  // Popup once per day, and resets after midnight even without logout
  maybeShowExpiryPopup();

  try {
    await loadAllForCurrentStore();
  } catch (e) {
    console.error("loadAllForCurrentStore failed:", e);
    renderShell();
    $("#main").innerHTML = `
      <div class="card">
        <div class="h1">Failed to load data</div>
        <div class="muted" style="font-weight:900; margin-top:6px;">
          Please check server and database connection.
        </div>
        <div style="margin-top:12px;">
          <button id="retryBtn" class="btn-yellow">Retry</button>
        </div>
      </div>
    `;
    $("#retryBtn")?.addEventListener("click", () => boot());
    return;
  }

  render();
}

/* =========================================================
   SESSION / MIDNIGHT RESET
   ========================================================= */
function ensureSessionDayKey() {
  const k = dayKeyNow();
  if (!state.session.sessionDayKey) {
    state.session.sessionDayKey = k;
    saveJSON("session", state.session);
  }
}

function startMidnightWatcher() {
  setInterval(() => {
    const k = dayKeyNow();
    if (state.session.sessionDayKey && state.session.sessionDayKey !== k) {
      // midnight reached
      state.session.sessionDayKey = k;
      saveJSON("session", state.session);

      // allow popup again
      localStorage.removeItem(popupSeenKeyForDay(k));

      // show popup even if app left open
      maybeShowExpiryPopup(true);
    }
  }, 30 * 1000);
}

function popupSeenKeyForDay(dayKey) {
  return `expiry_popup_seen_${dayKey}`;
}

function maybeShowExpiryPopup(force = false) {
  const k = dayKeyNow();
  const seenKey = popupSeenKeyForDay(k);

  if (!force && localStorage.getItem(seenKey) === "1") return;

  localStorage.setItem(seenKey, "1");

  const list = POPUP_ITEMS.map((x) => `
    <li>
      <span class="popup-dot"></span>
      <span>${escapeHtml(x)}</span>
    </li>
  `).join("");

  openModal(
    "PLEASE check the expiry date",
    `
      <div class="popup-title">PLEASE check the expiry date of the items below:</div>
      <ul class="popup-list">${list}</ul>
      <div style="margin-top:14px">
        <button id="popupOk" class="btn-yellow">OK</button>
      </div>
    `,
    { noBackdropClose: true }
  );
  $("#popupOk")?.addEventListener("click", () => closeModal());
}

/* =========================================================
   LOAD DATA
   ========================================================= */
async function loadAllForCurrentStore() {
  const store = state.session.store;

  const cats = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
  const items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);

  state.data.categories = Array.isArray(cats) ? cats : [];
  const rawItems = Array.isArray(items) ? items : [];

  // Build canonical category map from categories list (UI truth)
  const canon = new Map();
  for (const c of state.data.categories) {
    const name = String(c?.name || "").trim();
    if (!name) continue;
    canon.set(normText(name), name);
  }

  // normalize category + sub_category + name
  state.data.items = rawItems.map((it) => {
    const rawCat = it?.category != null ? String(it.category).trim() : "";
    const rawSub = it?.sub_category != null ? String(it.sub_category).trim() : null;
    const rawName = it?.name != null ? String(it.name).trim() : "";

    const fixedCat = canon.get(normText(rawCat)) || rawCat;

    return {
      ...it,
      category: fixedCat,
      sub_category: rawSub,
      name: rawName,
    };
  });
}

/* =========================================================
   ROLE BADGE (Red Manager, Blue Staff)
   ========================================================= */
function bindRoleBadge() {
  // rendered by updateTopbar()
}
function updateTopbar() {
  const s = state.session;

  // session line
  const line = $("#sessionLine");
  if (line) {
    const show = s.store && s.staff;
    line.classList.toggle("hidden", !show);
    line.textContent = show ? `${s.store} • ${s.shift} • ${s.staff}` : "";
  }

  // role button into #roleHost
  const host = $("#roleHost");
  if (!host) return;
  host.innerHTML = `
    <button id="roleBtn" class="role-btn ${s.isManager ? "manager" : "staff"}" type="button">
      <span class="role-ico">${s.isManager ? "👑" : "👤"}</span>
      <span>${s.isManager ? "Manager" : "Staff"}</span>
    </button>
  `;
  $("#roleBtn")?.addEventListener("click", () => {
    toast(s.isManager ? "Manager mode" : "Staff mode");
  });
}

/* =========================================================
   NAVIGATION
   ========================================================= */
function setView(next, push) {
  const curr = { ...state.view };
  if (push) state.navStack.push(curr);
  state.view = { ...state.view, ...next };
  render();
}
function goBack() {
  const prev = state.navStack.pop();
  state.view = prev || { page: "home", category: null, sauceSub: null, bucket: null, summaryMode: null };
  render();
}
function goHome() {
  state.navStack = [];
  state.view = { page: "home", category: null, sauceSub: null, bucket: null, summaryMode: null };
  render();
}

/* =========================================================
   RENDER DISPATCH
   ========================================================= */
function renderShell() {
  updateTopbar();
  $("#main").innerHTML = `<div class="card">Loading…</div>`;
}

function render() {
  updateTopbar();

  const main = $("#main");
  if (!main) return;

  if (!state.session.store || !state.session.staff) {
    main.innerHTML = `<div class="card">Session not started.</div>`;
    openSessionSetup();
    return;
  }

  switch (state.view.page) {
    case "home": return renderHome();
    case "category": return renderCategory();
    case "alerts": return renderAlerts();
    case "manager": return renderManagerHome();
    case "managerEditItems": return renderManagerEditItems();
    case "managerCategories": return renderManagerCategories();
    case "summaryHome": return renderSummaryHome();
    case "summaryList": return renderSummaryList();
    case "wisr": return renderWISR();
    default:
      main.innerHTML = `<div class="card">Unknown page</div>`;
  }
}

/* =========================================================
   SESSION SETUP MODAL
   ========================================================= */
function openSessionSetup() {
  const s = state.session;

  openModal(
    "Start Session",
    `
      <div class="card">
        <div class="field">
          <span class="label">Select Store</span>
          <div style="display:flex; gap:10px;">
            <button id="pickPDD" class="btn-yellow" style="flex:1; border-radius:14px;">PDD</button>
            <button id="pickSKH" class="btn-yellow" style="flex:1; border-radius:14px; opacity:.85;">SKH</button>
          </div>
        </div>

        <div class="field">
          <span class="label">Shift</span>
          <select id="shiftSel" class="input">
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>

        <div class="field">
          <span class="label">Staff Name / ID</span>
          <input id="staffInp" class="input" placeholder="e.g. Suri" value="${escapeHtml(s.staff || "")}" />
        </div>

        <div class="field">
          <button id="startBtn" class="btn-yellow">Start</button>
        </div>

        <div class="muted" style="font-size:12px; font-weight:900;">
          Session auto resets after midnight.
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  let storePick = s.store || "PDD";
  const setPick = (val) => {
    storePick = val;
    const pdd = $("#pickPDD");
    const skh = $("#pickSKH");
    if (pdd) pdd.style.opacity = val === "PDD" ? "1" : ".75";
    if (skh) skh.style.opacity = val === "SKH" ? "1" : ".75";
  };
  setPick(storePick);

  $("#shiftSel").value = s.shift || "AM";
  $("#pickPDD")?.addEventListener("click", () => setPick("PDD"));
  $("#pickSKH")?.addEventListener("click", () => setPick("SKH"));

  $("#startBtn")?.addEventListener("click", async () => {
    const staff = String($("#staffInp")?.value || "").trim();
    const shift = String($("#shiftSel")?.value || "AM").trim();

    if (!staff) return toast("Please enter staff name/ID");

    state.session.store = storePick;
    state.session.shift = shift;
    state.session.staff = staff;

    // back to staff mode on new session
    state.session.isManager = false;
    state.session.managerToken = "";

    // day key for midnight reset
    state.session.sessionDayKey = dayKeyNow();
    saveJSON("session", state.session);

    closeModal();

    // show popup once per day (new session)
    maybeShowExpiryPopup();

    try {
      await loadAllForCurrentStore();
      goHome();
    } catch (e) {
      console.error(e);
      toast("Failed to load data");
    }
  });
}

/* =========================================================
   HOME (summary cards + category tiles)
   ========================================================= */
function tileToneForCategory(name) {
  const map = {
    "Prepared items": "t-green",
    "Unopened chiller": "t-blue",
    "Thawing": "t-cyan",
    "Vegetables": "t-green2",
    "Backroom": "t-orange",
    "Back counter": "t-orange",
    "Front counter": "t-red",
    "Back counter chiller": "t-teal",
    "Fountain Drinks": "t-green2",
    "Sauce": "t-purple",
  };
  return map[name] || "t-green";
}

async function fetchExpiryForStore(store) {
  return apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
}

function renderHome() {
  const main = $("#main");

  const cats = (state.data.categories || [])
    .filter((c) => c && (c.is_active !== false))
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  // item count per category (match categories with normalization)
  const counts = {};
  for (const it of (state.data.items || [])) {
    const c = String(it.category || "").trim();
    if (!c) continue;
    counts[c] = (counts[c] || 0) + 1;
  }

  const tiles = cats.map((c, idx) => {
    const name = String(c.name || "");
    const emoji = CAT_EMOJI[name] || "✅";
    const tone = tileToneForCategory(name);
    const count = counts[name] || 0;
    const delay = idx * 55;

    return `
      <button class="tile ${tone}" type="button" data-cat="${escapeHtml(name)}" style="animation-delay:${delay}ms;">
        <div class="ico" style="width:auto;height:auto;">
          <div style="font-size:52px; line-height:1;">${emoji}</div>
        </div>
        <div class="title" style="font-size:20px; font-weight:1200;">${escapeHtml(name)}</div>
        <div class="sub" style="font-size:13px;">${count} items</div>
      </button>
    `;
  }).join("");

  main.innerHTML = `
    <div id="homeSumWrap" class="summary-row"></div>
    <div class="tiles-2col">
      ${tiles}
    </div>
  `;

  // bind category tiles
  $$(".tile", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });

  // summary cards (current store only)
  const wrap = $("#homeSumWrap");
  if (wrap) {
    wrap.innerHTML = `
      <button class="sum-card sum-red" type="button"><div class="sum-num">…</div><div class="sum-lbl">Expiring<br/>Today</div></button>
      <button class="sum-card sum-amber" type="button"><div class="sum-num">…</div><div class="sum-lbl">Expiring<br/>Tomorrow</div></button>
      <button class="sum-card sum-green" type="button"><div class="sum-num">…</div><div class="sum-lbl">All Safe</div></button>
    `;

    const store = state.session.store;
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);

    fetchExpiryForStore(store)
      .then((rows) => {
        rows = Array.isArray(rows) ? rows : [];
        const todayCount = rows.filter((x) => String(x.expiry_value || "").slice(0, 10) === today).length;
        const tomorrowCount = rows.filter((x) => String(x.expiry_value || "").slice(0, 10) === tomorrow).length;
        const safeCount = rows.filter((x) => {
          const e = String(x.expiry_value || "").slice(0, 10);
          return e && e !== today && e !== tomorrow;
        }).length;

        wrap.innerHTML = `
          <button class="sum-card sum-red" id="homeSumToday" type="button">
            <div class="sum-num">${todayCount}</div>
            <div class="sum-lbl">Expiring<br/>Today</div>
          </button>
          <button class="sum-card sum-amber" id="homeSumTomorrow" type="button">
            <div class="sum-num">${tomorrowCount}</div>
            <div class="sum-lbl">Expiring<br/>Tomorrow</div>
          </button>
          <button class="sum-card sum-green" id="homeSumSafe" type="button">
            <div class="sum-num">${safeCount}</div>
            <div class="sum-lbl">All Safe</div>
          </button>
        `;

        $("#homeSumToday")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "TODAY", summaryMode: store }, true));
        $("#homeSumTomorrow")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "TOMORROW", summaryMode: store }, true));
        $("#homeSumSafe")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "SAFE", summaryMode: store }, true));
      })
      .catch((e) => {
        console.error(e);
        // keep the placeholder cards if summary fails
      });
  }
}

/* =========================================================
   CATEGORY
   ========================================================= */
function itemKey(it) {
  return it.id != null ? `id:${it.id}` : `name:${it.name}|${it.category}|${it.sub_category || ""}`;
}

function ensureDraft(key) {
  if (!state.drafts[key]) state.drafts[key] = { qty: 0, expType: "", expDateISO: "" };
  return state.drafts[key];
}

function renderSauceSubTiles() {
  const tiles = SAUCE_SUBS.map((s, idx) => {
    const delay = idx * 60;
    return `
      <button class="tile ${s.tone}" type="button" data-sub="${escapeHtml(s.name)}" style="min-height:128px; animation-delay:${delay}ms;">
        <div class="ico" style="width:auto;height:auto;">
          <div style="font-size:56px; line-height:1;">${s.emoji}</div>
        </div>
        <div class="title" style="font-size:20px; font-weight:1200;">${escapeHtml(s.name)}</div>
        <div class="sub" style="font-size:12px;">Tap to open</div>
      </button>
    `;
  }).join("");

  $("#main").innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Sauce</div>
    </div>
    <div class="tiles-2col">${tiles}</div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  $$(".tile", $("#main")).forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.dataset.sub;
      setView({ page: "category", category: "Sauce", sauceSub: sub }, true);
    });
  });
}

function renderCategory() {
  const main = $("#main");
  const cat = state.view.category;

  if (!cat) return goHome();

  // Sauce entry -> show sub tiles first
  if (normText(cat) === "sauce" && !state.view.sauceSub) {
    return renderSauceSubTiles();
  }

  const sauceSub = state.view.sauceSub || null;
  const title = normText(cat) === "sauce" && sauceSub ? `Sauce — ${sauceSub}` : cat;

  // filter items by category (+ sauce sub) using tolerant matching
  let items = (state.data.items || []).filter((x) => normText(x.category) === normText(cat));

  if (normText(cat) === "sauce" && sauceSub) {
    items = items.filter((x) => normText(x.sub_category) === normText(sauceSub));
  }

  const emptyMsg = items.length
    ? ""
    : `
      <div class="card" style="border-left:6px solid var(--yellow); margin-bottom:12px;">
        <div style="font-weight:1200;">No items found</div>
        <div class="muted" style="font-weight:900; margin-top:6px;">
          If this is Sauce subcategory: item sub_category must match the tile name.
        </div>
      </div>
    `;

  const rows = items.map((it, idx) => renderItemRow(it, cat, idx)).join("");

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    ${emptyMsg}

    <div class="edit-list" id="itemsWrap">
      ${rows}
    </div>

    <div class="save-bar">
      <button id="saveBtn" class="btn-yellow">Save ${escapeHtml(cat)}</button>
    </div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  bindItemControls(items, cat);

  $("#saveBtn")?.addEventListener("click", async () => {
    await saveCategoryDrafts(items, cat);
  });
}

function renderItemRow(it, cat, idx) {
  const key = itemKey(it);
  const d = ensureDraft(key);

  const animDelay = idx * 45;

  const forceManual = FORCE_MANUAL_DATE_CATS.has(cat);
  const isCBC = isChickenBaconC(it.name);

  let expiryUI = "";

  if (isCBC) {
    expiryUI = `<div class="edit-helper">Expiry: End of day (auto).</div>`;
  } else if (forceManual) {
    expiryUI = `
      <div class="exp-wrap">
        <input class="input" type="date" data-expdate="${escapeHtml(key)}" value="${escapeHtml(d.expDateISO || "")}" />
        <div class="edit-helper">Expiry: Pick a date (manual).</div>
      </div>
    `;
} else {
  const selVal = d.expType || "";
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  expiryUI = `
    <div class="exp-wrap">
      <select class="input" data-expsel="${escapeHtml(key)}">
        <option value="">Select</option>
        <option value="TODAY"${selVal === "TODAY" ? " selected" : ""}>
          ${formatDMY(today)}
        </option>
        <option value="TOMORROW"${selVal === "TOMORROW" ? " selected" : ""}>
          ${formatDMY(tomorrow)}
        </option>
        <option value="PICK"${selVal === "PICK" ? " selected" : ""}>
          Pick date…
        </option>
      </select>

      <div data-pickwrap="${escapeHtml(key)}" class="${selVal === "PICK" ? "" : "hidden"}">
        <input class="input" type="date" data-expdate="${escapeHtml(key)}" value="${escapeHtml(d.expDateISO || "")}" />
      </div>

      <div class="edit-helper">Expiry: Today / Tomorrow / Pick Date.</div>
    </div>
  `;
}


  return `
    <div class="edit-card" style="animation-delay:${animDelay}ms;">
      <div class="edit-name">${escapeHtml(it.name)}</div>

      <div class="edit-row">
        <div class="qty-stepper">
          <button class="qty-btn" type="button" data-dec="${escapeHtml(key)}">−</button>
          <input class="qty-inp" type="text" data-qty="${escapeHtml(key)}" value="${escapeHtml(d.qty || 0)}" readonly />
          <button class="qty-btn" type="button" data-inc="${escapeHtml(key)}">+</button>
        </div>

        ${expiryUI}
      </div>
    </div>
  `;
}

function bindItemControls(items, cat) {
  const wrap = $("#itemsWrap");
  if (!wrap) return;

  for (const it of items) {
    const key = itemKey(it);
    const d = ensureDraft(key);

    const inc = wrap.querySelector(`[data-inc="${CSS.escape(key)}"]`);
    const dec = wrap.querySelector(`[data-dec="${CSS.escape(key)}"]`);
    const qtyInp = wrap.querySelector(`[data-qty="${CSS.escape(key)}"]`);
    const sel = wrap.querySelector(`[data-expsel="${CSS.escape(key)}"]`);
    const dateInp = wrap.querySelector(`[data-expdate="${CSS.escape(key)}"]`);

    if (inc) inc.addEventListener("click", () => {
      d.qty = (Number(d.qty) || 0) + 1;
      if (qtyInp) qtyInp.value = String(d.qty);
    });

    if (dec) dec.addEventListener("click", () => {
      d.qty = Math.max(0, (Number(d.qty) || 0) - 1);
      if (qtyInp) qtyInp.value = String(d.qty);
    });

   if (sel) sel.addEventListener("change", () => {
  const v = String(sel.value || "");

  const pickWrap = wrap.querySelector(`[data-pickwrap="${CSS.escape(key)}"]`);
  const isPick = v === "PICK";
  if (pickWrap) pickWrap.classList.toggle("hidden", !isPick);

  if (isPick) {
    d.expType = "PICK";
    // keep expDateISO from date input
  } else if (v) {
    // v is an ISO date like 2026-01-13
    d.expType = "AUTO";
    d.expDateISO = v;
    if (dateInp) dateInp.value = "";
  } else {
    d.expType = "";
    d.expDateISO = "";
    if (dateInp) dateInp.value = "";
  }
});

    if (dateInp) dateInp.addEventListener("change", () => {
      d.expDateISO = String(dateInp.value || "");
      if (!d.expType) d.expType = "MANUAL";
    });

    if (isChickenBaconC(it.name)) {
      d.expType = "EOD";
      d.expDateISO = "";
    }

    if (FORCE_MANUAL_DATE_CATS.has(cat) && !isChickenBaconC(it.name)) {
      d.expType = "MANUAL";
    }
  }
}

async function saveCategoryDrafts(items, cat) {
  const store = state.session.store;
  const staff = state.session.staff;
  const shift = state.session.shift;

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const rows = [];

  for (const it of items) {
    const key = itemKey(it);
    const d = ensureDraft(key);

    const qty = Number(d.qty) || 0;
    if (qty <= 0) continue;

    let expiry = null;

    if (isChickenBaconC(it.name)) {
      expiry = today; // end of day today
    } else if (FORCE_MANUAL_DATE_CATS.has(cat)) {
      expiry = d.expDateISO || null;
    } else {
     if (d.expType === "AUTO") expiry = d.expDateISO || null;
else if (d.expType === "PICK") expiry = d.expDateISO || null;
// backward compatibility (if old drafts exist)
else if (d.expType === "TODAY") expiry = today;
else if (d.expType === "TOMORROW") expiry = tomorrow;
else expiry = null;

    }

    rows.push({
      item_id: it.id ?? null,
      item_name: it.name,
      category: it.category,
      sub_category: it.sub_category || null,
      quantity: qty,
      expiry: expiry, // YYYY-MM-DD
      expiry_at: null,
    });
  }

  if (!rows.length) return toast("Nothing to save");

  try {
    await apiPost("/api/log/batch", { store, staff, shift, rows });
    toast("Saved ✅");
  } catch (e) {
    console.error(e);
    toast("Save failed");
  }
}

/* =========================================================
   ALERTS
   ========================================================= */
function renderAlerts() {
  $("#main").innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Alerts</div>
    </div>

    <div class="card">
      <div class="h1">Coming soon</div>
      <div class="muted" style="font-weight:900;">We’ll put expiry alerts here.</div>
    </div>
  `;
  $("#btnBack")?.addEventListener("click", goBack);
}

/* =========================================================
   SUMMARY
   ========================================================= */
function renderSummaryHome() {
  const main = $("#main");
  const isMgr = !!state.session.isManager;

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Summary</div>
    </div>

    ${isMgr ? `
      <div class="card" style="margin-bottom:12px;">
        <div class="label" style="margin-bottom:8px;">Manager view</div>
        <div style="display:flex; gap:10px;">
          <button id="sumPDD" class="btn-yellow" style="flex:1; border-radius:14px;">PDD</button>
          <button id="sumSKH" class="btn-yellow" style="flex:1; border-radius:14px; opacity:.85;">SKH</button>
          <button id="sumBOTH" class="btn-yellow" style="flex:1; border-radius:14px; opacity:.85;">BOTH</button>
        </div>
        <div class="muted" style="font-weight:900; margin-top:8px;">
          Staff can only view their store. Manager can view both.
        </div>
      </div>
    ` : ""}

    <div id="sumCardsWrap" class="summary-row"></div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  let mode = isMgr ? (state.view.summaryMode || "PDD") : state.session.store;

  const setMode = async (m) => {
    mode = m;
    state.view.summaryMode = mode;

    if (isMgr) {
      $("#sumPDD").style.opacity = m === "PDD" ? "1" : ".75";
      $("#sumSKH").style.opacity = m === "SKH" ? "1" : ".75";
      $("#sumBOTH").style.opacity = m === "BOTH" ? "1" : ".75";
    }

    const wrap = $("#sumCardsWrap");
    wrap.innerHTML = `
      <button class="sum-card sum-red" type="button"><div class="sum-num">…</div><div class="sum-lbl">Expiring<br/>Today</div></button>
      <button class="sum-card sum-amber" type="button"><div class="sum-num">…</div><div class="sum-lbl">Expiring<br/>Tomorrow</div></button>
      <button class="sum-card sum-green" type="button"><div class="sum-num">…</div><div class="sum-lbl">All Safe</div></button>
    `;

    try {
      const today = todayISO();
      const tomorrow = addDaysISO(today, 1);

      let rows = [];
      if (mode === "BOTH") {
        const [a, b] = await Promise.all([fetchExpiryForStore("PDD"), fetchExpiryForStore("SKH")]);
        rows = []
          .concat((a || []).map((x) => ({ ...x, _store: "PDD" })))
          .concat((b || []).map((x) => ({ ...x, _store: "SKH" })));
      } else {
        const a = await fetchExpiryForStore(mode);
        rows = (a || []).map((x) => ({ ...x, _store: mode }));
      }

      const todayCount = rows.filter((x) => String(x.expiry_value || "").slice(0, 10) === today).length;
      const tomorrowCount = rows.filter((x) => String(x.expiry_value || "").slice(0, 10) === tomorrow).length;
      const safeCount = rows.filter((x) => {
        const e = String(x.expiry_value || "").slice(0, 10);
        return e && e !== today && e !== tomorrow;
      }).length;

      wrap.innerHTML = `
        <button class="sum-card sum-red" id="sumToday" type="button">
          <div class="sum-num">${todayCount}</div>
          <div class="sum-lbl">Expiring<br/>Today</div>
        </button>
        <button class="sum-card sum-amber" id="sumTomorrow" type="button">
          <div class="sum-num">${tomorrowCount}</div>
          <div class="sum-lbl">Expiring<br/>Tomorrow</div>
        </button>
        <button class="sum-card sum-green" id="sumSafe" type="button">
          <div class="sum-num">${safeCount}</div>
          <div class="sum-lbl">All Safe</div>
        </button>
      `;

      $("#sumToday")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "TODAY", summaryMode: mode }, true));
      $("#sumTomorrow")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "TOMORROW", summaryMode: mode }, true));
      $("#sumSafe")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "SAFE", summaryMode: mode }, true));
    } catch (e) {
      console.error(e);
      toast("Summary load failed");
    }
  };

  if (isMgr) {
    $("#sumPDD")?.addEventListener("click", () => setMode("PDD"));
    $("#sumSKH")?.addEventListener("click", () => setMode("SKH"));
    $("#sumBOTH")?.addEventListener("click", () => setMode("BOTH"));
  }

  setMode(mode);
}

function bucketTitle(bucket) {
  if (bucket === "TODAY") return "Expiring Today";
  if (bucket === "TOMORROW") return "Expiring Tomorrow";
  return "All Safe";
}

async function renderSummaryList() {
  const main = $("#main");
  const bucket = state.view.bucket || "TODAY";

  const isMgr = !!state.session.isManager;
  const mode = isMgr ? (state.view.summaryMode || "PDD") : state.session.store;

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">${bucketTitle(bucket)}</div>
    </div>

    <div class="card" id="sumInfo" style="margin-bottom:12px;">
      <div style="font-weight:1200;">Store: ${escapeHtml(mode)}</div>
      <div class="muted" style="font-weight:900;">Showing items for this card.</div>
    </div>

    <div id="sumListWrap"></div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  const wrap = $("#sumListWrap");
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  try {
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);

    let rows = [];
    if (mode === "BOTH") {
      const [a, b] = await Promise.all([fetchExpiryForStore("PDD"), fetchExpiryForStore("SKH")]);
      rows = []
        .concat((a || []).map((x) => ({ ...x, _store: "PDD" })))
        .concat((b || []).map((x) => ({ ...x, _store: "SKH" })));
    } else {
      const a = await fetchExpiryForStore(mode);
      rows = (a || []).map((x) => ({ ...x, _store: mode }));
    }

    rows = (rows || []).filter((x) => {
      const e = String(x.expiry_value || "").slice(0, 10);
      if (!e) return false;
      if (bucket === "TODAY") return e === today;
      if (bucket === "TOMORROW") return e === tomorrow;
      return e !== today && e !== tomorrow;
    });

    if (!rows.length) {
      wrap.innerHTML = `<div class="card">No items</div>`;
      return;
    }

    const byCat = new Map();
    for (const r of rows) {
      const c = String(r.category || "Other");
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(r);
    }

    let html = "";
    for (const [cat, list] of byCat.entries()) {
      html += `
        <div class="card" style="margin-bottom:12px;">
          <div class="h1" style="margin-bottom:10px;">${escapeHtml(cat)}</div>
          ${list
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
            .map((r) => {
              const qty = r.quantity != null ? r.quantity : "—";
              const date = formatDMY(String(r.expiry_value || "").slice(0, 10));
              const storeTag = mode === "BOTH" ? ` <span class="muted" style="font-weight:900;">(${r._store})</span>` : "";
              return `
                <div class="alert-row" style="border-top:1px dashed var(--line); padding:12px 0;">
                  <div>
                    <div class="alert-name" style="font-weight:1200;">${escapeHtml(r.name || "")}${storeTag}</div>
                    <div class="alert-extra">${escapeHtml(String(r.sub_category || ""))}</div>
                  </div>
                  <div style="text-align:right; font-weight:1200;">
                    <div>${escapeHtml(String(qty))}</div>
                    <div class="muted" style="font-weight:900;">${escapeHtml(date)}</div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    }

    wrap.innerHTML = html;
  } catch (e) {
    console.error(e);
    wrap.innerHTML = `<div class="card">Failed to load</div>`;
  }
}

/* =========================================================
   MANAGER
   ========================================================= */
function renderManagerHome() {
  if (!state.session.isManager) return openManagerLogin();

  $("#main").innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Manager Dashboard</div>
    </div>

    <div class="summary-row" style="margin-top:0;">
      <button class="sum-card sum-red" id="mgrSumToday" type="button">
        <div class="sum-num">›</div>
        <div class="sum-lbl">Expiring<br/>Today</div>
      </button>
      <button class="sum-card sum-amber" id="mgrSumTomorrow" type="button">
        <div class="sum-num">›</div>
        <div class="sum-lbl">Expiring<br/>Tomorrow</div>
      </button>
      <button class="sum-card sum-green" id="mgrSumSafe" type="button">
        <div class="sum-num">›</div>
        <div class="sum-lbl">All Safe</div>
      </button>
    </div>

    <div class="h1" style="margin:10px 0 10px;">Tools</div>

    <div class="tiles-2col">
      <button class="tile t-blue" id="toolAdd" type="button">
        <div class="ico"><div style="font-size:48px; line-height:1;">➕</div></div>
        <div class="title" style="font-size:20px;">Add Item</div>
        <div class="sub">Create a new item</div>
      </button>

      <button class="tile t-teal" id="toolEdit" type="button">
        <div class="ico"><div style="font-size:48px; line-height:1;">📝</div></div>
        <div class="title" style="font-size:20px;">Edit Items</div>
        <div class="sub">By category (compact)</div>
      </button>

      <button class="tile t-purple" id="toolCats" type="button">
        <div class="ico"><div style="font-size:48px; line-height:1;">🗂️</div></div>
        <div class="title" style="font-size:20px;">Categories</div>
        <div class="sub">Add / Edit / Delete</div>
      </button>

      <button class="tile t-orange" id="toolDL" type="button">
        <div class="ico"><div style="font-size:48px; line-height:1;">⬇️</div></div>
        <div class="title" style="font-size:20px;">Download Log</div>
        <div class="sub">Export logs</div>
      </button>
    </div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  $("#mgrSumToday")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "TODAY", summaryMode: "BOTH" }, true));
  $("#mgrSumTomorrow")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "TOMORROW", summaryMode: "BOTH" }, true));
  $("#mgrSumSafe")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "SAFE", summaryMode: "BOTH" }, true));

  $("#toolAdd")?.addEventListener("click", () => openAddItemModal());
  $("#toolEdit")?.addEventListener("click", () => setView({ page: "managerEditItems" }, true));
  $("#toolCats")?.addEventListener("click", () => setView({ page: "managerCategories" }, true));
  $("#toolDL")?.addEventListener("click", () => downloadLogForStore(state.session.store));
}

function openManagerLogin() {
  openModal(
    "Manager Login",
    `
      <div class="card">
        <div class="field">
          <span class="label">PIN</span>
          <input id="pinInp" class="input" type="password" inputmode="numeric" placeholder="Enter PIN" />
        </div>
        <div class="field">
          <button id="pinBtn" class="btn-yellow">Login</button>
        </div>
        <div class="field">
          <button id="pinCancel" class="btn-yellow" style="opacity:.85;">Cancel</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#pinCancel")?.addEventListener("click", () => { closeModal(); goBack(); });

  $("#pinBtn")?.addEventListener("click", async () => {
    const pin = String($("#pinInp")?.value || "").trim();
    if (!pin) return toast("Enter PIN");

    try {
      const r = await apiPost("/api/manager/login", { pin, store: state.session.store });
      state.session.isManager = true;
      state.session.managerToken = r.token || "";
      saveJSON("session", state.session);
      closeModal();
      toast("Manager ✅");
      render();
    } catch (e) {
      console.error(e);
      toast("Wrong PIN");
    }
  });
}

/* ---------- Download Log (tries common endpoints) ---------- */
async function downloadLogForStore(store) {
  const candidates = [
    `/api/log/export?store=${encodeURIComponent(store)}`,
    `/api/log/download?store=${encodeURIComponent(store)}`,
    `/api/log/csv?store=${encodeURIComponent(store)}`,
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const blob = await r.blob();

      const a = document.createElement("a");
      const stamp = todayISO();
      a.href = URL.createObjectURL(blob);
      a.download = `PreCheck_Log_${store}_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);

      toast("Download started ✅");
      return;
    } catch {
      // try next
    }
  }

  toast("Download endpoint not ready yet");
}

/* =========================================================
   MANAGER: Edit Items / Categories / Add Item
   ========================================================= */
async function renderManagerEditItems() {
  if (!state.session.isManager) return openManagerLogin();

  const token = state.session.managerToken;
  $("#main").innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Edit Items</div>
    </div>

    <div class="card">
      <span class="label">Search</span>
      <input id="mgrSearch" class="input" placeholder="Type item name..." />
    </div>

    <div id="mgrList" class="edit-list"></div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  let items = [];
  try {
    items = await apiGet(`/api/manager/items?store=${encodeURIComponent(state.session.store)}`, token);
  } catch (e) {
    console.error(e);
    toast("Manager items endpoint missing");
    $("#mgrList").innerHTML = `<div class="card">Endpoint not ready: /api/manager/items</div>`;
    return;
  }

  const renderList = (q) => {
    q = normText(q);
    const filtered = q ? items.filter((x) => normText(x.name).includes(q)) : items;

    const map = new Map();
    for (const it of filtered) {
      const c = String(it.category || "Other");
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(it);
    }

    let html = "";
    for (const [cat, list] of map.entries()) {
      html += `
        <div class="card">
          <div class="h1" style="margin-bottom:10px;">${escapeHtml(cat)}</div>
          ${list
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
            .map((it) => mgrRow(it))
            .join("")}
        </div>
      `;
    }

    $("#mgrList").innerHTML = html;

    $$(".mgrEditBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const panel = $(`#panel_${CSS.escape(id)}`);
        if (!panel) return;
        panel.classList.toggle("hidden");
        btn.textContent = panel.classList.contains("hidden") ? "Edit" : "Close";
      });
    });

    $$(".mgrSaveBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const catSel = $(`#cat_${CSS.escape(id)}`);
        const subSel = $(`#sub_${CSS.escape(id)}`);
        const lifeInp = $(`#life_${CSS.escape(id)}`);

        const category = String(catSel?.value || "").trim();
        const sub_category = String(subSel?.value || "").trim() || null;
        const shelf_life_days = Number(lifeInp?.value || 0);

        try {
          await apiPatch(`/api/manager/items/${id}`, { store: state.session.store, category, sub_category, shelf_life_days }, token);
          toast("Saved ✅");
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Save failed");
        }
      });
    });

    $$(".mgrDelBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (!confirm("Delete this item?")) return;

        try {
          await apiDel(`/api/manager/items/${id}?store=${encodeURIComponent(state.session.store)}`, token);
          toast("Deleted ✅");
          items = items.filter((x) => String(x.id) !== String(id));
          renderList($("#mgrSearch")?.value || "");
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Delete failed");
        }
      });
    });
  };

  $("#mgrSearch")?.addEventListener("input", (e) => renderList(e.target.value));
  renderList("");
}

function mgrRow(it) {
  const id = String(it.id);

  const cats = (state.data.categories || []).map((c) => String(c.name));
  const catOpts = cats.map((c) => `<option value="${escapeHtml(c)}"${c === it.category ? " selected" : ""}>${escapeHtml(c)}</option>`).join("");

  const subOpts = [`<option value="">(none)</option>`]
    .concat(SAUCE_SUBS.map((s) => {
      const sel = normText(it.sub_category) === normText(s.name) ? " selected" : "";
      return `<option value="${escapeHtml(s.name)}"${sel}>${escapeHtml(s.name)}</option>`;
    }))
    .join("");

  return `
    <div class="edit-card" style="margin-top:12px;">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
        <div style="font-weight:1200;">${escapeHtml(it.name || "")}</div>
        <button class="btn-ghost mgrEditBtn" type="button" data-id="${escapeHtml(id)}" style="padding:10px 12px;">Edit</button>
      </div>

      <div class="muted" style="font-weight:900; margin-top:6px;">
        ${escapeHtml(it.category || "")} • ${escapeHtml(String(it.shelf_life_days ?? 0))} day
      </div>

      <div id="panel_${escapeHtml(id)}" class="hidden" style="margin-top:12px;">
        <div class="field">
          <span class="label">Category</span>
          <select id="cat_${escapeHtml(id)}" class="input">${catOpts}</select>
        </div>

        <div class="field">
          <span class="label">Sauce Sub-category (only if Sauce)</span>
          <select id="sub_${escapeHtml(id)}" class="input">${subOpts}</select>
        </div>

        <div class="field">
          <span class="label">Shelf life (days)</span>
          <input id="life_${escapeHtml(id)}" class="input" type="number" min="0" value="${escapeHtml(String(it.shelf_life_days ?? 0))}" />
        </div>

        <div style="display:flex; gap:10px; margin-top:12px;">
          <button class="btn-yellow mgrSaveBtn" type="button" data-id="${escapeHtml(id)}" style="flex:1;">Save</button>
          <button class="btn-yellow mgrDelBtn" type="button" data-id="${escapeHtml(id)}" style="flex:1; background:#E53935; color:#fff;">Delete</button>
        </div>
      </div>
    </div>
  `;
}

async function renderManagerCategories() {
  if (!state.session.isManager) return openManagerLogin();

  const token = state.session.managerToken;

  let cats = [];
  try {
    cats = await apiGet(`/api/manager/categories?store=${encodeURIComponent(state.session.store)}`, token);
  } catch (e) {
    console.error(e);
    toast("Categories endpoint missing");
    $("#main").innerHTML = `<div class="card">Endpoint not ready: /api/manager/categories</div>`;
    return;
  }

  const tiles = (cats || [])
    .filter((c) => c.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    .map((c, idx) => {
      const tone = tileToneForCategory(String(c.name || ""));
      const delay = idx * 55;
      return `
        <button class="tile ${tone}" type="button" data-cid="${escapeHtml(String(c.id))}" data-cname="${escapeHtml(String(c.name || ""))}" style="min-height:100px; animation-delay:${delay}ms;">
          <div class="title" style="font-size:20px;">${escapeHtml(String(c.name || ""))}</div>
          <div class="sub">Tap to edit</div>
        </button>
      `;
    })
    .join("");

  $("#main").innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Categories</div>
    </div>

    <div class="tiles-2col">${tiles}</div>

    <div style="margin-top:14px;">
      <button id="addCat" class="btn-yellow" style="background:#1E88E5; color:#fff;">➕ Add Category</button>
    </div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  $$(".tile", $("#main")).forEach((btn) => {
    btn.addEventListener("click", () => {
      openEditCategoryModal(btn.dataset.cid, btn.dataset.cname);
    });
  });

  $("#addCat")?.addEventListener("click", () => openAddCategoryModal());
}

function openAddCategoryModal() {
  openModal(
    "Add Category",
    `
      <div class="card">
        <div class="field">
          <span class="label">Name</span>
          <input id="catName" class="input" placeholder="Category name" />
        </div>
        <div class="field">
          <span class="label">Sort order</span>
          <input id="catSort" class="input" type="number" value="100" />
        </div>
        <div class="field">
          <button id="catSave" class="btn-yellow">Save</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#catSave")?.addEventListener("click", async () => {
    const name = String($("#catName")?.value || "").trim();
    const sort_order = Number($("#catSort")?.value || 100);
    if (!name) return toast("Name required");

    try {
      await apiPost("/api/manager/categories", { store: state.session.store, name, sort_order }, state.session.managerToken);
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });
}

function openEditCategoryModal(id, currentName) {
  openModal(
    "Edit Category",
    `
      <div class="card">
        <div class="field">
          <span class="label">Name</span>
          <input id="catName" class="input" value="${escapeHtml(currentName)}" />
        </div>
        <div class="field">
          <span class="label">Active</span>
          <select id="catActive" class="input">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <div class="field">
          <button id="catSave" class="btn-yellow">Save</button>
        </div>
        <div class="field">
          <button id="catDelete" class="btn-yellow" style="background:#E53935; color:#fff;">Delete</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#catSave")?.addEventListener("click", async () => {
    const name = String($("#catName")?.value || "").trim();
    const is_active = ($("#catActive")?.value || "true") === "true";
    if (!name) return toast("Name required");

    try {
      await apiPatch(`/api/manager/categories/${id}`, { store: state.session.store, name, is_active }, state.session.managerToken);
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });

  $("#catDelete")?.addEventListener("click", async () => {
    if (!confirm("Delete this category?")) return;
    try {
      await apiDel(`/api/manager/categories/${id}?store=${encodeURIComponent(state.session.store)}`, state.session.managerToken);
      toast("Deleted ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Delete failed");
    }
  });
}

function openAddItemModal() {
  const cats = (state.data.categories || []).map((c) => String(c.name));
  const catOpts = cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  const subOpts = [`<option value="">(none)</option>`]
    .concat(SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`))
    .join("");

  openModal(
    "Add Item",
    `
      <div class="card">
        <div class="field">
          <span class="label">Item name</span>
          <input id="itName" class="input" placeholder="e.g. Beef Brisket Packet" />
        </div>

        <div class="field">
          <span class="label">Category</span>
          <select id="itCat" class="input">${catOpts}</select>
        </div>

        <div class="field">
          <span class="label">Sauce Sub-category (only if Sauce)</span>
          <select id="itSub" class="input">${subOpts}</select>
        </div>

        <div class="field">
          <span class="label">Shelf life (days)</span>
          <input id="itLife" class="input" type="number" min="0" value="0" />
        </div>

        <div class="field">
          <button id="itSave" class="btn-yellow">Save</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#itSave")?.addEventListener("click", async () => {
    const name = String($("#itName")?.value || "").trim();
    const category = String($("#itCat")?.value || "").trim();
    const sub_category = String($("#itSub")?.value || "").trim() || null;
    const shelf_life_days = Number($("#itLife")?.value || 0);

    if (!name || !category) return toast("Missing name/category");

    try {
      await apiPost("/api/manager/items", { store: state.session.store, name, category, sub_category, shelf_life_days }, state.session.managerToken);
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });
}

/* =========================================================
   WISR
   ========================================================= */
function wisrKey(store) { return `wisr_${store}`; }

function renderWISR() {
  const store = state.session.store;
  const saved = loadJSON(wisrKey(store), {});

  $("#main").innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">WISR Count</div>
    </div>

    <div class="card">
      <div class="h1">Blank for now</div>
      <div class="muted" style="font-weight:900;">Store: ${escapeHtml(store)} (saved per store)</div>
      <div class="muted" style="font-weight:900; margin-top:8px;">You will give the data later.</div>
    </div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  void saved;
}

/* =========================================================
   LOGOUT
   ========================================================= */
function doLogout() {
  state.session.store = "";
  state.session.staff = "";
  state.session.shift = "AM";
  state.session.isManager = false;
  state.session.managerToken = "";
  state.session.sessionDayKey = dayKeyNow();
  saveJSON("session", state.session);

  state.data.categories = [];
  state.data.items = [];
  state.drafts = {};
  state.navStack = [];
  state.view = { page: "home", category: null, sauceSub: null, bucket: null, summaryMode: null };

  renderShell();
  openSessionSetup();
}

/* =========================================================
   FINAL: Prevent blank screen if something throws later
   ========================================================= */
window.addEventListener("error", (e) => {
  console.error("Window error:", e.error || e.message);
  toast("Error — open console");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled:", e.reason);
  toast("Error — open console");
});
