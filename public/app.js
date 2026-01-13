/* =========================
   PreCheck — public/app.js (FULL)
   MERGED FIXES (only what you requested):
   ✅ Popup ALWAYS after login (forced)
   ✅ Role pill solid colors (Manager red + white text, Staff yellow + black text)
   ✅ Save button smaller but still bottom + long + oval
   ✅ Prevent swipe/back from closing app (back = goBack, home = confirm exit)
   ✅ Login is a PAGE (not modal) + forces Home render right after login
   ✅ Shelf-life rules:
      - Unopened chiller + Fountain Drinks => manual date only
      - shelf_life_days > 7 => manual date only
      - shelf_life_days <= 7 => preset dropdown dates (Today..N-1) in "24 January 2026" format
      - Chicken Bacon (c) => auto today (EOD)
   Matches your index.html IDs:
   - #btnMenu, #drawerBackdrop, #btnDrawerClose
   - #drawerHome, #drawerAlerts, #drawerManager, #drawerSummary, #drawerWISR, #drawerLogout
   - #main, #sessionLine, #roleHost
   - modal: #modalBackdrop #modalClose #modalTitle #modalBody
   - toast: #toast
   ========================= */

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- constants ---------- */
const POPUP_ITEMS = [
  "Mix green",
  "Mac&cheese",
  "Lettuce",
  "Chicken Bacon (c)",
  "Liquid Egg",
  "Flatbread(Thawing)",
  "Avocado",
];

// RULES you requested:
// - Unopened chiller => manual date always
// - > 7 days => manual date
// - <= 7 days => preset dropdown dates (includes Today), format "24 January 2026"
const FORCE_MANUAL_DATE_CATS = new Set(["Unopened chiller", "Fountain Drinks"]); // manual date only

const CAT_EMOJI = {
  "Prepared items": "🥪",
  "Unopened chiller": "🧊",
  "Thawing": "💧",
  "Vegetables": "🥕",
  "Backroom": "📦",
  "Front counter": "🥪",
  "Back counter chiller": "❄️",
  "Fountain Drinks": "🥤",
  "Sauce": "🧴",
};

const SAUCE_SUBS = [
  { name: "Standby", emoji: "🧃", tone: "teal" },
  { name: "Open Inner", emoji: "🧴", tone: "purple" },
  { name: "Sandwich Unit", emoji: "🌶️", tone: "orange" },
];

/* ---------- state ---------- */
const state = {
  view: { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null },
  navStack: [],
  session: loadJSON("session", {
    store: "",
    staff: "",
    shift: "AM",
    isManager: false,
    managerToken: "",
    sessionDayKey: "",
  }),
  data: { categories: [], items: [] },
  drafts: {}, // per item key: { qty, expType, expDateISO }
};

/* ---------- boot ---------- */
bindTopbar();
bindDrawer();
bindModal();
bindAppBackGuard(); // prevent swipe/back from closing app
startMidnightWatcher();
boot().catch(console.error);

async function boot() {
  ensureSessionDayKey();

  // Login page when session missing
  if (!state.session.store || !state.session.staff) {
    state.view = { page: "login", category: null, sauceSub: null, summaryMode: null, bucket: null };
    render();
    return;
  }

  await loadAllForCurrentStore();
  // show popup on app open if already logged in (once per day unless forced elsewhere)
  maybeShowExpiryPopup(false);
  render();
}

/* =========================================================
   STORAGE
   ========================================================= */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}
function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}

/* =========================================================
   DATE HELPERS
   ========================================================= */
function pad2(n) { return String(n).padStart(2, "0"); }
function dayKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function ensureSessionDayKey() {
  const k = dayKeyNow();
  if (!state.session.sessionDayKey) {
    state.session.sessionDayKey = k;
    saveSession();
  }
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDaysISO(baseISO, n) {
  const dt = new Date(baseISO + "T00:00:00");
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function formatLongDMY(iso) {
  // "24 January 2026"
  const dt = new Date(String(iso).slice(0,10) + "T00:00:00");
  const day = dt.getDate();
  const mon = dt.toLocaleString("en-GB", { month: "long" });
  const year = dt.getFullYear();
  return `${day} ${mon} ${year}`;
}
function isChickenBaconC(name) {
  const t = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  return t === "chicken bacon (c)" || t === "chicken bacon(c)" || t === "chicken bacon c";
}

/* =========================================================
   API
   ========================================================= */
async function apiGet(path, token = "") {
  const r = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}
async function apiPost(path, body, token = "") {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}
async function apiPatch(path, body, token = "") {
  const r = await fetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
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
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}

async function loadAllForCurrentStore() {
  const store = state.session.store;
  state.data.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
  state.data.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);

  // normalize sauce sub_category so Standby/Open Inner/Sandwich Unit won't go empty
  state.data.items = state.data.items.map((it) => ({
    ...it,
    sub_category: it.sub_category ? normalizeSub(it.sub_category) : null,
  }));
}
function normalizeSub(s) {
  const t = String(s || "").trim().toLowerCase();
  if (t === "open inner" || t === "openinner") return "Open Inner";
  if (t === "standby") return "Standby";
  if (t === "sandwich unit" || t === "sandwichunit") return "Sandwich Unit";
  return String(s || "").trim();
}

/* =========================================================
   TOPBAR
   ========================================================= */
function bindTopbar() {
  renderRolePill();
}
function renderRolePill() {
  const host = $("#roleHost");
  if (!host) return;

  host.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `role-btn ${state.session.isManager ? "manager" : "staff"}`;

  // force solid color via inline style
  if (state.session.isManager) {
    btn.style.background = "var(--red)";
    btn.style.color = "#fff";
  } else {
    btn.style.background = "var(--yellow)";
    btn.style.color = "#111";
  }

  btn.innerHTML = `
    <span class="role-ico">${state.session.isManager ? "👑" : "👤"}</span>
    <span style="font-weight:1200">${state.session.isManager ? "Manager" : "Staff"}</span>
  `;

  btn.addEventListener("click", () => toast(state.session.isManager ? "Manager mode" : "Staff mode"));
  host.appendChild(btn);
}

function updateSessionLine() {
  const el = $("#sessionLine");
  if (!el) return;
  const s = state.session;
  const show = !!(s.store && s.staff);
  el.classList.toggle("hidden", !show);
  el.textContent = show ? `${s.store} • ${s.shift} • ${s.staff}` : "";
}

/* =========================================================
   DRAWER
   ========================================================= */
function bindDrawer() {
  const btnMenu = $("#btnMenu");
  const backdrop = $("#drawerBackdrop");
  const btnClose = $("#btnDrawerClose");

  if (btnMenu) btnMenu.addEventListener("click", (e) => { e.preventDefault(); openDrawer(); });

  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDrawer();
    });
  }

  if (btnClose) btnClose.addEventListener("click", (e) => { e.preventDefault(); closeDrawer(); });

  const bind = (id, fn) => {
    const b = $(id);
    if (b) b.addEventListener("click", () => { closeDrawer(); fn(); });
  };

  bind("#drawerHome", () => goHome());
  bind("#drawerAlerts", () => setView({ page: "alerts" }, true));
  bind("#drawerManager", () => setView({ page: "manager" }, true));
  bind("#drawerSummary", () => setView({ page: "summaryHome" }, true));
  bind("#drawerWISR", () => setView({ page: "wisr" }, true));
  bind("#drawerLogout", () => doLogout());
}
function openDrawer() { const b = $("#drawerBackdrop"); if (b) b.classList.remove("hidden"); }
function closeDrawer() { const b = $("#drawerBackdrop"); if (b) b.classList.add("hidden"); }

/* =========================================================
   MODAL + TOAST
   ========================================================= */
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function bindModal() {
  const closeBtn = $("#modalClose");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  const backdrop = $("#modalBackdrop");
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
  }
}
function openModal(title, html, opts = {}) {
  const t = $("#modalTitle");
  const b = $("#modalBody");
  const back = $("#modalBackdrop");
  if (!t || !b || !back) return;

  t.textContent = title || "Modal";
  b.innerHTML = html || "";
  back.classList.remove("hidden");

  if (opts.noBackdropClose) {
    back.onclick = (e) => {
      if (e.target === back) e.stopPropagation();
    };
  } else {
    back.onclick = null;
  }
}
function closeModal() {
  const back = $("#modalBackdrop");
  const b = $("#modalBody");
  if (back) back.classList.add("hidden");
  if (b) b.innerHTML = "";
}

/* =========================================================
   SESSION POPUP + MIDNIGHT RESET
   ========================================================= */
function startMidnightWatcher() {
  setInterval(() => {
    const nowKey = dayKeyNow();
    if (state.session.sessionDayKey && state.session.sessionDayKey !== nowKey) {
      state.session.sessionDayKey = nowKey;
      saveSession();
      maybeShowExpiryPopup(true);
      render();
    }
  }, 30000);
}

function maybeShowExpiryPopup(force) {
  const k = dayKeyNow();
  const seenKey = `expiry_popup_seen_${k}`;
  if (!force && localStorage.getItem(seenKey) === "1") return;
  localStorage.setItem(seenKey, "1");

  const list = POPUP_ITEMS.map((x) => `
    <li><span class="popup-dot"></span>${escapeHtml(x)}</li>
  `).join("");

  openModal(
    "PLEASE check the expiry date",
    `
      <div class="popup-title">PLEASE check the expiry date of the items below:</div>
      <div class="popup-lead muted">Make sure expiry is correct before saving.</div>
      <ul class="popup-list">${list}</ul>
      <button id="popupOk" class="btn btn-yellow" style="width:100%; margin-top:8px">OK</button>
    `,
    { noBackdropClose: true }
  );

  const ok = $("#popupOk");
  if (ok) ok.addEventListener("click", closeModal);
}

/* =========================================================
   LOGIN PAGE (replaces old session modal)
   ========================================================= */
function renderLoginPage() {
  const main = $("#main");
  const s = state.session;

  const storePick = s.store || "PDD";

  main.innerHTML = `
    <div class="card" style="max-width:560px;margin:14px auto">
      <div style="font-weight:1200;font-size:20px;margin-bottom:10px">Start Session</div>

      <div style="font-weight:1200">Select Store</div>
      <div class="row" style="gap:12px;margin-top:10px">
        <button id="pickPDD" class="btn" style="flex:1;background:var(--pdd);color:#fff">PDD</button>
        <button id="pickSKH" class="btn" style="flex:1;background:var(--skh);color:#fff">SKH</button>
      </div>

      <div style="margin-top:14px;font-weight:1200">Shift</div>
      <select id="shiftSel" class="select">
        <option value="AM"${(s.shift||"AM")==="AM"?" selected":""}>AM</option>
        <option value="PM"${(s.shift||"AM")==="PM"?" selected":""}>PM</option>
      </select>

      <div style="margin-top:14px;font-weight:1200">Staff Name / ID</div>
      <input id="staffInp" class="input" placeholder="e.g. Suri" value="${escapeHtml(s.staff || "")}" />

      <button id="startBtn" class="btn btn-yellow" style="width:100%;margin-top:14px;padding:16px 16px;font-size:18px;font-weight:1200">Start</button>

      <div class="muted" style="font-size:12px;margin-top:10px;font-weight:900">
        Session auto resets after midnight.
      </div>
    </div>
  `;

  let pick = storePick;
  const setPick = (v) => {
    pick = v;
    const a = $("#pickPDD");
    const b = $("#pickSKH");
    if (a) a.style.opacity = v === "PDD" ? "1" : ".65";
    if (b) b.style.opacity = v === "SKH" ? "1" : ".65";
  };
  setPick(pick);

  $("#pickPDD").addEventListener("click", () => setPick("PDD"));
  $("#pickSKH").addEventListener("click", () => setPick("SKH"));

  $("#startBtn").addEventListener("click", async () => {
    const staff = String($("#staffInp").value || "").trim();
    const shift = String($("#shiftSel").value || "AM");
    if (!staff) return toast("Please enter staff name/ID");

    state.session.store = pick;
    state.session.shift = shift;
    state.session.staff = staff;
    state.session.isManager = false;
    state.session.managerToken = "";
    state.session.sessionDayKey = dayKeyNow();
    saveSession();

    try {
      await loadAllForCurrentStore();
      renderRolePill();
      updateSessionLine();

      // force HOME right after login
      state.navStack = [];
      state.view = { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
      render();

      // ✅ FORCE popup after login (always)
      setTimeout(() => maybeShowExpiryPopup(true), 150);
    } catch (e) {
      console.error(e);
      toast("Failed to load data");
    }
  });
}

/* =========================================================
   NAVIGATION
   ========================================================= */
function setView(next, push) {
  if (push) {
    state.navStack.push({ ...state.view });
    safePushHistory();
  }
  state.view = { ...state.view, ...next };
  render();
}
function goBack() {
  const prev = state.navStack.pop();
  state.view = prev ? prev : { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
  render();
}
function goHome() {
  state.navStack = [];
  state.view = { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
  render();
}

/* =========================================================
   BACK / SWIPE GUARD (prevents accidental close)
   ========================================================= */
let backGuardArmed = false;
function bindAppBackGuard() {
  try {
    history.replaceState({ pc: 1 }, "");
    history.pushState({ pc: 1 }, "");
    backGuardArmed = true;
  } catch {}

  window.addEventListener("popstate", () => {
    if (!backGuardArmed) return;

    // If modal is open, close modal first
    const modalOpen = !$("#modalBackdrop")?.classList.contains("hidden");
    if (modalOpen) {
      closeModal();
      safePushHistory();
      return;
    }

    // If not logged in, don't exit
    if (!state.session.store || !state.session.staff) {
      safePushHistory();
      return;
    }

    // If inside pages, go back
    if (state.navStack.length > 0) {
      goBack();
      safePushHistory();
      return;
    }

    // Home: confirm exit
    openConfirmExit();
    safePushHistory();
  });
}

function safePushHistory() {
  try { history.pushState({ pc: 1 }, ""); } catch {}
}

function openConfirmExit() {
  openModal(
    "Exit PreCheck?",
    `
      <div class="card">
        <div style="font-weight:1200;margin-bottom:10px">Do you want to exit?</div>
        <div class="muted" style="font-weight:900;margin-bottom:14px">This prevents accidental closing.</div>
        <div class="row" style="gap:12px">
          <button id="exitNo" class="btn btn-yellow" style="flex:1">No</button>
          <button id="exitYes" class="btn btn-red" style="flex:1">Yes</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#exitNo").addEventListener("click", closeModal);
  $("#exitYes").addEventListener("click", () => {
    closeModal();
    try { backGuardArmed = false; history.back(); } catch {}
  });
}

/* =========================================================
   RENDER ROOT
   ========================================================= */
function render() {
  updateSessionLine();
  renderRolePill();

  const main = $("#main");
  if (!main) return;

  // Login page
  if (!state.session.store || !state.session.staff) {
    renderLoginPage();
    return;
  }

  switch (state.view.page) {
    case "login": return renderLoginPage();
    case "home": return renderHome();
    case "category": return renderCategory();
    case "alerts": return renderAlerts();
    case "summaryHome": return renderSummaryHome();
    case "summaryList": return renderSummaryList();
    case "wisr": return renderWISR();
    case "manager": return renderManagerHome();
    case "managerEditItems": return renderManagerEditItems();
    case "managerCategories": return renderManagerCategories();
    default:
      main.innerHTML = `<div class="card">Unknown page</div>`;
  }
}

/* =========================================================
   HOME
   ========================================================= */
function renderHome() {
  const main = $("#main");

  const cats = state.data.categories.map((c) => c.name);
  const counts = {};
  for (const it of state.data.items) {
    counts[it.category] = (counts[it.category] || 0) + 1;
  }

  const tiles = cats.map((name, idx) => {
    const emoji = CAT_EMOJI[name] || "✅";
    const tone = tileToneFor(name);
    return `
      <button class="tile ${tone}" style="animation-delay:${idx * 45}ms" data-cat="${escapeHtml(name)}" type="button">
        <div class="emoji">${emoji}</div>
        <div class="title">${escapeHtml(name)}</div>
        <div class="sub">${counts[name] || 0} items</div>
      </button>
    `;
  }).join("");

  main.innerHTML = `
    <div class="col">
      <div class="tiles-2col">${tiles}</div>
    </div>
  `;

  $$(".tile", main).forEach((b) => {
    b.addEventListener("click", () => {
      const cat = b.dataset.cat;
      setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });
}

function tileToneFor(name) {
  const map = {
    "Prepared items": "t-green",
    "Unopened chiller": "t-blue",
    "Thawing": "t-cyan",
    "Vegetables": "t-green2",
    "Backroom": "t-orange",
    "Front counter": "t-red",
    "Back counter chiller": "t-teal",
    "Fountain Drinks": "t-green2",
    "Sauce": "t-purple",
  };
  return map[name] || "t-pink";
}

/* =========================================================
   CATEGORY
   ========================================================= */
function renderCategory() {
  const main = $("#main");
  const cat = state.view.category;

  // Sauce -> sub tiles first
  if (cat === "Sauce" && !state.view.sauceSub) {
    const tiles = SAUCE_SUBS.map((s, idx) => {
      const tone = s.tone === "teal" ? "t-teal" : s.tone === "purple" ? "t-purple" : "t-orange";
      return `
        <button class="tile ${tone}" style="min-height:120px;animation-delay:${idx * 60}ms" data-sub="${escapeHtml(s.name)}" type="button">
          <div class="emoji" style="font-size:56px">${s.emoji}</div>
          <div class="title" style="font-size:20px">${escapeHtml(s.name)}</div>
          <div class="sub">Tap to open</div>
        </button>
      `;
    }).join("");

    main.innerHTML = `
      <div class="page-head">
        <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
        <div class="page-title">Sauce</div>
      </div>
      <div class="tiles-2col">${tiles}</div>
    `;
    $("#btnBack").addEventListener("click", goBack);
    $$(".tile", main).forEach((b) => {
      b.addEventListener("click", () => setView({ sauceSub: b.dataset.sub }, true));
    });
    return;
  }

  const sauceSub = state.view.sauceSub;
  const title = cat === "Sauce" && sauceSub ? `Sauce — ${sauceSub}` : cat;

  let items = state.data.items.filter((x) => x.category === cat);
  if (cat === "Sauce" && sauceSub) {
    items = items.filter((x) => normalizeSub(x.sub_category || "") === normalizeSub(sauceSub));
  }

  const list = items.map((it) => renderItemEditor(it, cat)).join("");
  const emptyHint = items.length ? "" : `
    <div class="card" style="border-left:6px solid var(--yellow)">
      <div style="font-weight:1200">No items found</div>
      <div class="muted" style="margin-top:6px">
        This means your Sauce sub-category names in DB don’t match exactly.
      </div>
    </div>
  `;

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    ${emptyHint}

    <div class="edit-list" id="editList">${list}</div>

    <div class="save-bar">
      <button
        id="saveBtn"
        class="btn-yellow"
        type="button"
        style="width:min(92%,520px); margin:0 auto; padding:14px 18px; border-radius:999px; font-weight:1200; font-size:16px;"
      >Save</button>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);
  bindItemEditors(items, cat);

  $("#saveBtn").addEventListener("click", async () => {
    await saveCategory(items, cat);
  });
}

function itemKey(it) {
  return it.id != null ? `id:${it.id}` : `name:${it.name}|${it.category}|${it.sub_category || ""}`;
}

function shelfLifeModeFor(it, cat) {
  const life = Number(it.shelf_life_days || 0);

  if (isChickenBaconC(it.name)) return { mode: "EOD_AUTO", life };
  if (FORCE_MANUAL_DATE_CATS.has(cat)) return { mode: "MANUAL", life };
  if (!Number.isFinite(life) || life <= 0) return { mode: "MANUAL", life };
  if (life > 7) return { mode: "MANUAL", life };

  return { mode: "PRESET", life };
}

function renderItemEditor(it, cat) {
  const key = itemKey(it);
  if (!state.drafts[key]) state.drafts[key] = { qty: 0, expType: "", expDateISO: "" };
  const d = state.drafts[key];

  const rule = shelfLifeModeFor(it, cat);
  let expiryUI = "";

  if (rule.mode === "EOD_AUTO") {
    expiryUI = `<div class="muted" style="font-weight:900">Expiry: End of day (auto)</div>`;
  } else if (rule.mode === "MANUAL") {
    expiryUI = `
      <label class="label">Expiry date</label>
      <input class="select" type="date" data-expdate="${escapeHtml(key)}" value="${escapeHtml(d.expDateISO || "")}">
      <div class="edit-helper">Manual date</div>
    `;
  } else {
    const today = todayISO();
    const n = Math.max(1, Math.min(7, Number(rule.life) || 1)); // 1..7
    const opts = Array.from({ length: n }, (_, i) => {
      const iso = addDaysISO(today, i);
      return `<option value="${escapeHtml(iso)}"${d.expDateISO===iso?" selected":""}>${escapeHtml(formatLongDMY(iso))}</option>`;
    }).join("");

    expiryUI = `
      <label class="label">Expiry</label>
      <select class="select" data-exppreset="${escapeHtml(key)}">
        <option value="">Select</option>
        ${opts}
        <option value="MANUAL"${d.expType==="MANUAL"?" selected":""}>Manual (pick date)</option>
      </select>
      <div data-pickwrap="${escapeHtml(key)}" class="${d.expType==="MANUAL" ? "" : "hidden"}">
        <input class="select" type="date" data-expdate="${escapeHtml(key)}" value="${escapeHtml(d.expDateISO || "")}">
      </div>
      <div class="edit-helper">Preset dates (from shelf life)</div>
    `;
  }

  return `
    <div class="edit-card" data-key="${escapeHtml(key)}">
      <div class="edit-name">${escapeHtml(it.name)}</div>

      <div class="edit-row">
        <div class="qty-stepper">
          <button class="qty-btn" type="button" data-dec="${escapeHtml(key)}">−</button>
          <input class="qty-inp" data-qty="${escapeHtml(key)}" inputmode="numeric" value="${escapeHtml(d.qty || 0)}" />
          <button class="qty-btn" type="button" data-inc="${escapeHtml(key)}">+</button>
        </div>

        <div class="exp-wrap">
          ${expiryUI}
        </div>
      </div>
    </div>
  `;
}

function bindItemEditors(items, cat) {
  const root = $("#editList");
  if (!root) return;

  for (const it of items) {
    const key = itemKey(it);
    const d = state.drafts[key] || (state.drafts[key] = { qty: 0, expType: "", expDateISO: "" });

    const inc = $(`[data-inc="${cssEsc(key)}"]`, root);
    const dec = $(`[data-dec="${cssEsc(key)}"]`, root);
    const qty = $(`[data-qty="${cssEsc(key)}"]`, root);

    const presetSel = $(`[data-exppreset="${cssEsc(key)}"]`, root);
    const date = $(`[data-expdate="${cssEsc(key)}"]`, root);

    if (inc) inc.addEventListener("click", () => {
      d.qty = (Number(d.qty) || 0) + 1;
      if (qty) qty.value = String(d.qty);
    });

    if (dec) dec.addEventListener("click", () => {
      d.qty = Math.max(0, (Number(d.qty) || 0) - 1);
      if (qty) qty.value = String(d.qty);
    });

    if (qty) qty.addEventListener("input", () => {
      const n = Number(qty.value || 0);
      d.qty = Number.isFinite(n) ? Math.max(0, n) : 0;
    });

    if (presetSel) presetSel.addEventListener("change", () => {
      const v = String(presetSel.value || "");
      const wrap = $(`[data-pickwrap="${cssEsc(key)}"]`, root);

      if (v === "MANUAL") {
        d.expType = "MANUAL";
        if (wrap) wrap.classList.remove("hidden");
      } else {
        d.expType = "PRESET";
        d.expDateISO = v || "";
        if (wrap) wrap.classList.add("hidden");
      }
    });

    if (date) date.addEventListener("change", () => {
      d.expDateISO = String(date.value || "");
      if (!d.expType) d.expType = "MANUAL";
    });
  }
}

async function saveCategory(items, cat) {
  const store = state.session.store;
  const staff = state.session.staff;
  const shift = state.session.shift;

  const today = todayISO();

  const rows = [];
  for (const it of items) {
    const key = itemKey(it);
    const d = state.drafts[key] || { qty: 0, expType: "", expDateISO: "" };
    const qty = Number(d.qty) || 0;
    if (qty <= 0) continue;

    const rule = shelfLifeModeFor(it, cat);

    let expiry = null;
    if (rule.mode === "EOD_AUTO") expiry = today;
    else expiry = d.expDateISO || null;

    rows.push({
      item_id: it.id ?? null,
      item_name: it.name,
      category: it.category,
      sub_category: it.sub_category || null,
      quantity: qty,
      expiry: expiry,
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
   ALERTS (placeholder)
   ========================================================= */
function renderAlerts() {
  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>
    <div class="card">
      <div style="font-weight:1200">Coming soon</div>
      <div class="muted">We will show expiry alerts here later.</div>
    </div>
  `;
  $("#btnBack").addEventListener("click", goBack);
}

/* =========================================================
   SUMMARY (kept from your latest version)
   ========================================================= */
function renderSummaryHome() {
  const main = $("#main");

  const isMgr = !!state.session.isManager;
  const defaultMode = isMgr ? (state.view.summaryMode || "PDD") : state.session.store;
  state.view.summaryMode = defaultMode;

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Summary</div>
    </div>

    ${isMgr ? `
      <div class="card">
        <div style="font-weight:1200;margin-bottom:8px">Store view</div>
        <div class="row" style="gap:12px">
          <button id="mPDD" class="btn" style="flex:1;background:var(--pdd);color:#fff">PDD</button>
          <button id="mSKH" class="btn" style="flex:1;background:var(--skh);color:#fff">SKH</button>
        </div>
        <div class="muted" style="margin-top:8px">Staff sees only their store.</div>
      </div>
    ` : ""}

    <div id="sumWrap" class="col"></div>
  `;

  $("#btnBack").addEventListener("click", goBack);

  if (isMgr) {
    $("#mPDD").addEventListener("click", () => setSummaryMode("PDD"));
    $("#mSKH").addEventListener("click", () => setSummaryMode("SKH"));
  }

  updateSummaryModeButtons();
  drawSummaryCards().catch(console.error);
}

function setSummaryMode(mode) {
  state.view.summaryMode = mode;
  updateSummaryModeButtons();
  drawSummaryCards().catch(console.error);
}

function updateSummaryModeButtons() {
  if (!state.session.isManager) return;
  const m = state.view.summaryMode;
  const a = $("#mPDD"), b = $("#mSKH");
  if (a) a.style.opacity = m === "PDD" ? "1" : ".65";
  if (b) b.style.opacity = m === "SKH" ? "1" : ".65";
}

async function drawSummaryCards() {
  const wrap = $("#sumWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  const mode = state.session.isManager ? (state.view.summaryMode || "PDD") : state.session.store;

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const r = await apiGet(`/api/expiry?store=${encodeURIComponent(mode)}`);
  const rows = (Array.isArray(r) ? r : []).map(x => ({ ...x, _store: mode }));

  const todayCount = rows.filter(x => String(x.expiry_value || "").slice(0,10) === today).length;
  const tomCount = rows.filter(x => String(x.expiry_value || "").slice(0,10) === tomorrow).length;
  const safeCount = rows.filter(x => {
    const e = String(x.expiry_value || "").slice(0,10);
    return e && e !== today && e !== tomorrow;
  }).length;

  wrap.innerHTML = `
    <button class="dash-card dash-red" id="sToday" type="button">
      <div class="dash-left">
        <div class="dash-title">Expiring Today</div>
        <div class="dash-sub">Use immediately</div>
      </div>
      <div class="dash-right">
        <div class="dash-num">${todayCount}</div>
        <div class="dash-go">›</div>
      </div>
    </button>

    <button class="dash-card dash-amber" id="sTomorrow" type="button">
      <div class="dash-left">
        <div class="dash-title">Expiring Tomorrow</div>
        <div class="dash-sub">Plan usage</div>
      </div>
      <div class="dash-right">
        <div class="dash-num">${tomCount}</div>
        <div class="dash-go">›</div>
      </div>
    </button>

    <button class="dash-card dash-green" id="sSafe" type="button">
      <div class="dash-left">
        <div class="dash-title">All Safe & Fresh</div>
        <div class="dash-sub">Good to go!</div>
      </div>
      <div class="dash-right">
        <div class="dash-num">${safeCount}</div>
        <div class="dash-go">›</div>
      </div>
    </button>
  `;

  $("#sToday").addEventListener("click", () => setView({ page:"summaryList", bucket:"TODAY" }, true));
  $("#sTomorrow").addEventListener("click", () => setView({ page:"summaryList", bucket:"TOMORROW" }, true));
  $("#sSafe").addEventListener("click", () => setView({ page:"summaryList", bucket:"SAFE" }, true));
}

async function renderSummaryList() {
  const main = $("#main");
  const mode = state.session.isManager ? (state.view.summaryMode || "PDD") : state.session.store;
  const bucket = state.view.bucket || "TODAY";

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">${bucketTitle(bucket)}</div>
    </div>
    <div id="sumList" class="col"></div>
  `;
  $("#btnBack").addEventListener("click", goBack);

  const wrap = $("#sumList");
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const r = await apiGet(`/api/expiry?store=${encodeURIComponent(mode)}`);
  let rows = (Array.isArray(r) ? r : []).map(x => ({ ...x, _store: mode }));

  rows = rows.filter((x) => {
    const e = String(x.expiry_value || "").slice(0,10);
    if (!e) return false;
    if (bucket === "TODAY") return e === today;
    if (bucket === "TOMORROW") return e === tomorrow;
    return e !== today && e !== tomorrow;
  });

  if (!rows.length) {
    wrap.innerHTML = `<div class="card">No items</div>`;
    return;
  }

  const map = new Map();
  for (const rr of rows) {
    const c = rr.category || "Other";
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(rr);
  }

  let html = "";
  for (const [cat, list] of map.entries()) {
    html += `
      <div class="card">
        <div style="font-weight:1200; font-size:18px; margin-bottom:10px">${escapeHtml(cat)}</div>
        <div class="col" style="gap:8px">
          ${list.sort((a,b) => String(a.name).localeCompare(String(b.name))).map((rr) => {
            const dt = formatLongDMY(String(rr.expiry_value).slice(0,10));
            return `
              <div style="display:flex;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:14px;padding:10px 12px">
                <div style="font-weight:1200">${escapeHtml(rr.name)}</div>
                <div style="font-weight:1200">${escapeHtml(dt)}</div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  wrap.innerHTML = html;
}

function bucketTitle(b) {
  if (b === "TODAY") return "Expiring Today";
  if (b === "TOMORROW") return "Expiring Tomorrow";
  return "All Safe";
}

/* =========================================================
   WISR
   ========================================================= */
function renderWISR() {
  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">WISR Count</div>
    </div>
    <div class="card">
      <div style="font-weight:1200">Blank for now</div>
      <div class="muted">You will provide the data later.</div>
    </div>
  `;
  $("#btnBack").addEventListener("click", goBack);
}

/* =========================================================
   MANAGER
   ========================================================= */
function renderManagerHome() {
  if (!state.session.isManager) {
    openManagerLogin();
    return;
  }

  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="tiles-2col">
      <button class="tile t-blue" style="animation-delay:0ms" id="tAdd" type="button">
        <div class="emoji">➕</div>
        <div class="title">Add Item</div>
        <div class="sub">Create new item</div>
      </button>

      <button class="tile t-teal" style="animation-delay:45ms" id="tEdit" type="button">
        <div class="emoji">📝</div>
        <div class="title">Edit Items</div>
        <div class="sub">Compact expand</div>
      </button>

      <button class="tile t-purple" style="animation-delay:90ms" id="tCats" type="button">
        <div class="emoji">🗂️</div>
        <div class="title">Categories</div>
        <div class="sub">Tap tile to edit</div>
      </button>

      <button class="tile t-orange" style="animation-delay:135ms" id="tLog" type="button">
        <div class="emoji">⬇️</div>
        <div class="title">Download Log</div>
        <div class="sub">Placeholder</div>
      </button>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);
  $("#tAdd").addEventListener("click", () => openAddItemModal());
  $("#tEdit").addEventListener("click", () => setView({ page:"managerEditItems" }, true));
  $("#tCats").addEventListener("click", () => setView({ page:"managerCategories" }, true));
  $("#tLog").addEventListener("click", () => toast("Download Log: add server endpoint later"));
}

function openManagerLogin() {
  openModal(
    "Manager Login",
    `
      <div class="card">
        <div class="col">
          <div style="font-weight:1200">PIN</div>
          <input id="pinInp" class="input" type="password" inputmode="numeric" placeholder="Enter PIN">
          <button id="pinBtn" class="btn btn-red" style="width:100%">Login as Manager</button>
          <button id="pinCancel" class="btn btn-yellow" style="width:100%">Cancel</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#pinCancel").addEventListener("click", () => { closeModal(); goBack(); });

  $("#pinBtn").addEventListener("click", async () => {
    const pin = String($("#pinInp").value || "").trim();
    if (!pin) return toast("Enter PIN");

    try {
      const r = await apiPost("/api/manager/login", { pin, store: state.session.store });
      state.session.isManager = true;
      state.session.managerToken = r.token || "";
      saveSession();
      closeModal();
      renderRolePill();
      toast("Manager ✅");
      render();
    } catch (e) {
      console.error(e);
      toast("Wrong PIN");
    }
  });
}

/* ---------- manager: edit items ---------- */
async function renderManagerEditItems() {
  if (!state.session.isManager) return openManagerLogin();

  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Edit Items</div>
    </div>

    <div class="card">
      <div style="font-weight:1200">Search</div>
      <input id="mgrSearch" class="input" placeholder="Type item name...">
    </div>

    <div id="mgrList" class="col"></div>
  `;
  $("#btnBack").addEventListener("click", goBack);

  const token = state.session.managerToken;
  let items = [];
  try {
    items = await apiGet(`/api/manager/items?store=${encodeURIComponent(state.session.store)}`, token);
  } catch (e) {
    console.error(e);
    toast("Failed loading items");
  }

  const renderList = (q) => {
    q = String(q || "").toLowerCase().trim();
    const filtered = q ? items.filter((x) => String(x.name).toLowerCase().includes(q)) : items;

    const map = new Map();
    for (const it of filtered) {
      const c = it.category || "Other";
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(it);
    }

    let html = "";
    for (const [cat, list] of map.entries()) {
      html += `
        <div
