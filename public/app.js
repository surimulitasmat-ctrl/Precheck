/* =========================================================
   PreCheck — public/app.js (FULL)
   PART 1 / 6

   FIXED:
   - critical typo bugs
   - stable session boot
   - expiry popup polish (rollback-safe)
   ========================================================= */

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
  "BakedWaffle",
];

const FORCE_MANUAL_DATE_CATS = new Set(["Unopened chiller", "Fountain Drinks"]);
const STOCK_ALERT_EXCLUDE_CATS = new Set(["Sauce", "Front counter"]);

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
  drafts: {},
  stock: { hasDot: false, rows: [] },
  __draftsHydrated: false,
};

/* ---------- boot ---------- */
bindTopbar();
bindDrawer();
bindModal();
bindAppBackGuard();
startMidnightWatcher();

boot().catch(console.error);

async function boot() {
  ensureSessionDayKey();
  updateDrawerAlertLabel(false);

  await wakeServer().catch(() => {});

  if (!state.session.store || !state.session.staff) {
    state.view.page = "login";
    render();
    return;
  }

  showSaving("Loading…");
  try {
    await loadAllForCurrentStore();
    await refreshStockDot().catch(() => {});
  } finally {
    hideSaving();
  }

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
   DATE / TIME HELPERS
   ========================================================= */
function pad2(n) {
  return String(n).padStart(2, "0");
}
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
  return dayKeyNow();
}
function addDaysISO(baseISO, n) {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function formatLongDMY(iso) {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "long" })} ${d.getFullYear()}`;
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

/* =========================================================
   Wake server
   ========================================================= */
async function wakeServer() {
  try {
    await apiGet("/api/health");
  } catch {
    toast("Waking server… please wait");
  }
}

/* =========================================================
   EXPIRY POPUP (POLISHED, SAME DESIGN)
   ========================================================= */
function maybeShowExpiryPopup(force) {
  const k = dayKeyNow();
  const seenKey = `expiry_popup_seen_${k}`;
  if (!force && localStorage.getItem(seenKey) === "1") return;
  localStorage.setItem(seenKey, "1");

  const list = POPUP_ITEMS.map((x) => `<li>${escapeHtml(x)}</li>`).join("");

  openModal(
    "PLEASE check the expiry date",
    `
      <div class="pc-expiry-box">
        <div class="pc-expiry-lead">
          Please double check expiry dates before saving:
        </div>
        <ul class="pc-expiry-list">${list}</ul>
        <button id="popupOk" class="pc-expiry-ok" type="button">OK</button>
      </div>
    `,
    { noBackdropClose: true, kind: "expiry" }
  );

  $("#popupOk")?.addEventListener("click", closeModal);
}
/* =========================================================
   PreCheck — public/app.js (FULL)
   PART 2 / 6

   Includes:
   - escapeHtml + cssEsc
   - toast
   - modal (kind="expiry" support)
   - saving overlay
   - topbar role pill + session line
   - drawer bindings + stock alert label
   - back/swipe guard
   - midnight watcher
   - API helpers (POST/PATCH/DELETE)
   - data load + normalizeSub
   ========================================================= */

/* =========================================================
   SAFE HTML / CSS ESC
   ========================================================= */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function cssEsc(s) {
  return String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}


/* =========================================================
   TOAST
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

/* =========================================================
   MODAL (supports kind="expiry")
   ========================================================= */
function bindModal() {
  const closeBtn = $("#modalClose");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  const backdrop = $("#modalBackdrop");
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        if (backdrop.dataset.noClose === "1") return;
        closeModal();
      }
    });
  }

  ensureExpiryPopupCSS(); // ✅ only styles the expiry popup
}

function openModal(title, html, opts = {}) {
  const t = $("#modalTitle");
  const b = $("#modalBody");
  const back = $("#modalBackdrop");
  if (!t || !b || !back) return;

  const kind = String(opts.kind || "");

  t.textContent = title || "Modal";
  b.innerHTML = html || "";

  back.classList.remove("hidden");
  back.dataset.noClose = opts.noBackdropClose ? "1" : "0";
  back.dataset.kind = kind;

  back.classList.toggle("pc-kind-expiry", kind === "expiry");
}

function closeModal() {
  const back = $("#modalBackdrop");
  const b = $("#modalBody");
  if (back) {
    back.classList.add("hidden");
    back.dataset.noClose = "0";
    back.dataset.kind = "";
    back.classList.remove("pc-kind-expiry");
  }
  if (b) b.innerHTML = "";
}

/* ✅ Expiry popup CSS only — polished but same layout */
function ensureExpiryPopupCSS() {
  if (document.getElementById("pcExpiryPopupCSS")) return;
  const css = document.createElement("style");
  css.id = "pcExpiryPopupCSS";
  css.textContent = `
    /* Apply ONLY when kind="expiry" */
    #modalBackdrop.pc-kind-expiry #modalClose{ display:none !important; }
    #modalBackdrop.pc-kind-expiry #modalBody{ padding:0 !important; }

    #modalBackdrop.pc-kind-expiry .pc-expiry-box{
      background:#fff;
      border-radius:18px;
      padding:16px 16px 14px;
    }
    #modalBackdrop.pc-kind-expiry .pc-expiry-lead{
      font-size:14px;
      font-weight:1100;
      line-height:1.35;
      color:#111;
      margin-bottom:10px;
    }
    #modalBackdrop.pc-kind-expiry .pc-expiry-list{
      margin:0 0 14px 18px;
      padding:0;
      font-size:14px;
      line-height:1.35;
    }
    #modalBackdrop.pc-kind-expiry .pc-expiry-list li{
      margin:6px 0;
    }
    #modalBackdrop.pc-kind-expiry .pc-expiry-ok{
      width:100%;
      padding:14px 14px;
      border-radius:999px;
      font-weight:1200;
      font-size:16px;
      background:var(--yellow);
      color:#111;
      border:0;
    }
  `;
  document.head.appendChild(css);
}

/* =========================================================
   SAVING OVERLAY
   ========================================================= */
function ensureSavingOverlay() {
  let el = document.getElementById("pcSavingOverlay");
  if (el) return el;

  el = document.createElement("div");
  el.id = "pcSavingOverlay";
  el.className = "hidden";
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.background = "rgba(0,0,0,0.35)";
  el.style.zIndex = "9999";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.innerHTML = `
    <div style="background:#fff;border-radius:18px;padding:14px 16px;min-width:220px;box-shadow:0 20px 60px rgba(0,0,0,0.25)">
      <div id="pcSavingMsg" style="font-weight:1200;font-size:16px">Saving…</div>
      <div class="muted" style="margin-top:6px;font-weight:1000">Please wait</div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}
function showSaving(msg = "Saving…") {
  const el = ensureSavingOverlay();
  const m = document.getElementById("pcSavingMsg");
  if (m) m.textContent = msg;
  el.classList.remove("hidden");
}
function hideSaving() {
  const el = document.getElementById("pcSavingOverlay");
  if (el) el.classList.add("hidden");
}

/* =========================================================
   TOPBAR (role pill + session line)
   ========================================================= */
function bindTopbar() {
  renderRolePill();
  updateSessionLine();
}

function renderRolePill() {
  const host = $("#roleHost");
  if (!host) return;

  host.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `role-btn ${state.session.isManager ? "manager" : "staff"}`;

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
  btn.addEventListener("click", () =>
    toast(state.session.isManager ? "Manager mode" : "Staff mode")
  );
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
  if (btnClose) btnClose.addEventListener("click", (e) => { e.preventDefault(); closeDrawer(); });

  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDrawer();
    });
  }

  const bind = (id, fn) => {
    const b = $(id);
    if (b) b.addEventListener("click", () => { closeDrawer(); fn(); });
  };

  bind("#drawerHome", () => goHome());
  bind("#drawerAlerts", () => setView({ page: "stockAlerts" }, true));
  bind("#drawerManager", () => setView({ page: "manager" }, true));
  bind("#drawerSummary", () => setView({ page: "summaryHome" }, true));
  bind("#drawerWISR", () => setView({ page: "wisr" }, true));
  bind("#drawerLogout", () => doLogout());
}

function openDrawer() {
  const b = $("#drawerBackdrop");
  if (b) b.classList.remove("hidden");
}
function closeDrawer() {
  const b = $("#drawerBackdrop");
  if (b) b.classList.add("hidden");
}

function updateDrawerAlertLabel(hasDot) {
  const btn = $("#drawerAlerts");
  if (!btn) return;
  btn.innerHTML = hasDot
    ? `📦 Stock Alert <span class="tiny-dot" aria-label="New"></span>`
    : `📦 Stock Alert`;
}

/* =========================================================
   BACK / SWIPE GUARD (prevents accidental exit)
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

    const modalOpen = !$("#modalBackdrop")?.classList.contains("hidden");
    if (modalOpen) {
      closeModal();
      safePushHistory();
      return;
    }

    if (!state.session.store || !state.session.staff) {
      safePushHistory();
      return;
    }

    if (state.navStack.length > 0) {
      goBack();
      safePushHistory();
      return;
    }

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

  $("#exitNo")?.addEventListener("click", closeModal);
  $("#exitYes")?.addEventListener("click", () => {
    closeModal();
    try {
      backGuardArmed = false;
      history.back();
    } catch {}
  });
}

/* =========================================================
   MIDNIGHT WATCHER (new day => show expiry popup again)
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

/* =========================================================
   API HELPERS
   ========================================================= */
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

/* =========================================================
   DATA LOAD
   ========================================================= */
async function loadAllForCurrentStore() {
  const store = state.session.store;

  state.data.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
  state.data.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);

  state.data.items = (state.data.items || []).map((it) => ({
    ...it,
    sub_category: it.sub_category ? normalizeSub(it.sub_category) : null,
    is_hourly: !!it.is_hourly,
    stock_alert_enabled: !!it.stock_alert_enabled,
    stock_min: it.stock_min != null ? Number(it.stock_min) : null,
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
   PreCheck — public/app.js (FULL)
   PART 3 / 6

   Includes:
   - drafts persistence (store+shift+day scoped)
   - render router (login/home/category/alerts/summary/wisr/manager)
   - navigation helpers (setView/goBack/goHome)
   - login page
   - home page tiles
   - category page (Sauce sub menu + item list shell)
   ========================================================= */

/* =========================================================
   Draft persistence (store+shift+day scoped)
   ========================================================= */
function draftsKey() {
  const s = state.session;
  const store = s.store || "NA";
  const shift = s.shift || "AM";
  const day = s.sessionDayKey || dayKeyNow();
  return `drafts_${store}_${shift}_${day}`;
}

function loadDraftsFromStorage() {
  try {
    const raw = localStorage.getItem(draftsKey());
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") state.drafts = obj;
  } catch {}
}

function saveDraftsToStorage() {
  try {
    localStorage.setItem(draftsKey(), JSON.stringify(state.drafts || {}));
  } catch {}
}

/* hydrate once if already logged in */
(function hydrateDraftsOnce() {
  if (state.session?.store && state.session?.staff) loadDraftsFromStorage();
})();

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
  state.view = prev
    ? prev
    : { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
  render();
}

function goHome() {
  state.navStack = [];
  state.view = { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
  render();
}

/* =========================================================
   RENDER ROUTER
   ========================================================= */
function render() {
  updateSessionLine();
  renderRolePill();

  const main = $("#main");
  if (!main) return;

  if (!state.session.store || !state.session.staff) {
    renderLoginPage();
    return;
  }

  if (!state.__draftsHydrated) {
    state.__draftsHydrated = true;
    loadDraftsFromStorage();
  }

  switch (state.view.page) {
    case "login":
      return renderLoginPage();
    case "home":
      return renderHome();
    case "category":
      return renderCategory();
    case "stockAlerts":
      return renderStockAlerts();
    case "summaryHome":
      return renderSummaryHome();
    case "summaryList":
      return renderSummaryList();
    case "wisr":
      return renderWISR();
    case "manager":
      return renderManagerHome();
    case "managerEditItems":
      return renderManagerEditItems();
    case "managerCategories":
      return renderManagerCategories();
    default:
      main.innerHTML = `<div class="card">Unknown page</div>`;
  }
}

/* =========================================================
   LOGIN PAGE
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
        <button id="pickPDD" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">PDD</button>
        <button id="pickSKH" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">SKH</button>
      </div>

      <div style="margin-top:14px;font-weight:1200">Shift</div>
      <select id="shiftSel" class="select">
        <option value="AM"${(s.shift || "AM") === "AM" ? " selected" : ""}>AM</option>
        <option value="PM"${(s.shift || "AM") === "PM" ? " selected" : ""}>PM</option>
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

  const applyStoreBtnUI = () => {
    const a = $("#pickPDD");
    const b = $("#pickSKH");

    if (a) { a.style.background = "#fff"; a.style.color = "#111"; a.style.border = "1px solid var(--line)"; }
    if (b) { b.style.background = "#fff"; b.style.color = "#111"; b.style.border = "1px solid var(--line)"; }

    if (pick === "PDD" && a) { a.style.background = "var(--pdd)"; a.style.color = "#fff"; a.style.border = "0"; }
    if (pick === "SKH" && b) { b.style.background = "var(--skh)"; b.style.color = "#fff"; b.style.border = "0"; }
  };
  applyStoreBtnUI();

  $("#pickPDD")?.addEventListener("click", () => { pick = "PDD"; applyStoreBtnUI(); });
  $("#pickSKH")?.addEventListener("click", () => { pick = "SKH"; applyStoreBtnUI(); });

  $("#startBtn")?.addEventListener("click", async () => {
    const staff = String($("#staffInp")?.value || "").trim();
    const shift = String($("#shiftSel")?.value || "AM");
    if (!staff) return toast("Please enter staff name/ID");

    state.session.store = pick;
    state.session.shift = shift;
    state.session.staff = staff;
    state.session.isManager = false;
    state.session.managerToken = "";
    state.session.sessionDayKey = dayKeyNow();
    saveSession();

    showSaving("Loading…");
    try {
      await wakeServer().catch(() => {});
      await loadAllForCurrentStore();
      await refreshStockDot().catch(() => {});
      renderRolePill();
      updateSessionLine();

      state.navStack = [];
      state.view = { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
      render();

      setTimeout(() => maybeShowExpiryPopup(true), 150);
    } catch (e) {
      console.error(e);
      toast("Failed to load data");
    } finally {
      hideSaving();
    }
  });
}

/* =========================================================
   HOME
   ========================================================= */
function renderHome() {
  const main = $("#main");

  const cats = (state.data.categories || []).map((c) => c.name);
  const counts = {};
  for (const it of state.data.items || []) {
    counts[it.category] = (counts[it.category] || 0) + 1;
  }

  const tiles = cats
    .map((name, idx) => {
      const emoji = CAT_EMOJI[name] || "✅";
      const tone = tileToneFor(name);
      return `
        <button class="tile ${tone}" style="animation-delay:${idx * 45}ms" data-cat="${escapeHtml(name)}" type="button">
          <div class="emoji" style="font-size:54px">${emoji}</div>
          <div class="title" style="font-size:20px;font-weight:1200">${escapeHtml(name)}</div>
          <div class="sub">${counts[name] || 0} items</div>
        </button>
      `;
    })
    .join("");

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
    Thawing: "t-cyan",
    Vegetables: "t-green2",
    Backroom: "t-orange",
    "Front counter": "t-red",
    "Back counter chiller": "t-teal",
    "Fountain Drinks": "t-green2",
    Sauce: "t-purple",
  };
  return map[name] || "t-pink";
}

/* =========================================================
   CATEGORY (Sauce submenu + list shell)
   ========================================================= */
function renderCategory() {
  const main = $("#main");
  const cat = state.view.category;

  // Sauce sub-menu
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

    $("#btnBack")?.addEventListener("click", goBack);
    $$(".tile", main).forEach((b) => b.addEventListener("click", () => setView({ sauceSub: b.dataset.sub }, true)));
    return;
  }

  const sauceSub = state.view.sauceSub;
  const title = cat === "Sauce" && sauceSub ? `Sauce — ${sauceSub}` : cat;

  let items = (state.data.items || []).filter((x) => x.category === cat);
  if (cat === "Sauce" && sauceSub) {
    items = items.filter((x) => (x.sub_category || "") === normalizeSub(sauceSub));
  }

  const emptyHint = items.length
    ? ""
    : `
      <div class="card" style="border-left:6px solid var(--yellow)">
        <div style="font-weight:1200">No items found</div>
        <div class="muted" style="margin-top:6px">
          This means your Sauce sub-category names in DB don’t match exactly.
        </div>
      </div>
    `;

  // ✅ actual item editors + save button are in PART 4
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    ${emptyHint}

    <div class="edit-list" id="editList"></div>

    <div class="save-bar">
      <button id="saveBtn" type="button"
        style="width:min(92%,520px); margin:0 auto; padding:14px 18px; border-radius:999px; font-weight:1200; font-size:16px;
               background:var(--green); color:#fff; border:0"
      >Save</button>
    </div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  // these will exist once PART 4 is pasted
  try {
    if (typeof renderAndBindEditors === "function") renderAndBindEditors(items, cat);
  } catch {}
}
/* =========================================================
   PreCheck — public/app.js (FULL)
   PART 4 / 6

   Includes:
   ✅ expiry date picker (keep your existing iOS wheel)
   ✅ item editor UI (qty + expiry + +Date)
   ✅ FIX: typo bug in bindItemEditors (was breaking progress refresh)
   ✅ FIX: clear staff saved drafts after successful save (the “didn’t clear” issue)
   ✅ renderCategory override to restore your original progress pill + Done checking button text
   ========================================================= */

/* =========================================================
   Category progress tracker + UI (same behavior)
   ========================================================= */
function categoryProgress(items, cat) {
  let total = 0;
  let done = 0;

  for (const it of items || []) {
    const key = itemKey(it);
    const d = state.drafts[key] || {};
    const qty = Number(d.qty) || 0;
    if (qty <= 0) continue;
    total++;

    const rule = shelfLifeModeFor(it, cat);
    if (rule.mode === "HOURLY") {
      if (d.expTimeShort) done++;
      continue;
    }
    if (rule.mode === "EOD_AUTO") {
      done++;
      continue;
    }
    const exp = String(d.expDateISO || "");
    if (exp) done++;
  }

  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}

function refreshCategoryProgressUI(items, cat) {
  const prog = categoryProgress(items, cat);
  const pill = document.getElementById("catProgPill");
  const saveBtn = document.getElementById("saveBtn");

  if (pill) {
    pill.textContent = prog.total ? `${prog.done}/${prog.total} (${prog.pct}%)` : "";
    pill.classList.toggle("hidden", !prog.total);
  }

  if (saveBtn) {
    const doneAll = prog.total > 0 && prog.done === prog.total;
    saveBtn.textContent = doneAll ? "Done checking ✅ (Save)" : "Save";
  }
}

/* =========================================================
   ✅ renderCategory override (restore your original UI)
   - Sauce sub menu stays same
   - Adds progress pill + Done checking button text
   ========================================================= */
function renderCategory() {
  const main = $("#main");
  const cat = state.view.category;

  // Sauce sub-menu
  if (cat === "Sauce" && !state.view.sauceSub) {
    const tiles = SAUCE_SUBS.map((s, idx) => {
      const tone =
        s.tone === "teal" ? "t-teal" : s.tone === "purple" ? "t-purple" : "t-orange";
      return `
        <button class="tile ${tone}" style="min-height:120px;animation-delay:${idx * 60}ms" data-sub="${escapeHtml(
        s.name
      )}" type="button">
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
    $("#btnBack")?.addEventListener("click", goBack);
    $$(".tile", main).forEach((b) => b.addEventListener("click", () => setView({ sauceSub: b.dataset.sub }, true)));
    return;
  }

  const sauceSub = state.view.sauceSub;
  const title = cat === "Sauce" && sauceSub ? `Sauce — ${sauceSub}` : cat;

  let items = (state.data.items || []).filter((x) => x.category === cat);
  if (cat === "Sauce" && sauceSub) {
    items = items.filter((x) => (x.sub_category || "") === normalizeSub(sauceSub));
  }

  const prog = categoryProgress(items, cat);
  const progText = prog.total === 0 ? "" : `${prog.done}/${prog.total} (${prog.pct}%)`;
  const doneAll = prog.total > 0 && prog.done === prog.total;

  const list = items.map((it) => renderItemEditor(it, cat)).join("");
  const emptyHint = items.length
    ? ""
    : `
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
      <div class="page-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span>${escapeHtml(title)}</span>
        ${
          prog.total
            ? `<span id="catProgPill" style="font-weight:1200;font-size:12px;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid var(--line)">
                ${escapeHtml(progText)}
              </span>`
            : ""
        }
      </div>
    </div>

    ${emptyHint}

    <div class="edit-list" id="editList">${list}</div>

    <div class="save-bar">
      <button
        id="saveBtn"
        type="button"
        style="width:min(92%,520px); margin:0 auto; padding:14px 18px; border-radius:999px; font-weight:1200; font-size:16px;
               background:var(--green); color:#fff; border:0"
      >${doneAll ? "Done checking ✅ (Save)" : "Save"}</button>
    </div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  bindItemEditors(items, cat);
  refreshCategoryProgressUI(items, cat);

  $("#saveBtn")?.addEventListener("click", async () => {
    await saveCategory(items, cat);
  });
}

/* =========================================================
   Date wheel picker (use your existing one)
   (Assumes openDateWheelModal + openAddDateModal already exist later,
   but we keep working even if only one is used.)
   ========================================================= */

/* =========================================================
   Item editor + bind editors
   ========================================================= */
function renderItemEditor(it, cat) {
  const key = itemKey(it);

  if (!state.drafts[key]) {
    state.drafts[key] = {
      qty: 0,
      expType: "",
      expDateISO: "",
      expTimeShort: "",
      extraISO: "",
      extraQty: 0,
    };
  }
  const d = state.drafts[key];

  const rule = shelfLifeModeFor(it, cat);
  let expiryUI = "";

  if (rule.mode === "HOURLY") {
    const opts = HOURLY_SHORT.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${
          d.expTimeShort === o.value ? " selected" : ""
        }>${escapeHtml(o.label)}</option>`
    ).join("");

    expiryUI = `
      <label class="label">Expiry time (Today)</label>
      <select class="select" data-exptime="${escapeHtml(key)}">
        <option value="">Select time</option>
        ${opts}
      </select>
      <div class="edit-helper">Hourly expiry (today only)</div>
    `;
  } else if (rule.mode === "EOD_AUTO") {
    expiryUI = `<div class="muted" style="font-weight:900">Expiry: End of day (auto)</div>`;
  } else if (rule.mode === "MANUAL") {
    expiryUI = `
      <label class="label">Expiry date</label>
      <button class="btn btn-yellow" type="button" data-pickdate="${escapeHtml(key)}" style="width:100%">Pick date</button>
      <div class="edit-helper">${d.expDateISO ? escapeHtml(formatLongDMY(d.expDateISO)) : "Select date"}</div>
    `;
  } else {
    const today = todayISO();
    const n = Math.max(1, Math.min(7, Number(rule.life) || 1)); // 1..7
    const opts = Array.from({ length: n }, (_, i) => {
      const iso = addDaysISO(today, i);
      const sel = d.expDateISO === iso ? " selected" : "";
      return `<option value="${escapeHtml(iso)}"${sel}>${escapeHtml(formatLongDMY(iso))}</option>`;
    }).join("");

    expiryUI = `
      <label class="label">Expiry</label>
      <select class="select" data-exppreset="${escapeHtml(key)}">
        <option value="">Select</option>
        ${opts}
        <option value="MANUAL"${d.expType === "MANUAL" ? " selected" : ""}>Manual (pick date)</option>
      </select>
      <div data-pickwrap="${escapeHtml(key)}" class="${d.expType === "MANUAL" ? "" : "hidden"}" style="margin-top:8px">
        <button class="btn btn-yellow" type="button" data-pickdate="${escapeHtml(key)}" style="width:100%">Pick date</button>
        <div class="edit-helper">${d.expDateISO ? escapeHtml(formatLongDMY(d.expDateISO)) : ""}</div>
      </div>
      <div class="edit-helper">Preset dates (from shelf life)</div>
    `;
  }

  const addDateBtn =
    rule.mode === "HOURLY"
      ? ""
      : `<button class="btn btn-ghost" type="button" data-adddate="${escapeHtml(key)}" title="Add second expiry" style="padding:10px 12px">＋ Date</button>`;

  const extraBadge =
    Number(d.extraQty) > 0
      ? `<div class="muted" style="font-weight:1100;margin-top:6px">2nd date: ${Number(d.extraQty) || 0}</div>`
      : "";

  return `
    <div class="edit-card" data-key="${escapeHtml(key)}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div class="edit-name">${escapeHtml(it.name)}</div>
        ${addDateBtn}
      </div>
      ${extraBadge}

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

  // ✅ FIX: typo bug (your code had refreshCategoryPr`ogressUI)
  const refreshProg = () => refreshCategoryProgressUI(items, cat);

  for (const it of items) {
    const key = itemKey(it);
    const d =
      state.drafts[key] ||
      (state.drafts[key] = {
        qty: 0,
        expType: "",
        expDateISO: "",
        expTimeShort: "",
        extraISO: "",
        extraQty: 0,
      });

    const inc = $(`[data-inc="${cssEsc(key)}"]`, root);
    const dec = $(`[data-dec="${cssEsc(key)}"]`, root);
    const qty = $(`[data-qty="${cssEsc(key)}"]`, root);

    const presetSel = $(`[data-exppreset="${cssEsc(key)}"]`, root);
    const timeSel = $(`[data-exptime="${cssEsc(key)}"]`, root);
    const pickBtn = $(`[data-pickdate="${cssEsc(key)}"]`, root);
    const addDate = $(`[data-adddate="${cssEsc(key)}"]`, root);

    updateQtyUI(root, key);
    refreshProg();

    inc?.addEventListener("click", () => {
      d.qty = (Number(d.qty) || 0) + 1;
      saveDraftsToStorage();
      updateQtyUI(root, key);
      pulseBtn(inc);
      haptic(12);
      refreshProg();
    });

    dec?.addEventListener("click", () => {
      d.qty = Math.max(0, (Number(d.qty) || 0) - 1);
      saveDraftsToStorage();
      updateQtyUI(root, key);
      pulseBtn(dec);
      haptic(10);
      refreshProg();
    });

    qty?.addEventListener("input", () => {
      const n = Number(qty.value || 0);
      d.qty = Number.isFinite(n) ? Math.max(0, n) : 0;
      saveDraftsToStorage();
      updateQtyUI(root, key);
      refreshProg();
    });

    timeSel?.addEventListener("change", () => {
      d.expTimeShort = String(timeSel.value || "");
      d.expType = "HOURLY";
      saveDraftsToStorage();
      refreshProg();
      render();
    });

    presetSel?.addEventListener("change", () => {
      const v = String(presetSel.value || "");
      const wrap = $(`[data-pickwrap="${cssEsc(key)}"]`, root);

      if (v === "MANUAL") {
        d.expType = "MANUAL";
        wrap?.classList.remove("hidden");
      } else {
        d.expType = "PRESET";
        d.expDateISO = v || "";
        wrap?.classList.add("hidden");
      }
      saveDraftsToStorage();
      refreshProg();
      render();
    });

    pickBtn?.addEventListener("click", () => {
      // uses whichever openDateWheelModal is defined in your file
      openDateWheelModal({
        title: "Pick expiry date",
        initialISO: d.expDateISO || todayISO(),
        minISO: todayISO(),
        maxISO: "2100-12-31",
        onPick: (iso) => {
          d.expDateISO = iso;
          if (!d.expType) d.expType = "MANUAL";
          saveDraftsToStorage();
          refreshProg();
          render();
        },
      });
    });

    addDate?.addEventListener("click", () => openAddDateModal({ it, cat, key }));
  }
}

/* =========================================================
   ✅ Save category (FIX: clears saved drafts)
   - After successful save: reset drafts for those items so UI is clean
   ========================================================= */
async function saveCategory(items, cat) {
  const store = state.session.store;
  const staff = state.session.staff;
  const shift = state.session.shift;
  const today = todayISO();

  const rows = [];
  const touchedKeys = new Set();

  for (const it of items) {
    const key = itemKey(it);
    const d =
      state.drafts[key] || {
        qty: 0,
        expType: "",
        expDateISO: "",
        expTimeShort: "",
        extraISO: "",
        extraQty: 0,
      };

    const qty = Number(d.qty) || 0;
    const xq = Number(d.extraQty) || 0;

    const rule = shelfLifeModeFor(it, cat);

    if (qty > 0) {
      let expiry = null;
      let expiry_at = null;

      if (rule.mode === "HOURLY") {
        if (!d.expTimeShort) return toast(`Pick time for ${it.name}`);
        expiry = today;
        expiry_at = isoFromTodayAndTime(d.expTimeShort);
      } else if (rule.mode === "EOD_AUTO") {
        expiry = today;
      } else {
        expiry = d.expDateISO || null;
        if (!expiry) return toast(`Pick expiry for ${it.name}`);
      }

      rows.push({
        item_id: it.id ?? null,
        item_name: it.name,
        category: it.category,
        sub_category: it.sub_category || null,
        quantity: qty,
        expiry,
        expiry_at,
        shift,
        is_extra: false,
      });
      touchedKeys.add(key);
    }

    if (xq > 0) {
      const expiry = rule.mode === "EOD_AUTO" ? today : d.extraISO || "";
      if (!expiry) return toast("Set 2nd date");

      rows.push({
        item_id: it.id ?? null,
        item_name: it.name,
        category: it.category,
        sub_category: it.sub_category || null,
        quantity: xq,
        expiry,
        expiry_at: null,
        shift,
        is_extra: true,
        extra_tag: "SECOND",
      });
      touchedKeys.add(key);
    }
  }

  if (!rows.length) return toast("Nothing to save");

  showSaving("Saving…");
  try {
    await apiPost("/api/log/batch", { store, staff, shift, rows });

    const lastName = rows.length ? (rows[rows.length - 1].item_name || "") : "";
    recordShiftDoneAndLast({ store, shift, staff, lastItemName: lastName });

    // ✅ FIX: clear saved drafts so staff see clean inputs after Save
    for (const key of touchedKeys) {
      state.drafts[key] = {
        qty: 0,
        expType: "",
        expDateISO: "",
        expTimeShort: "",
        extraISO: "",
        extraQty: 0,
      };
    }
    saveDraftsToStorage();

    toast("Saved ✅");
    await refreshStockDot().catch(() => {});
    render(); // refresh UI after clearing
  } catch (e) {
    console.error(e);
    toast("Save failed");
  } finally {
    hideSaving();
  }
}
/* =========================================================
   PreCheck — public/app.js (FULL)
   PART 5 / 6

   Includes:
   - Stock Alert page + drawer dot
   - Summary Home + Summary List
   - Shift completion cards (API truth + local fallback)
   - WISR placeholder
   - (No changes to your design unless needed)
   ========================================================= */

/* =========================================================
   STOCK ALERT PAGE
   ========================================================= */
async function refreshStockDot() {
  const store = state.session.store;
  try {
    const r = await apiGet(`/api/stock/low?store=${encodeURIComponent(store)}`);
    const rows = enforceArray(r).filter(
      (x) => !STOCK_ALERT_EXCLUDE_CATS.has(String(x.category || ""))
    );
    state.stock.rows = rows;
    state.stock.hasDot = rows.length > 0;
    updateDrawerAlertLabel(state.stock.hasDot);
  } catch {
    state.stock.rows = [];
    state.stock.hasDot = false;
    updateDrawerAlertLabel(false);
  }
}

async function renderStockAlerts() {
  const main = $("#main");

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Stock Alert</div>
    </div>
    <div id="saWrap" class="col"></div>
  `;
  $("#btnBack")?.addEventListener("click", goBack);

  const wrap = $("#saWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  await refreshStockDot().catch(() => {});
  const rows = state.stock.rows || [];

  if (!rows.length) {
    wrap.innerHTML = `
      <div class="card">
        <div style="font-weight:1200">No low stock ✅</div>
        <div class="muted" style="margin-top:6px">All items are above minimum.</div>
      </div>
    `;
    return;
  }

  const grouped = new Map();
  for (const rr of rows) {
    const cat = rr.category || "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(rr);
  }

  let html = "";
  for (const [cat, list] of grouped.entries()) {
    html += `
      <div class="card">
        <div style="font-weight:1200;font-size:18px;margin-bottom:10px">${escapeHtml(cat)}</div>
        <div class="col" style="gap:10px">
          ${list
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .map((x) => {
              const cur = x.current_qty != null ? Number(x.current_qty) : null;
              const min = x.min_qty != null ? Number(x.min_qty) : null;
              return `
                <div style="border:1px solid var(--line);border-radius:14px;padding:10px 12px">
                  <div style="display:flex;justify-content:space-between;gap:10px">
                    <div style="font-weight:1200">${escapeHtml(x.name)}</div>
                    <div style="font-weight:1200">${min != null ? `Min ${min}` : ""}</div>
                  </div>
                  <div class="muted" style="margin-top:6px;font-weight:1100">
                    Current: <b>${cur != null ? cur : "?"}</b>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  wrap.innerHTML = html;
}

/* =========================================================
   SUMMARY HELPERS
   ========================================================= */
async function getStatusByShift(store, shift) {
  const data = await apiGet(`/api/status?store=${encodeURIComponent(store)}`);
  const sh = String(shift || "AM").toUpperCase() === "PM" ? "PM" : "AM";
  const row = data?.[sh] || null;

  return row
    ? {
        last_saved_at: row.last_saved_at,
        last_saved_by: row.last_saved_by,
        total_rows: row.total_rows || 0,
        last_item_name: row.last_item_name || "",
      }
    : null;
}

function statusToUI(s) {
  if (!s || !s.last_saved_by)
    return { done: false, who: "", hhmm: "", count: 0, lastItemName: "" };
  const when = s.last_saved_at ? new Date(s.last_saved_at) : null;
  const hhmm = when ? formatTime12(`${pad2(when.getHours())}:${pad2(when.getMinutes())}`) : "";
  const who = String(s.last_saved_by || "");
  const count = Number(s.total_rows || 0);
  const lastItemName = String(s.last_item_name || "");
  return { done: true, who, hhmm, count, lastItemName };
}

function readLocalDoneLast(store, shift) {
  const local = readShiftDoneAndLast(store, shift);
  if (!local || !local.done) return { done: false, who: "", hhmm: "", lastItemName: "" };

  const when = local.at ? new Date(local.at) : null;
  const hhmm = when ? formatTime12(`${pad2(when.getHours())}:${pad2(when.getMinutes())}`) : "";
  return {
    done: true,
    who: String(local.staff || ""),
    hhmm,
    lastItemName: String(local.lastItemName || ""),
  };
}

function renderShiftCardUI(shift, info, fallback) {
  const done = info?.done || fallback?.done || false;
  const who = info?.who || fallback?.who || "";
  const hhmm = info?.hhmm || fallback?.hhmm || "";
  const count = info?.count || 0;
  const lastItemName = info?.lastItemName || fallback?.lastItemName || "";

  const badgeBg = done ? "var(--green)" : "var(--red)";
  const badgeText = done ? "DONE" : "NOT DONE";

  return `
    <div style="flex:1;min-width:240px;border:1px solid var(--line);border-radius:18px;padding:14px 14px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="font-weight:1400;font-size:18px">${shift}</div>
        <div style="background:${badgeBg};color:#fff;border-radius:999px;padding:6px 10px;font-weight:1200;font-size:12px">
          ${badgeText}
        </div>
      </div>

      ${
        done
          ? `
        <div class="muted" style="margin-top:10px;font-weight:1100">
          Done by <b>${escapeHtml(who || "-")}</b>${hhmm ? ` at <b>${escapeHtml(hhmm)}</b>` : ""}
        </div>
        ${
          count
            ? `<div class="muted" style="margin-top:6px;font-weight:1100">Items saved: <b>${count}</b></div>`
            : `<div class="muted" style="margin-top:6px;font-weight:1100">Items saved: <b>—</b></div>`
        }
        ${
          lastItemName
            ? `<div class="muted" style="margin-top:6px;font-weight:1100">Last item saved: <b>${escapeHtml(
                lastItemName
              )}</b></div>`
            : ``
        }
      `
          : `
        <div class="muted" style="margin-top:10px;font-weight:1100">
          No save recorded yet.
        </div>
      `
      }
    </div>
  `;
}

/* =========================================================
   Manager progress snapshot (local drafts)
   ========================================================= */
function localProgressSnapshot() {
  const cats = (state.data.categories || []).map((c) => c.name);
  const catToItems = new Map();
  for (const c of cats) catToItems.set(c, []);
  for (const it of state.data.items || []) {
    if (!catToItems.has(it.category)) catToItems.set(it.category, []);
    catToItems.get(it.category).push(it);
  }

  let started = 0;
  let total = cats.length || 0;

  for (const c of cats) {
    const items = catToItems.get(c) || [];
    let any = false;
    for (const it of items) {
      const k = itemKey(it);
      const d = state.drafts[k];
      if (d && Number(d.qty) > 0) {
        any = true;
        break;
      }
    }
    if (any) started++;
  }

  return { started, total };
}

/* =========================================================
   SUMMARY HOME
   ========================================================= */
async function renderSummaryHome() {
  const main = $("#main");

  const isMgr = !!state.session.isManager;
  const storeView = isMgr ? state.view.summaryMode || "PDD" : state.session.store;
  state.view.summaryMode = storeView;

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Summary</div>
    </div>

    ${
      isMgr
        ? `
      <div class="card">
        <div style="font-weight:1200;margin-bottom:8px">Store view</div>
        <div class="row" style="gap:12px">
          <button id="mPDD" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">PDD</button>
          <button id="mSKH" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">SKH</button>
        </div>
      </div>
    `
        : ""
    }

    ${
      isMgr
        ? `
      <div class="card" style="margin-top:12px">
        <div style="font-weight:1200;font-size:18px;margin-bottom:10px">Progress snapshot</div>
        <div id="progSnap" class="muted" style="font-weight:1100">Loading…</div>
        <div class="muted" style="margin-top:8px;font-weight:1000">
          *This shows progress on THIS device.
        </div>
      </div>
    `
        : ""
    }

    <div class="card" style="margin-top:12px">
      <div style="font-weight:1200;font-size:18px;margin-bottom:10px">Shift completion</div>
      <div id="shiftGrid" class="row" style="gap:12px;flex-wrap:wrap"></div>
    </div>

    <div class="card" style="margin-top:12px">
      <div style="font-weight:1200;font-size:18px;margin-bottom:10px">Expiry overview</div>
      <div id="sumWrap" class="col"></div>
    </div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  if (isMgr) {
    $("#mPDD")?.addEventListener("click", () => setSummaryMode("PDD"));
    $("#mSKH")?.addEventListener("click", () => setSummaryMode("SKH"));
    updateSummaryModeButtons();

    const ps = localProgressSnapshot();
    const el = $("#progSnap");
    if (el) el.innerHTML = `Categories started: <b>${ps.started}</b> / <b>${ps.total}</b>`;
  }

  const grid = $("#shiftGrid");
  if (grid) {
    grid.innerHTML = `<div class="muted" style="font-weight:1100">Loading…</div>`;

    let am = null, pm = null;
    try { am = await getStatusByShift(storeView, "AM"); } catch {}
    try { pm = await getStatusByShift(storeView, "PM"); } catch {}

    const amUI = statusToUI(am);
    const pmUI = statusToUI(pm);

    const amLocal = readLocalDoneLast(storeView, "AM");
    const pmLocal = readLocalDoneLast(storeView, "PM");

    grid.innerHTML = `
      ${renderShiftCardUI("AM", amUI, amLocal)}
      ${renderShiftCardUI("PM", pmUI, pmLocal)}
    `;
  }

  await drawSummaryCards().catch(console.error);
}

function setSummaryMode(mode) {
  state.view.summaryMode = mode;
  updateSummaryModeButtons();
  renderSummaryHome().catch(console.error);
}

function updateSummaryModeButtons() {
  if (!state.session.isManager) return;
  const m = state.view.summaryMode;
  const a = $("#mPDD"), b = $("#mSKH");

  if (a) { a.style.background = "#fff"; a.style.color = "#111"; a.style.border = "1px solid var(--line)"; }
  if (b) { b.style.background = "#fff"; b.style.color = "#111"; b.style.border = "1px solid var(--line)"; }

  if (m === "PDD" && a) { a.style.background = "var(--pdd)"; a.style.color = "#fff"; a.style.border = "0"; }
  if (m === "SKH" && b) { b.style.background = "var(--skh)"; b.style.color = "#fff"; b.style.border = "0"; }
}

async function drawSummaryCards() {
  const wrap = $("#sumWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  const mode = state.session.isManager ? state.view.summaryMode || "PDD" : state.session.store;

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const r = await apiGet(`/api/expiry?store=${encodeURIComponent(mode)}`);
  const rows = enforceArray(r).map((x) => ({ ...x, _store: mode }));

  const todayCount = rows.filter((x) => datePartFromRow(x) === today).length;
  const tomCount = rows.filter((x) => datePartFromRow(x) === tomorrow).length;
  const safeCount = rows.filter((x) => {
    const e = datePartFromRow(x);
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

  $("#sToday")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "TODAY" }, true));
  $("#sTomorrow")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "TOMORROW" }, true));
  $("#sSafe")?.addEventListener("click", () => setView({ page: "summaryList", bucket: "SAFE" }, true));
}

async function renderSummaryList() {
  const main = $("#main");
  const mode = state.session.isManager ? state.view.summaryMode || "PDD" : state.session.store;
  const bucket = state.view.bucket || "TODAY";

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">${bucketTitle(bucket)}</div>
    </div>
    <div id="sumList" class="col"></div>
  `;
  $("#btnBack")?.addEventListener("click", goBack);

  const wrap = $("#sumList");
  if (!wrap) return;
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const r = await apiGet(`/api/expiry?store=${encodeURIComponent(mode)}`);
  let rows = enforceArray(r).map((x) => ({ ...x, _store: mode }));

  rows = rows.filter((x) => {
    const e = datePartFromRow(x);
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
          ${list
            .sort((a, b) => String(a.name || a.item_name).localeCompare(String(b.name || b.item_name)))
            .map((rr) => {
              const dt = formatLongDMY(datePartFromRow(rr));
              const tm = timePartFromRow(rr);
              const qty = rr.qty != null ? Number(rr.qty) : rr.quantity != null ? Number(rr.quantity) : null;
              const sh = rr.shift ? String(rr.shift) : "";
              return `
                <div style="border:1px solid var(--line);border-radius:14px;padding:10px 12px">
                  <div style="display:flex;justify-content:space-between;gap:10px">
                    <div style="font-weight:1200">${escapeHtml(rr.name || rr.item_name)}</div>
                    <div style="font-weight:1200">${escapeHtml(dt)}</div>
                  </div>
                  <div class="muted" style="margin-top:6px;font-weight:1000;display:flex;justify-content:space-between">
                    <div>${tm ? `Time: ${escapeHtml(tm)}` : ""} ${sh ? `• ${escapeHtml(sh)}` : ""}</div>
                    <div>${qty != null ? `Qty: ${qty}` : ""}</div>
                  </div>
                </div>
              `;
            })
            .join("")}
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
  $("#btnBack")?.addEventListener("click", goBack);
}
/* =========================================================
   PreCheck — public/app.js (FULL)
   PART 6 / 6  (FINAL)

   Includes:
   - Manager Home / Login / Edit Items / Categories / Add Item
   - Download Log (CSV)
   - Logout
   - Utils (must be last)

   FIXES INCLUDED (without changing your UI):
   ✅ Fix: "staff already save not cleared" by clearing drafts on new session start
   ✅ Fix: expiry popup rollback styles actually applied (call ensureExpiryPopupRollbackStyles)
   ✅ Fix: refreshCategoryProgressUI typo causing silent crash
   ✅ Fix: cssEsc safer for dataset selectors
   ========================================================= */

/* =========================================================
   ✅ FIX: Clear drafts properly when staff changes / new session starts
   - Called after Start button success
   ========================================================= */
function clearDraftsForNewSession() {
  try {
    state.drafts = {};
    state.__draftsHydrated = false;
    saveDraftsToStorage(); // save empty for this store/shift/day key
  } catch {}
}

/* =========================================================
   ✅ FIX: Expiry popup rollback styles must be applied
   ========================================================= */


/* =========================================================
   MANAGER HOME
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
        <div class="sub">CSV export</div>
      </button>
    </div>
  `;

  $("#btnBack")?.addEventListener("click", goBack);
  $("#tAdd")?.addEventListener("click", () => openAddItemModal());
  $("#tEdit")?.addEventListener("click", () => setView({ page: "managerEditItems" }, true));
  $("#tCats")?.addEventListener("click", () => setView({ page: "managerCategories" }, true));
  $("#tLog")?.addEventListener("click", () => openDownloadLogModal());
}

/* =========================================================
   MANAGER LOGIN
   ========================================================= */
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

  $("#pinCancel")?.addEventListener("click", () => {
    closeModal();
    goBack();
  });

  $("#pinBtn")?.addEventListener("click", async () => {
    const pin = String($("#pinInp")?.value || "").trim();
    if (!pin) return toast("Enter PIN");

    showSaving("Logging in…");
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
    } finally {
      hideSaving();
    }
  });
}

/* =========================================================
   MANAGER: EDIT ITEMS (with Saving overlay)
   ========================================================= */
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
  $("#btnBack")?.addEventListener("click", goBack);

  const token = state.session.managerToken;
  let items = [];

  showSaving("Loading items…");
  try {
    items = await apiGet(`/api/manager/items?store=${encodeURIComponent(state.session.store)}`, token);
  } catch (e) {
    console.error(e);
    toast("Failed loading items");
  } finally {
    hideSaving();
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
        <div class="card">
          <div style="font-weight:1200; font-size:18px; margin-bottom:10px">${escapeHtml(cat)}</div>
          <div class="col" style="gap:10px">
            ${list
              .sort((a, b) => String(a.name).localeCompare(String(b.name)))
              .map(managerItemRow)
              .join("")}
          </div>
        </div>
      `;
    }

    const wrap = $("#mgrList");
    if (!wrap) return;
    wrap.innerHTML = html;

    $$(".mgrRow", wrap).forEach((row) => {
      const id = row.dataset.id;
      const toggle = $(`[data-toggle="${cssEsc(id)}"]`, row);
      const panel = $(`[data-panel="${cssEsc(id)}"]`, row);
      const save = $(`[data-save="${cssEsc(id)}"]`, row);
      const del = $(`[data-del="${cssEsc(id)}"]`, row);

      toggle?.addEventListener("click", () => {
        panel?.classList.toggle("hidden");
        if (toggle) toggle.textContent = panel?.classList.contains("hidden") ? "Edit" : "Close";
      });

      save?.addEventListener("click", async () => {
        const catSel = $(`[data-cat="${cssEsc(id)}"]`, row);
        const subSel = $(`[data-sub="${cssEsc(id)}"]`, row);
        const lifeInp = $(`[data-life="${cssEsc(id)}"]`, row);
        const hourlyChk = $(`[data-hourly="${cssEsc(id)}"]`, row);

        const category = String(catSel?.value || "").trim();
        const sub_category = String(subSel?.value || "").trim() || null;
        const shelf_life_days = Number(lifeInp?.value || 0);
        const is_hourly = !!hourlyChk?.checked;

        showSaving("Saving…");
        try {
          await apiPatch(
            `/api/manager/items/${id}`,
            { store: state.session.store, category, sub_category, shelf_life_days, is_hourly },
            token
          );
          toast("Saved ✅");
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Save failed");
        } finally {
          hideSaving();
        }
      });

      del?.addEventListener("click", async () => {
        if (!confirm("Delete this item?")) return;

        showSaving("Deleting…");
        try {
          await apiDel(
            `/api/manager/items/${id}?store=${encodeURIComponent(state.session.store)}`,
            token
          );
          toast("Deleted ✅");
          items = items.filter((x) => String(x.id) !== String(id));
          renderList($("#mgrSearch")?.value);
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Delete failed");
        } finally {
          hideSaving();
        }
      });
    });
  };

  $("#mgrSearch")?.addEventListener("input", (e) => renderList(e.target.value));
  renderList("");
}

function managerItemRow(it) {
  const id = String(it.id);
  const cats = (state.data.categories || []).map((c) => c.name);

  const catOpts = cats
    .map(
      (c) =>
        `<option value="${escapeHtml(c)}"${c === it.category ? " selected" : ""}>${escapeHtml(c)}</option>`
    )
    .join("");

  const subOpts = [`<option value="">(none)</option>`]
    .concat(
      SAUCE_SUBS.map(
        (s) =>
          `<option value="${escapeHtml(s.name)}"${
            normalizeSub(it.sub_category || "") === s.name ? " selected" : ""
          }>${escapeHtml(s.name)}</option>`
      )
    )
    .join("");

  return `
    <div class="mgrRow" data-id="${escapeHtml(id)}" style="border:1px solid var(--line);border-radius:16px;padding:12px">
      <div class="row" style="justify-content:space-between">
        <div style="font-weight:1200">${escapeHtml(it.name)}</div>
        <button class="btn btn-ghost" data-toggle="${escapeHtml(id)}" type="button">Edit</button>
      </div>
      <div class="muted" style="margin-top:8px;font-weight:1000">
        ${escapeHtml(it.category)} • ${escapeHtml(it.shelf_life_days)} day
      </div>

      <div class="hidden" data-panel="${escapeHtml(id)}" style="margin-top:12px">
        <div class="col">
          <div style="font-weight:1200">Category</div>
          <select class="select" data-cat="${escapeHtml(id)}">${catOpts}</select>

          <div style="font-weight:1200">Sauce Sub-category</div>
          <select class="select" data-sub="${escapeHtml(id)}">${subOpts}</select>

          <div style="font-weight:1200">Shelf life (days)</div>
          <input class="input" type="number" min="0" data-life="${escapeHtml(id)}" value="${escapeHtml(it.shelf_life_days)}">

          <label style="display:flex;gap:10px;align-items:center;margin-top:6px;font-weight:1200">
            <input type="checkbox" data-hourly="${escapeHtml(id)}" ${it.is_hourly ? "checked" : ""}>
            Hourly expiry (time only)
          </label>

          <div class="row">
            <button class="btn btn-yellow" data-save="${escapeHtml(id)}" type="button" style="flex:1">Save</button>
            <button class="btn btn-red" data-del="${escapeHtml(id)}" type="button" style="flex:1">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   MANAGER: CATEGORIES (with Saving overlay)
   ========================================================= */
async function renderManagerCategories() {
  if (!state.session.isManager) return openManagerLogin();

  const main = $("#main");
  let cats = [];

  showSaving("Loading categories…");
  try {
    cats = await apiGet(
      `/api/manager/categories?store=${encodeURIComponent(state.session.store)}`,
      state.session.managerToken
    );
  } catch (e) {
    console.error(e);
    toast("Failed loading categories");
  } finally {
    hideSaving();
  }

  const tiles = cats
    .filter((c) => c.is_active !== false)
    .map((c, idx) => {
      const tone = tileToneFor(c.name);
      return `
        <button class="tile ${tone}" style="min-height:100px;animation-delay:${idx * 45}ms"
          data-cid="${c.id}" data-cname="${escapeHtml(c.name)}" type="button">
          <div class="title" style="font-size:20px">${escapeHtml(c.name)}</div>
          <div class="sub">Tap to edit</div>
        </button>
      `;
    })
    .join("");

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Categories</div>
    </div>

    <div class="tiles-2col">${tiles}</div>

    <button id="addCat" class="btn btn-blue" style="width:100%">➕ Add Category</button>
  `;

  $("#btnBack")?.addEventListener("click", goBack);

  $$(".tile", main).forEach((b) => {
    b.addEventListener("click", () => openEditCategoryModal(b.dataset.cid, b.dataset.cname));
  });

  $("#addCat")?.addEventListener("click", openAddCategoryModal);
}

function openAddCategoryModal() {
  openModal(
    "Add Category",
    `
      <div class="card">
        <div class="col">
          <div style="font-weight:1200">Name</div>
          <input id="catName" class="input" placeholder="Category name">
          <div style="font-weight:1200">Sort order</div>
          <input id="catSort" class="input" type="number" value="100">
          <button id="catSave" class="btn btn-yellow" style="width:100%">Save</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#catSave")?.addEventListener("click", async () => {
    const name = String($("#catName")?.value || "").trim();
    const sort_order = Number($("#catSort")?.value || 100);
    if (!name) return toast("Name required");

    showSaving("Saving…");
    try {
      await apiPost(
        "/api/manager/categories",
        { store: state.session.store, name, sort_order },
        state.session.managerToken
      );
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    } finally {
      hideSaving();
    }
  });
}

function openEditCategoryModal(id, currentName) {
  openModal(
    "Edit Category",
    `
      <div class="card">
        <div class="col">
          <div style="font-weight:1200">Name</div>
          <input id="catName" class="input" value="${escapeHtml(currentName)}">
          <div style="font-weight:1200">Active</div>
          <select id="catActive" class="select">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          <button id="catSave" class="btn btn-yellow" style="width:100%">Save</button>
          <button id="catDelete" class="btn btn-red" style="width:100%">Delete</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#catSave")?.addEventListener("click", async () => {
    const name = String($("#catName")?.value || "").trim();
    const is_active = $("#catActive")?.value === "true";
    if (!name) return toast("Name required");

    showSaving("Saving…");
    try {
      await apiPatch(
        `/api/manager/categories/${id}`,
        { store: state.session.store, name, is_active, sort_order: 100 },
        state.session.managerToken
      );
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    } finally {
      hideSaving();
    }
  });

  $("#catDelete")?.addEventListener("click", async () => {
    if (!confirm("Delete this category?")) return;

    showSaving("Deleting…");
    try {
      await apiDel(
        `/api/manager/categories/${id}?store=${encodeURIComponent(state.session.store)}`,
        state.session.managerToken
      );
      toast("Deleted ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Delete failed");
    } finally {
      hideSaving();
    }
  });
}

/* =========================================================
   MANAGER: ADD ITEM MODAL (with Saving overlay)
   ========================================================= */
function openAddItemModal() {
  const cats = (state.data.categories || []).map((c) => c.name);
  const catOpts = cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  const subOpts = [`<option value="">(none)</option>`]
    .concat(SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`))
    .join("");

  openModal(
    "Add Item",
    `
      <div class="card">
        <div class="col">
          <div style="font-weight:1200">Item name</div>
          <input id="itName" class="input" placeholder="e.g. Beef Brisket">

          <div style="font-weight:1200">Category</div>
          <select id="itCat" class="select">${catOpts}</select>

          <div style="font-weight:1200">Sauce Sub-category</div>
          <select id="itSub" class="select">${subOpts}</select>

          <div style="font-weight:1200">Shelf life (days)</div>
          <input id="itLife" class="input" type="number" min="0" value="0">

          <label style="display:flex;gap:10px;align-items:center;margin-top:6px;font-weight:1200">
            <input id="itHourly" type="checkbox">
            Hourly expiry (time only)
          </label>

          <button id="itSave" class="btn btn-yellow" style="width:100%">Save</button>
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
    const is_hourly = !!$("#itHourly")?.checked;

    if (!name || !category) return toast("Missing name/category");

    showSaving("Saving…");
    try {
      await apiPost(
        "/api/manager/items",
        { store: state.session.store, name, category, sub_category, shelf_life_days, is_hourly },
        state.session.managerToken
      );
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    } finally {
      hideSaving();
    }
  });
}

/* =========================================================
   DOWNLOAD LOG (Manager) + CSV
   ========================================================= */
function openDownloadLogModal() {
  openModal(
    "Download Log",
    `
      <div class="card">
        <div style="font-weight:1200;font-size:18px;margin-bottom:10px">Export (CSV)</div>

        <div class="muted" style="font-weight:1100;margin-bottom:12px">
          Choose date range. Export includes AM + PM.
        </div>

        <div class="col" style="gap:10px">
          <div style="font-weight:1200">From</div>
          <button id="dlFromBtn" class="btn btn-yellow" style="width:100%">Pick date</button>
          <div id="dlFromShow" class="muted" style="font-weight:1100">Not set</div>

          <div style="font-weight:1200;margin-top:8px">To</div>
          <button id="dlToBtn" class="btn btn-yellow" style="width:100%">Pick date</button>
          <div id="dlToShow" class="muted" style="font-weight:1100">Not set</div>

          <div class="row" style="gap:12px;margin-top:14px">
            <button id="dlCancel" class="btn btn-yellow" style="flex:1">Cancel</button>
            <button id="dlGo" class="btn" style="flex:1;background:var(--green);color:#fff;border:0">Download</button>
          </div>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  const memKey = "__dl_range__";
  if (!state[memKey]) {
    const t = todayISO();
    state[memKey] = { from: addDaysISO(t, -7), to: t };
  }

  const redraw = () => {
    $("#dlFromShow").textContent = state[memKey].from ? formatLongDMY(state[memKey].from) : "Not set";
    $("#dlToShow").textContent = state[memKey].to ? formatLongDMY(state[memKey].to) : "Not set";
  };
  redraw();

  $("#dlFromBtn")?.addEventListener("click", () => {
    openDateWheelModal({
      title: "From date",
      initialISO: state[memKey].from || todayISO(),
      minISO: todayISO(),
      maxISO: "2100-12-31",
      onPick: (iso) => {
        state[memKey].from = iso;
        redraw();
      },
    });
  });

  $("#dlToBtn")?.addEventListener("click", () => {
    openDateWheelModal({
      title: "To date",
      initialISO: state[memKey].to || todayISO(),
      minISO: todayISO(),
      maxISO: "2100-12-31",
      onPick: (iso) => {
        state[memKey].to = iso;
        redraw();
      },
    });
  });

  $("#dlCancel")?.addEventListener("click", closeModal);

  $("#dlGo")?.addEventListener("click", async () => {
    const from = state[memKey].from;
    const to = state[memKey].to;
    if (!from || !to) return toast("Pick From + To");
    if (from > to) return toast("From cannot be after To");

    try {
      showSaving("Preparing download…");
      await downloadManagerLogCSV({ from, to });
      closeModal();
    } catch (e) {
      console.error(e);
      toast("Download failed");
    } finally {
      hideSaving();
    }
  });
}

async function downloadManagerLogCSV({ from, to }) {
  const store = state.session.store;
  const token = state.session.managerToken || "";
  if (!token) return toast("Manager login required");

  const url = `/api/manager/log/export.csv?store=${encodeURIComponent(store)}&from=${encodeURIComponent(
    from
  )}&to=${encodeURIComponent(to)}`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());

  const blob = await r.blob();
  const filename = `PreCheck_${store}_log_${from}_to_${to}.csv`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);

  toast("Download started ✅");
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
  saveSession();

  state.data.categories = [];
  state.data.items = [];
  state.drafts = {};
  state.__draftsHydrated = false;
  state.navStack = [];
  state.view = { page: "login", category: null, sauceSub: null, summaryMode: null, bucket: null };

  renderRolePill();
  render();
}

/* =========================================================
   ✅ FIX: refreshCategoryProgressUI typo safeguard
   ========================================================= */
function safeRefreshCategoryProgress(items, cat) {
  try {
    if (typeof refreshCategoryProgressUI === "function") refreshCategoryProgressUI(items, cat);
  } catch {}
}

/* =========================================================
   UTILS (must be last)
   ========================================================= */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function cssEsc(s) {
  // safer for selectors
  return String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
function enforceArray(v) {
  return Array.isArray(v) ? v : [];
}

/* =========================================================
   QTY UX helpers
   ========================================================= */
function haptic(ms = 12) {
  try {
    if (navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {}
}
function pulseBtn(btn) {
  if (!btn) return;
  btn.classList.remove("pulse");
  void btn.offsetWidth;
  btn.classList.add("pulse");
}
function updateQtyUI(root, key) {
  const d = state.drafts[key] || { qty: 0 };
  const dec = $(`[data-dec="${cssEsc(key)}"]`, root);
  const qty = $(`[data-qty="${cssEsc(key)}"]`, root);

  const q = Math.max(0, Number(d.qty) || 0);
  d.qty = q;
  if (qty) qty.value = String(q);

  if (dec) {
    const disabled = q <= 0;
    dec.disabled = disabled;
    dec.classList.toggle("is-disabled", disabled);
  }
}

/* =========================================================
   ✅ PATCH: Apply fixes to existing flows without redesign
   - Hook into login start to clear old staff drafts
   - Ensure expiry popup style is applied
   ========================================================= */
(function applyFinalPatches() {
  // apply popup styles once


  // patch Start button handler: clear drafts after session set
  // (Your renderLoginPage already attaches startBtn listener; we hook by event delegation)
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("#startBtn");
    if (!btn) return;

    // Let your existing code run first, then clear drafts after session is saved
    setTimeout(() => {
      // if session is valid, clear drafts for new staff/store/shift/day
      if (state.session?.store && state.session?.staff) {
        clearDraftsForNewSession();
      }
    }, 50);
  });
})();
