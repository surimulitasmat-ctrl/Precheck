/* =========================================================
   PreCheck - public/app.js (FULL FILE)
   - Subway UI (green/white/yellow), bottom nav
   - Staff session: Store + Shift + Staff
   - Home category tiles (color + emoji icons)
   - Sauce: Sauce -> Sandwich Unit / Standby / Open Inner -> items
   - Item log: optional Qty, required expiry depending on rules
   - Expiry modes:
       AUTO: date dropdown (N+1 options: Today..Today+N), required
       MANUAL_DATE: date picker (date only), required
       EOD: auto set 23:59 today, no user input
       HOURLY: time dropdown (past allowed), required
       HOURLY_FIXED: fixed time dropdown 11am/3pm/7pm/11pm, required
     Special:
       - Unopened chiller = MANUAL_DATE always
       - shelf_life_days > 7 => MANUAL_DATE
       - Cajun Spice Open Inner = AUTO (5 days dropdown, today..today+5)
       - Chicken Bacon (C) = EOD ONLY (thawing Chicken Bacon stays normal)
       - Beef Taco (H) exists ONLY for SKH under Front counter; mode HOURLY
   - Alerts page separate
   - Manager login (PIN), manager badge (red), staff badge (blue)
   - Manager: view/edit/add/delete items + manage categories list (local)
   - Swipe-back inside app (left edge swipe)
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* -------------------- Utils -------------------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}
function toTitle(s) {
  const t = String(s ?? "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseYMD(ymd) {
  const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
function formatDatePretty(d) {
  // "24 May 2026"
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = d.getDate();
  const mm = months[d.getMonth()];
  const yy = d.getFullYear();
  return `${dd} ${mm} ${yy}`;
}
function clampInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/* -------------------- DOM -------------------- */
const main = $("#main");

const sessionPill = $("#sessionPill");
const btnHome = $("#btnHome");
const btnAlerts = $("#btnAlerts");
const btnLogout = $("#btnLogout");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

// Bottom nav (from your index.html)
const bottomNav = $("#bottomNav");
const navHome = $("#navHome");
const navAlerts = $("#navAlerts");
const navManager = $("#navManager");

/* -------------------- State -------------------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  items: [],
  alerts: [],
  view: { page: "session", category: null, sauceSub: null },
  selectedItem: null,
  // local categories (for manager add/delete category UI)
  customCategories: [],
  // one-time session popup guard
  didSessionPopup: false,
};

/* -------------------- Constants -------------------- */
const BASE_CATEGORIES = [
  "Prepared items",
  "Unopened chiller",
  "Thawing",
  "Vegetables",
  "Backroom",
  "Back counter",
  "Front counter",
  "Back counter chiller",
  "Sauce",
];

const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];

// Home tile meta (emoji icons + tones)
const TILE_META = {
  "Prepared items": { tone: "green", icon: "🥪" },
  "Unopened chiller": { tone: "blue", icon: "🧊" },
  "Thawing": { tone: "cyan", icon: "❄️" },
  "Vegetables": { tone: "lime", icon: "🥬" },
  "Backroom": { tone: "orange", icon: "📦" },
  "Back counter": { tone: "yellow", icon: "🧂" },
  "Front counter": { tone: "red", icon: "🧾" },
  "Back counter chiller": { tone: "teal", icon: "🧀" },
  "Sauce": { tone: "purple", icon: "🧴" },
};

const MANAGER_PIN_DEFAULT = "8686";

/* -------------------- Modal -------------------- */
function hasModal() {
  return !!(modalBackdrop && modalTitleEl && modalBodyEl);
}
function openModal(title, bodyHtml) {
  if (!hasModal()) {
    alert(title || "Notice");
    return;
  }
  modalTitleEl.textContent = title || " ";
  modalBodyEl.innerHTML = bodyHtml || "";
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
}
function closeModal() {
  if (!hasModal()) return;
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  modalBodyEl.innerHTML = "";
}
modalCloseBtn?.addEventListener("click", closeModal);
modalBackdrop?.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

/* -------------------- Manager token -------------------- */
function getManagerToken() {
  return localStorage.getItem("managerToken") || "";
}
function setManagerToken(token) {
  if (token) localStorage.setItem("managerToken", token);
  else localStorage.removeItem("managerToken");
}
function isManagerMode() {
  return !!getManagerToken();
}

/* -------------------- Session persistence -------------------- */
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") {
      state.session.store = s.store || "";
      state.session.shift = s.shift || "";
      state.session.staff = s.staff || "";
    }
  } catch {}
}
function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}

/* -------------------- Categories persistence -------------------- */
function loadCustomCategories() {
  try {
    const arr = JSON.parse(localStorage.getItem("customCategories") || "[]");
    if (Array.isArray(arr)) state.customCategories = arr.map((x) => String(x)).filter(Boolean);
  } catch {
    state.customCategories = [];
  }
}
function saveCustomCategories() {
  localStorage.setItem("customCategories", JSON.stringify(state.customCategories));
}

/* -------------------- API helpers -------------------- */
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return await res.json();
}
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}
async function apiManager(method, url, body) {
  const token = getManagerToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setManagerToken("");
    updateTopbar();
    updateSessionPill();
    toast("Manager session expired.");
    state.view = { page: "home", category: null, sauceSub: null };
    render();
    throw new Error("unauthorized");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* -------------------- Top UI (badges, nav) -------------------- */
function badgeHtml(text, bg) {
  return `
    <span style="
      display:inline-flex;align-items:center;gap:6px;
      padding:4px 10px;border-radius:999px;
      font-size:12px;font-weight:950;color:#fff;background:${bg};
      box-shadow:0 6px 14px rgba(0,0,0,0.12);
      ">
      ${escapeHtml(text)}
    </span>
  `;
}

function updateSessionPill() {
  if (!sessionPill) return;

  const store = state.session.store || "";
  const shift = state.session.shift || "";
  const staff = state.session.staff || "";

  const staffBadge = badgeHtml("STAFF", "#1E88E5"); // blue
  const managerBadge = isManagerMode() ? badgeHtml("MANAGER", "#E53935") : ""; // red

  const parts = [];
  if (store) parts.push(store);
  if (shift) parts.push(shift);
  if (staff) parts.push(staff);

  sessionPill.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
      ${managerBadge}${staffBadge}
    </div>
    <div style="font-weight:1000;font-size:16px">${escapeHtml(parts.join(" • ") || "No session yet")}</div>
  `;
  sessionPill.classList.remove("hidden");
}

function setActiveNav(page) {
  navHome?.classList.toggle("active", page === "home");
  navAlerts?.classList.toggle("active", page === "alerts");
  navManager?.classList.toggle("active", page === "manager");
}

function updateTopbar() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  // topbar buttons
  btnHome?.classList.toggle("hidden", !hasSession);
  btnAlerts?.classList.toggle("hidden", !hasSession);

  if (btnLogout) {
    btnLogout.textContent = isManagerMode() ? "Exit Manager" : "Logout";
    // show logout if session exists OR manager exists
    btnLogout.classList.toggle("hidden", !hasSession && !isManagerMode());
  }

  // bottom nav only when session exists
  bottomNav?.classList.toggle("hidden", !hasSession);
}

function bindTopButtonsOnce() {
  if (btnLogout && btnLogout.dataset.bound === "1") return;
  if (btnHome) btnHome.dataset.bound = "1";
  if (btnAlerts) btnAlerts.dataset.bound = "1";
  if (btnLogout) btnLogout.dataset.bound = "1";

  btnHome?.addEventListener("click", () => {
    state.view = { page: "home", category: null, sauceSub: null };
    pushNavState();
    render();
  });

  btnAlerts?.addEventListener("click", () => {
    state.view = { page: "alerts", category: null, sauceSub: null };
    pushNavState();
    render();
  });

  btnLogout?.addEventListener("click", () => {
    if (isManagerMode()) {
      if (!confirm("Exit manager mode?")) return;
      setManagerToken("");
      state.view = { page: "home", category: null, sauceSub: null };
      pushNavState();
      render();
      return;
    }
    if (!confirm("Logout staff session?")) return;
    state.session = { store: "", shift: "", staff: "" };
    saveSession();
    state.didSessionPopup = false;
    state.view = { page: "session", category: null, sauceSub: null };
    pushNavState();
    render();
  });

  // bottom nav
  if (navHome && navHome.dataset.bound !== "1") {
    navHome.dataset.bound = "1";
    navHome.addEventListener("click", () => {
      state.view = { page: "home", category: null, sauceSub: null };
      pushNavState();
      render();
    });
  }

  if (navAlerts && navAlerts.dataset.bound !== "1") {
    navAlerts.dataset.bound = "1";
    navAlerts.addEventListener("click", () => {
      state.view = { page: "alerts", category: null, sauceSub: null };
      pushNavState();
      render();
    });
  }

  if (navManager && navManager.dataset.bound !== "1") {
    navManager.dataset.bound = "1";
    navManager.addEventListener("click", () => {
      if (isManagerMode()) {
        state.view = { page: "manager", category: null, sauceSub: null };
        pushNavState();
        render();
      } else {
        openManagerLogin();
      }
    });
  }
}

/* -------------------- Navigation + swipe-back -------------------- */
function pushNavState() {
  // Keep a shallow history for in-app back
  const page = state.view?.page || "home";
  const payload = {
    page,
    category: state.view.category || null,
    sauceSub: state.view.sauceSub || null,
    t: Date.now(),
  };
  try {
    history.pushState(payload, "", location.pathname);
  } catch {}
}

window.addEventListener("popstate", () => {
  // In-app back
  goBackWithinApp();
});

// Edge swipe back (left edge swipe)
let touchStartX = 0;
let touchStartY = 0;
let trackingSwipe = false;

document.addEventListener(
  "touchstart",
  (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    trackingSwipe = touchStartX < 22; // left edge only
  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (!trackingSwipe || !e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = Math.abs(t.clientY - touchStartY);

    // horizontal swipe threshold
    if (dx > 70 && dy < 30) {
      trackingSwipe = false;
      confirmBeforeExitOrBack();
    }
  },
  { passive: true }
);

function confirmBeforeExitOrBack() {
  // If we can go back inside app, do it without exit
  const canBack = canGoBackInsideApp();
  if (canBack) {
    goBackWithinApp();
    return;
  }

  // If at top level, confirm (prevents accidental close)
  openModal(
    "Exit?",
    `
      <div class="muted" style="margin-bottom:12px">
        You are at the start. Do you want to exit?
      </div>
      <div style="display:flex;gap:10px">
        <button id="exitNo" class="btn btn-ghost" type="button">Stay</button>
        <button id="exitYes" class="btn btn-primary" type="button">Exit</button>
      </div>
    `
  );

  $("#exitNo")?.addEventListener("click", closeModal);
  $("#exitYes")?.addEventListener("click", () => {
    closeModal();
    // attempt to close - may be blocked by browser; fallback: go to blank
    try {
      window.close();
    } catch {}
  });
}

function canGoBackInsideApp() {
  const p = state.view?.page;
  if (p === "session") return false;
  if (p === "home") return false;
  return true;
}

function goBackWithinApp() {
  const p = state.view?.page;

  if (p === "category") {
    if (norm(state.view.category) === "sauce") {
      state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
    } else {
      state.view = { page: "home", category: null, sauceSub: null };
    }
    render();
    return;
  }

  if (p === "sauce_menu") {
    state.view = { page: "home", category: null, sauceSub: null };
    render();
    return;
  }

  if (p === "alerts" || p === "manager") {
    state.view = { page: "home", category: null, sauceSub: null };
    render();
    return;
  }

  if (p === "item_form") {
    // item form returns to list
    const { category, sauceSub } = state.selectedItem || {};
    state.view = { page: "category", category: category || "Prepared items", sauceSub: sauceSub || null };
    render();
    return;
  }
}

/* -------------------- Data normalization -------------------- */
function canonicalCategory(cat) {
  const raw = String(cat ?? "").trim();
  const n = norm(raw);

  // map variants
  if (n === "prepared items" || n === "prepared item") return "Prepared items";
  if (n === "unopened chiller") return "Unopened chiller";
  if (n === "backroom") return "Backroom";
  if (n === "back counter") return "Back counter";
  if (n === "front counter") return "Front counter";
  if (n === "back counter chiller") return "Back counter chiller";
  if (n === "vegetables") return "Vegetables";
  if (n === "thawing") return "Thawing";
  if (n === "sauce" || n === "sauces") return "Sauce";

  // fallback: title the raw
  return raw || "Unknown";
}

function normalizeItem(it) {
  const out = { ...it };
  out.id = Number(it.id);
  out.name = String(it.name ?? "").trim();
  out.category = canonicalCategory(it.category);
  out.sub_category = it.sub_category ?? null;
  out.shelf_life_days = clampInt(it.shelf_life_days, 0);
  return out;
}

/* -------------------- Expiry Modes (RULES) -------------------- */
// Always manual date-only items (name normalized)
const MANUAL_ALWAYS = new Set(
  [
    "canola oil",
    "salt open inner",
    "pepper open inner",
    "olive open bottle",
    "parmesan oregano",
    "shallot",
    "honey oat",
    "parmesan open inner",
    "shallot open inner",
    "honey oat open inner",
    "salt",
    "pepper",
    "cookies",
    "olive oil",
    "milo",
    "tea bag",
  ].map(norm)
);

const HOURLY_FIXED_ITEMS = new Set([norm("Bread"), norm("Tomato Soup (H)"), norm("Mushroom Soup (H)")]);

// If you still keep a generic EOD list, keep it empty except Chicken Bacon (C) below
const EOD_ITEMS = new Set([]);

// HOURLY (non-fixed) items list (optional) — we mainly use Beef Taco (H) rule
const HOURLY_ITEMS = new Set([]);

// Shelf life override
function getShelfLifeDays(item) {
  // Cajun Spice Open Inner must be 5 days dropdown even if DB is 0
  if (norm(item.name) === norm("Cajun Spice Open Inner")) return 5;
  return clampInt(item.shelf_life_days, 0);
}

// IMPORTANT: Chicken Bacon (C) only, not thawing Chicken Bacon
function isChickenBaconC(item) {
  return norm(item.name) === norm("Chicken Bacon (C)");
}

function isBeefTacoH(item) {
  // match "Beef Taco (H)" (common variants)
  const n = norm(item.name);
  return n === norm("Beef Taco (H)") || n === "beef taco h" || n === "beef taco (h)";
}

function getMode(item) {
  const cat = canonicalCategory(item.category);
  const nameN = norm(item.name);

  // Chicken Bacon (C) -> EOD
  if (isChickenBaconC(item)) return "EOD";

  // Unopened chiller always manual date-only
  if (norm(cat) === norm("Unopened chiller")) return "MANUAL_DATE";

  // Always manual list
  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

  // Cajun Spice Open Inner AUTO (5 days)
  if (nameN === norm("Cajun Spice Open Inner")) return "AUTO";

  // Fixed time dropdown
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  // Any other EOD items (if you add later)
  if (EOD_ITEMS.has(nameN)) return "EOD";

  // Beef Taco (H) is HOURLY (SKH only display handled in filtering)
  if (norm(cat) === norm("Front counter") && isBeefTacoH(item)) return "HOURLY";

  // extra HOURLY list if needed
  if (HOURLY_ITEMS.has(nameN)) return "HOURLY";

  // shelf life > 7 => manual date
  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE";

  // default AUTO
  return "AUTO";
}

function getHelperText(item) {
  const mode = getMode(item);
  if (mode === "AUTO") return "Select an expiry date (dropdown)";
  if (mode === "MANUAL_DATE") return "Select an expiry date";
  if (mode === "EOD") return "Expiry will be end of day (23:59)";
  if (mode === "HOURLY") return "Select an expiry time";
  if (mode === "HOURLY_FIXED") return "Select 11am / 3pm / 7pm / 11pm";
  return "";
}

/* -------------------- Build dropdown options -------------------- */
function buildAutoDateOptions(item) {
  const sl = getShelfLifeDays(item);
  // AUTO: N+1 options including today
  const base = parseYMD(todayYMD());
  const out = [];
  for (let i = 0; i <= sl; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    out.push({ value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, label: formatDatePretty(d) });
  }
  return out;
}

function buildHourlyOptions() {
  // 30 min increments; past allowed
  const out = [];
  for (let h = 0; h < 24; h++) {
    out.push(`${pad2(h)}:00`);
    out.push(`${pad2(h)}:30`);
  }
  return out;
}

function buildHourlyFixedOptions() {
  return [
    { value: "11:00", label: "11:00 AM" },
    { value: "15:00", label: "3:00 PM" },
    { value: "19:00", label: "7:00 PM" },
    { value: "23:00", label: "11:00 PM" },
  ];
}

/* -------------------- Items filtering -------------------- */
function getAllCategories() {
  // Base categories + any custom categories (manager)
  const merged = [...BASE_CATEGORIES];
  for (const c of state.customCategories) {
    if (!merged.some((x) => norm(x) === norm(c))) merged.push(c);
  }
  return merged;
}

function getItemsForList(category, sauceSub) {
  const store = state.session.store;

  let list = state.items
    .map(normalizeItem)
    .filter((it) => norm(it.category) === norm(category));

  // Sauce sub filter
  if (norm(category) === "sauce") {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }

  // SKH-only Beef Taco (H): must never appear in PDD
  list = list.filter((it) => {
    if (isBeefTacoH(it) && norm(it.category) === norm("Front counter")) {
      return norm(store) === "skh";
    }
    return true;
  });

  // sort by name
  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

/* -------------------- Load data -------------------- */
async function loadItems() {
  const rows = await apiGet("/api/items");
  state.items = Array.isArray(rows) ? rows.map(normalizeItem) : [];
}
async function loadAlerts() {
  const store = state.session.store;
  if (!store) {
    state.alerts = [];
    return;
  }
  const rows = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
  state.alerts = Array.isArray(rows) ? rows : [];
}

/* -------------------- Session start popup -------------------- */
function maybeShowSessionPopup() {
  if (state.didSessionPopup) return;
  if (!(state.session.store && state.session.shift && state.session.staff)) return;

  state.didSessionPopup = true;

  openModal(
    "PLEASE check expiry day for the items below",
    `
      <div class="muted" style="margin-bottom:12px">
        Please double-check these items before continuing:
      </div>
      <ol style="margin:0 0 14px 18px; padding:0; font-weight:900; line-height:1.7">
        <li>Liquid Egg</li>
        <li>Flatbread Thawing</li>
        <li>Mc&cheese</li>
        <li>Chicken Bacon (C)</li>
        <li>Avocado</li>
        <li>Mix Green</li>
        <li>Lettuce</li>
      </ol>
      <button id="popupOk" class="btn btn-primary" type="button" style="width:100%">OK</button>
    `
  );

  $("#popupOk")?.addEventListener("click", closeModal);
}

/* -------------------- Manager login / logout -------------------- */
function openManagerLogin() {
  openModal(
    "Manager Login",
    `
      <div class="field">
        <label class="label">PIN</label>
        <input id="mgrPin" class="input" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter PIN" />
        <div class="helper">Default PIN is ${MANAGER_PIN_DEFAULT} (if your server uses MANAGER_PIN env).</div>
      </div>

      <div id="mgrErr" class="error hidden"></div>

      <div style="display:flex;gap:10px">
        <button id="mgrCancel" class="btn btn-ghost" type="button" style="flex:1">Cancel</button>
        <button id="mgrLogin" class="btn btn-primary" type="button" style="flex:1">Login</button>
      </div>
    `
  );

  $("#mgrCancel")?.addEventListener("click", closeModal);

  $("#mgrLogin")?.addEventListener("click", async () => {
    const pin = $("#mgrPin")?.value?.trim() || "";
    const err = $("#mgrErr");
    if (err) {
      err.textContent = "";
      err.classList.add("hidden");
    }
    try {
      const out = await apiPost("/api/manager/login", { pin });
      setManagerToken(out.token || "");
      closeModal();
      state.view = { page: "manager", category: null, sauceSub: null };
      pushNavState();
      render();
      toast("Manager mode enabled");
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Login failed";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Login failed");
      }
    }
  });

  setTimeout(() => $("#mgrPin")?.focus(), 50);
}

/* -------------------- Render helpers -------------------- */
function renderSession() {
  updateTopbar();
  updateSessionPill();

  main.innerHTML = `
    <div class="card">
      <div class="h1">Start Session</div>
      <div class="muted">Select your store, shift, and staff name.</div>

      <div class="field">
        <label class="label">Store</label>
        <select id="storeSel" class="input">
          <option value="">Select…</option>
          <option value="PDD">PDD</option>
          <option value="SKH">SKH</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Shift</label>
        <select id="shiftSel" class="input">
          <option value="">Select…</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Staff</label>
        <input id="staffInput" class="input" placeholder="Your name / ID" />
      </div>

      <div id="sessErr" class="error hidden"></div>

      <button id="startBtn" class="btn btn-primary" type="button" style="width:100%;margin-top:8px">
        Start
      </button>

      <div class="helper" style="margin-top:12px">
        Tip: Manager can login anytime from bottom nav.
      </div>
    </div>
  `;

  const storeSel = $("#storeSel");
  const shiftSel = $("#shiftSel");
  const staffInput = $("#staffInput");
  const err = $("#sessErr");

  storeSel.value = state.session.store || "";
  shiftSel.value = state.session.shift || "";
  staffInput.value = state.session.staff || "";

  $("#startBtn")?.addEventListener("click", async () => {
    const store = storeSel.value;
    const shift = shiftSel.value;
    const staff = staffInput.value.trim();

    if (!store || !shift || !staff) {
      err.textContent = "Please fill Store, Shift, and Staff.";
      err.classList.remove("hidden");
      return;
    }

    state.session = { store, shift, staff };
    saveSession();
    err.classList.add("hidden");

    try {
      await loadItems();
    } catch (e) {
      err.textContent = "Cannot load items. Check server.";
      err.classList.remove("hidden");
      return;
    }

    state.view = { page: "home", category: null, sauceSub: null };
    pushNavState();
    render();
  });
}

function computeCategoryCounts() {
  const counts = {};
  const cats = getAllCategories();
  for (const c of cats) counts[c] = 0;

  const store = state.session.store;

  for (const raw of state.items) {
    const it = normalizeItem(raw);
    // ignore SKH-only Beef Taco (H) for PDD
    if (isBeefTacoH(it) && norm(it.category) === norm("Front counter") && norm(store) !== "skh") continue;

    const cat = it.category;
    if (!counts[cat]) counts[cat] = 0;
    counts[cat] += 1;
  }

  // Sauce counts should represent total sauce items (not sub-counts)
  return counts;
}

function renderHome() {
  updateTopbar();
  updateSessionPill();
  setActiveNav("home");

  const cats = getAllCategories();
  const counts = computeCategoryCounts();

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>

      <section class="grid tiles-grid">
        ${cats
          .map((cat) => {
            const meta = TILE_META[cat] || { tone: "green", icon: "✅" };
            const count = counts[cat] ?? 0;
            return `
              <button class="tile tile--${meta.tone}" data-cat="${escapeHtml(cat)}" type="button">
                <div class="tile-top">
                  <div class="tile-icon" aria-hidden="true">${meta.icon}</div>
                </div>
                <div class="tile-title">${escapeHtml(cat)}</div>
                <div class="tile-sub">${count} item${count === 1 ? "" : "s"}</div>
              </button>
            `;
          })
          .join("")}
      </section>
    </section>
  `;

  // simple appear animation
  $$(".tile", main).forEach((t, i) => {
    t.style.opacity = "0";
    t.style.transform = "translateY(10px)";
    setTimeout(() => {
      t.style.transition = "all 300ms ease";
      t.style.opacity = "1";
      t.style.transform = "translateY(0)";
    }, 40 + i * 45);
  });

  $$("[data-cat]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (norm(cat) === "sauce") {
        state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
      } else {
        state.view = { page: "category", category: cat, sauceSub: null };
      }
      pushNavState();
      render();
    });
  });

  // show session popup once after session started
  maybeShowSessionPopup();
}

function renderSauceMenu() {
  updateTopbar();
  updateSessionPill();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid">
      ${SAUCE_SUBS.map(
        (s) => `
          <button class="tile tile--purple" data-sauce="${escapeHtml(s)}" type="button">
            <div class="tile-top">
              <div class="tile-icon" aria-hidden="true">🧴</div>
            </div>
            <div class="tile-title">${escapeHtml(s)}</div>
            <div class="tile-sub">Tap to open</div>
          </button>
        `
      ).join("")}
    </section>
  `;

  $("#backBtn")?.addEventListener("click", () => {
    state.view = { page: "home", category: null, sauceSub: null };
    pushNavState();
    render();
  });

  $$("[data-sauce]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sauce");
      state.view = { page: "category", category: "Sauce", sauceSub: sub };
      pushNavState();
      render();
    });
  });
}

function renderCategoryList() {
  updateTopbar();
  updateSessionPill();

  const category = state.view.category;
  const sauceSub = state.view.sauceSub;
  const title = norm(category) === "sauce" ? `Sauce • ${sauceSub}` : category;

  const list = getItemsForList(category, sauceSub);

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title || "")}</div>
    </div>

    <section class="list">
      ${
        list.length
          ? list
              .map(
                (it) => `
                  <button class="list-row" data-item-id="${it.id}" type="button">
                    <div class="list-row-main">
                      <div class="list-row-title">${escapeHtml(it.name)}</div>
                      <div class="list-row-sub">${escapeHtml(getHelperText(it))}</div>
                    </div>
                    <div class="chev">›</div>
                  </button>
                `
              )
              .join("")
          : `<div class="empty">No items found.</div>`
      }
    </section>
  `;

  $("#backBtn")?.addEventListener("click", () => {
    if (norm(category) === "sauce") {
      state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
    } else {
      state.view = { page: "home", category: null, sauceSub: null };
    }
    pushNavState();
    render();
  });

  $$("[data-item-id]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-item-id"));
      const it = state.items.map(normalizeItem).find((x) => x.id === id);
      if (!it) return;

      // store list context to go back correctly
      state.selectedItem = { ...it, category: category, sauceSub: sauceSub || null };
      state.view = { page: "item_form", category, sauceSub: sauceSub || null };
      pushNavState();
      render();
    });
  });
}

function renderItemForm() {
  updateTopbar();
  updateSessionPill();

  const it = normalizeItem(state.selectedItem || {});
  const mode = getMode(it);

  const helper = getHelperText(it);

  // Build expiry UI based on mode
  let expiryBlockHtml = "";

  if (mode === "AUTO") {
    const opts = buildAutoDateOptions(it);
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry date</label>
        <select id="expirySelect" class="input">
          <option value="">Select date…</option>
          ${opts.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
        <div class="helper">${escapeHtml(helper)}</div>
      </div>
    `;
  } else if (mode === "MANUAL_DATE") {
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry date</label>
        <input id="expiryDate" class="input" type="date" />
        <div class="helper">${escapeHtml(helper)}</div>
      </div>
    `;
  } else if (mode === "EOD") {
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry</label>
        <div class="pill">
          End of day (23:59)
        </div>
        <div class="helper">${escapeHtml(helper)}</div>
      </div>
    `;
  } else if (mode === "HOURLY") {
    const times = buildHourlyOptions();
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry time</label>
        <select id="expiryTime" class="input">
          <option value="">Select time…</option>
          ${times.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <div class="helper">${escapeHtml(helper)} (past time allowed)</div>
      </div>
    `;
  } else if (mode === "HOURLY_FIXED") {
    const fixed = buildHourlyFixedOptions();
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry time</label>
        <select id="expiryFixed" class="input">
          <option value="">Select time…</option>
          ${fixed.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
        <div class="helper">${escapeHtml(helper)} (past time allowed)</div>
      </div>
    `;
  }

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">${escapeHtml(it.name || "")}</div>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(it.name || "")}</div>
      <div class="muted" style="margin-top:-6px">${escapeHtml(canonicalCategory(it.category))}${it.sub_category ? ` • ${escapeHtml(it.sub_category)}` : ""}</div>

      <div class="field">
        <label class="label">Quantity (optional)</label>
        <input id="qtyInput" class="input" inputmode="numeric" placeholder="Leave blank if not counting" />
        <div class="helper">Blank allowed. 0 allowed. Quantity will never block save.</div>
      </div>

      ${expiryBlockHtml}

      <div id="formErr" class="error hidden"></div>

      <button id="saveBtn" class="btn btn-primary" type="button" style="width:100%;margin-top:6px">
        Save
      </button>
    </div>
  `;

  $("#backBtn")?.addEventListener("click", () => {
    state.view = { page: "category", category: state.view.category, sauceSub: state.view.sauceSub };
    pushNavState();
    render();
  });

  $("#saveBtn")?.addEventListener("click", async () => {
    const err = $("#formErr");
    if (err) {
      err.textContent = "";
      err.classList.add("hidden");
    }

    // Quantity optional: allow blank
    const qtyRaw = $("#qtyInput")?.value ?? "";
    const qtyVal = String(qtyRaw).trim() === "" ? null : Number(qtyRaw);

    // Determine expiry payload
    let expiryISO = null;

    if (mode === "AUTO") {
      const ymd = $("#expirySelect")?.value || "";
      if (!ymd) return showErr(err, "Expiry required.");
      const d = parseYMD(ymd);
      // default to end of day? NO: keep date-only but store as ISO at 00:00 (safe)
      expiryISO = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
    }

    if (mode === "MANUAL_DATE") {
      const ymd = $("#expiryDate")?.value || "";
      if (!ymd) return showErr(err, "Expiry required.");
      const d = parseYMD(ymd);
      expiryISO = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
    }

    if (mode === "EOD") {
      const now = new Date();
      expiryISO = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0).toISOString();
    }

    if (mode === "HOURLY") {
      const t = $("#expiryTime")?.value || "";
      if (!t) return showErr(err, "Expiry required.");
      const base = new Date();
      const [hh, mm] = t.split(":").map((x) => Number(x));
      expiryISO = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh || 0, mm || 0, 0, 0).toISOString();
    }

    if (mode === "HOURLY_FIXED") {
      const t = $("#expiryFixed")?.value || "";
      if (!t) return showErr(err, "Expiry required.");
      const base = new Date();
      const [hh, mm] = t.split(":").map((x) => Number(x));
      expiryISO = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh || 0, mm || 0, 0, 0).toISOString();
    }

    const payload = {
      item_id: it.id,
      item_name: it.name,
      category: canonicalCategory(it.category),
      sub_category: it.sub_category || null,
      store: state.session.store,
      shift: state.session.shift,
      staff: state.session.staff,
      qty: qtyVal,
      expiry_at: expiryISO,
      created_at: new Date().toISOString(),
    };

    try {
      await apiPost("/api/log", payload);
      toast("Saved");
      // return to list
      state.view = { page: "category", category: state.view.category, sauceSub: state.view.sauceSub };
      pushNavState();
      render();
    } catch (e) {
      showErr(err, e?.message || "Save failed.");
    }
  });
}

function showErr(el, msg) {
  if (!el) {
    alert(msg);
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

/* -------------------- Alerts -------------------- */
function isSoon(expiryText) {
  // optional helper
  return !!expiryText;
}

function renderAlerts() {
  updateTopbar();
  updateSessionPill();
  setActiveNav("alerts");

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>

    <div class="card">
      <div class="card-title">Expiry Alerts</div>
      <div class="muted">Store: ${escapeHtml(state.session.store || "")}</div>

      <div style="margin-top:12px" id="alertsBox">
        <div class="muted">Loading…</div>
      </div>

      <button id="refreshAlerts" class="btn btn-primary" type="button" style="width:100%;margin-top:12px">
        Refresh
      </button>
    </div>
  `;

  $("#backBtn")?.addEventListener("click", () => {
    state.view = { page: "home", category: null, sauceSub: null };
    pushNavState();
    render();
  });

  async function fill() {
    const box = $("#alertsBox");
    try {
      await loadAlerts();
      const rows = state.alerts || [];

      if (!rows.length) {
        box.innerHTML = `<div class="muted">No expiry alerts found.</div>`;
        return;
      }

      box.innerHTML = `
        <div>
          ${rows
            .map((r) => {
              const name = r.name ?? r.item_name ?? "";
              const exp = r.expiry_value ?? r.expiry_at ?? r.expiry ?? "";
              const cat = canonicalCategory(r.category);
              const sub = r.sub_category ? ` • ${r.sub_category}` : "";
              return `
                <div class="alert-row">
                  <div>
                    <div class="alert-name">${escapeHtml(name)}</div>
                    <div class="alert-extra">${escapeHtml(cat + sub)}</div>
                  </div>
                  <div class="alert-extra">${escapeHtml(String(exp))}</div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    } catch (e) {
      box.innerHTML = `<div class="error">Failed: ${escapeHtml(e?.message || "error")}</div>`;
    }
  }

  $("#refreshAlerts")?.addEventListener("click", fill);
  fill();
}

/* -------------------- Manager page -------------------- */
async function managerFetchItems() {
  // try new manager endpoint; if missing show friendly error
  try {
    const rows = await apiManager("GET", "/api/manager/items");
    return Array.isArray(rows) ? rows.map(normalizeItem) : [];
  } catch (e) {
    throw e;
  }
}

function renderManager() {
  updateTopbar();
  updateSessionPill();
  setActiveNav("manager");

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="card">
      <div class="card-title">Manager Controls</div>
      <div class="muted">
        You can edit items now. Add/Delete items requires server routes.
      </div>

      <div style="display:flex;gap:10px;margin-top:12px">
        <button id="mgrExit" class="btn btn-ghost" type="button" style="flex:1">Exit Manager</button>
        <button id="mgrRefresh" class="btn btn-primary" type="button" style="flex:1">Refresh</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Categories</div>
      <div class="muted">These categories are for home tiles + item creation.</div>

      <div id="catList" style="margin-top:10px"></div>

      <div style="display:flex;gap:10px;margin-top:12px">
        <button id="addCat" class="btn btn-primary" type="button" style="flex:1">Add Category</button>
        <button id="resetCats" class="btn btn-ghost" type="button" style="flex:1">Reset</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div class="muted">Tap an item to edit. Add/Delete needs API routes.</div>

      <div style="display:flex;gap:10px;margin-top:12px">
        <button id="addItem" class="btn btn-primary" type="button" style="flex:1">Add Item</button>
        <button id="delItem" class="btn btn-ghost" type="button" style="flex:1">Delete Item</button>
      </div>

      <div id="mgrErr" class="error hidden" style="margin-top:10px"></div>
      <div id="mgrBox" style="margin-top:12px"><div class="muted">Loading…</div></div>
    </div>
  `;

  $("#backBtn")?.addEventListener("click", () => {
    state.view = { page: "home", category: null, sauceSub: null };
    pushNavState();
    render();
  });

  $("#mgrExit")?.addEventListener("click", () => {
    if (!confirm("Exit manager mode?")) return;
    setManagerToken("");
    state.view = { page: "home", category: null, sauceSub: null };
    pushNavState();
    render();
  });

  $("#mgrRefresh")?.addEventListener("click", () => {
    fillManagerItems();
    fillManagerCategories();
  });

  $("#addCat")?.addEventListener("click", () => {
    const name = prompt("New category name:");
    if (!name) return;
    if (BASE_CATEGORIES.some((c) => norm(c) === norm(name)) || state.customCategories.some((c) => norm(c) === norm(name))) {
      alert("Category already exists.");
      return;
    }
    state.customCategories.push(name.trim());
    saveCustomCategories();
    fillManagerCategories();
    toast("Category added");
  });

  $("#resetCats")?.addEventListener("click", () => {
    if (!confirm("Reset custom categories?")) return;
    state.customCategories = [];
    saveCustomCategories();
    fillManagerCategories();
  });

  $("#addItem")?.addEventListener("click", () => openAddItemModal());
  $("#delItem")?.addEventListener("click", () => openDeleteItemModal());

  async function fillManagerCategories() {
    const el = $("#catList");
    const cats = getAllCategories();

    el.innerHTML = `
      <div class="list">
        ${cats
          .map((c) => {
            const isBase = BASE_CATEGORIES.some((b) => norm(b) === norm(c));
            return `
              <div class="list-row" style="cursor:default">
                <div class="list-row-main">
                  <div class="list-row-title">${escapeHtml(c)}</div>
                  <div class="list-row-sub">${isBase ? "Built-in" : "Custom"}</div>
                </div>
                ${
                  isBase
                    ? `<div class="muted">—</div>`
                    : `<button class="btn btn-ghost" data-del-cat="${escapeHtml(c)}" type="button">Delete</button>`
                }
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="helper">Deleting a category only removes it from tiles. Items in DB keep their category text.</div>
    `;

    $$("[data-del-cat]", el).forEach((b) => {
      b.addEventListener("click", () => {
        const c = b.getAttribute("data-del-cat");
        if (!confirm(`Delete category "${c}"?`)) return;
        state.customCategories = state.customCategories.filter((x) => norm(x) !== norm(c));
        saveCustomCategories();
        fillManagerCategories();
        toast("Category deleted");
      });
    });
  }

  async function fillManagerItems() {
    const box = $("#mgrBox");
    const err = $("#mgrErr");
    err.classList.add("hidden");
    err.textContent = "";

    box.innerHTML = `<div class="muted">Loading…</div>`;

    try {
      const rows = await managerFetchItems();
      // show short list UI
      box.innerHTML = `
        <section class="list">
          ${rows
            .map(
              (it) => `
            <button class="list-row" data-mid="${it.id}" type="button">
              <div class="list-row-main">
                <div class="list-row-title">${escapeHtml(it.name)}</div>
                <div class="list-row-sub">
                  ${escapeHtml(canonicalCategory(it.category))}
                  ${it.sub_category ? ` • ${escapeHtml(it.sub_category)}` : ""}
                  • shelf ${escapeHtml(String(it.shelf_life_days))}
                </div>
              </div>
              <div class="chev">›</div>
            </button>
          `
            )
            .join("")}
        </section>
      `;

      $$("[data-mid]", box).forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.getAttribute("data-mid"));
          const it = rows.find((x) => x.id === id);
          if (!it) return;
          openEditItemModal(it);
        });
      });
    } catch (e) {
      err.textContent = `Failed to load manager items: ${e?.message || "error"}`;
      err.classList.remove("hidden");
      box.innerHTML = `<div class="muted">—</div>`;
    }
  }

  function openEditItemModal(it) {
    const cats = getAllCategories();

    openModal(
      "Edit Item",
      `
      <div class="field">
        <label class="label">Name</label>
        <input id="eName" class="input" value="${escapeHtml(it.name)}" />
      </div>

      <div class="field">
        <label class="label">Category</label>
        <select id="eCat" class="input">
          ${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label class="label">Sub-category (optional)</label>
        <input id="eSub" class="input" value="${escapeHtml(it.sub_category || "")}" placeholder="e.g. Sandwich Unit / Standby / Open Inner" />
      </div>

      <div class="field">
        <label class="label">Shelf life days</label>
        <input id="eSL" class="input" inputmode="numeric" value="${escapeHtml(String(it.shelf_life_days ?? 0))}" />
        <div class="helper">If > 7, app forces manual date. AUTO uses dropdown (today..today+N).</div>
      </div>

      <div id="eErr" class="error hidden"></div>

      <div style="display:flex;gap:10px">
        <button id="eCancel" class="btn btn-ghost" type="button" style="flex:1">Cancel</button>
        <button id="eSave" class="btn btn-primary" type="button" style="flex:1">Save</button>
      </div>
      `
    );

    $("#eCat").value = canonicalCategory(it.category);

    $("#eCancel")?.addEventListener("click", closeModal);

    $("#eSave")?.addEventListener("click", async () => {
      const err = $("#eErr");
      err.classList.add("hidden");
      err.textContent = "";

      const name = $("#eName")?.value?.trim() || "";
      const category = $("#eCat")?.value || "";
      const sub_category = ($("#eSub")?.value || "").trim() || null;
      const shelf_life_days = clampInt($("#eSL")?.value, 0);

      if (!name || !category) {
        err.textContent = "Name and Category required.";
        err.classList.remove("hidden");
        return;
      }

      try {
        await apiManager("PATCH", `/api/manager/items/${it.id}`, { name, category, sub_category, shelf_life_days });
        closeModal();
        toast("Updated");
        // reload public items too (so staff sees changes)
        await loadItems();
        fillManagerItems();
      } catch (e) {
        err.textContent = e?.message || "Update failed";
        err.classList.remove("hidden");
      }
    });
  }

  function openAddItemModal() {
    const cats = getAllCategories();

    openModal(
      "Add Item",
      `
      <div class="muted" style="margin-bottom:10px">
        Requires server route: <b>POST /api/manager/items</b>
      </div>

      <div class="field">
        <label class="label">Name</label>
        <input id="aName" class="input" placeholder="Item name" />
      </div>

      <div class="field">
        <label class="label">Category</label>
        <select id="aCat" class="input">
          ${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label class="label">Sub-category (optional)</label>
        <input id="aSub" class="input" placeholder="For Sauce: Sandwich Unit / Standby / Open Inner" />
      </div>

      <div class="field">
        <label class="label">Shelf life days</label>
        <input id="aSL" class="input" inputmode="numeric" value="0" />
      </div>

      <div id="aErr" class="error hidden"></div>

      <div style="display:flex;gap:10px">
        <button id="aCancel" class="btn btn-ghost" type="button" style="flex:1">Cancel</button>
        <button id="aSave" class="btn btn-primary" type="button" style="flex:1">Add</button>
      </div>
      `
    );

    $("#aCancel")?.addEventListener("click", closeModal);

    $("#aSave")?.addEventListener("click", async () => {
      const err = $("#aErr");
      err.classList.add("hidden");
      err.textContent = "";

      const name = $("#aName")?.value?.trim() || "";
      const category = $("#aCat")?.value || "";
      const sub_category = ($("#aSub")?.value || "").trim() || null;
      const shelf_life_days = clampInt($("#aSL")?.value, 0);

      if (!name || !category) {
        err.textContent = "Name and Category required.";
        err.classList.remove("hidden");
        return;
      }

      if (!confirm(`Add item "${name}"?`)) return;

      try {
        await apiManager("POST", `/api/manager/items`, { name, category, sub_category, shelf_life_days });
        closeModal();
        toast("Added");
        await loadItems();
        fillManagerItems();
      } catch (e) {
        err.textContent =
          (e?.message || "Add failed") +
          (String(e?.message || "").includes("404") ? " (Server route missing: POST /api/manager/items)" : "");
        err.classList.remove("hidden");
      }
    });
  }

  function openDeleteItemModal() {
    openModal(
      "Delete Item",
      `
      <div class="muted" style="margin-bottom:10px">
        Requires server route: <b>DELETE /api/manager/items/:id</b>
      </div>

      <div class="field">
        <label class="label">Item ID</label>
        <input id="dId" class="input" inputmode="numeric" placeholder="Enter item id" />
        <div class="helper">Tip: open an item in the list to see its ID in the URL/console, or copy from Supabase.</div>
      </div>

      <div id="dErr" class="error hidden"></div>

      <div style="display:flex;gap:10px">
        <button id="dCancel" class="btn btn-ghost" type="button" style="flex:1">Cancel</button>
        <button id="dGo" class="btn btn-primary" type="button" style="flex:1">Delete</button>
      </div>
      `
    );

    $("#dCancel")?.addEventListener("click", closeModal);

    $("#dGo")?.addEventListener("click", async () => {
      const err = $("#dErr");
      err.classList.add("hidden");
      err.textContent = "";

      const id = clampInt($("#dId")?.value, 0);
      if (!id) {
        err.textContent = "Enter a valid item ID.";
        err.classList.remove("hidden");
        return;
      }

      if (!confirm(`Delete item id ${id}? This cannot be undone.`)) return;

      try {
        await apiManager("DELETE", `/api/manager/items/${id}`);
        closeModal();
        toast("Deleted");
        await loadItems();
        fillManagerItems();
      } catch (e) {
        err.textContent =
          (e?.message || "Delete failed") +
          (String(e?.message || "").includes("404") ? " (Server route missing: DELETE /api/manager/items/:id)" : "");
        err.classList.remove("hidden");
      }
    });
  }

  // initial fill
  fillManagerCategories();
  fillManagerItems();
}

/* -------------------- Main Render -------------------- */
function render() {
  bindTopButtonsOnce();
  updateTopbar();
  updateSessionPill();

  // nav highlight
  setActiveNav(state.view.page);

  // ensure items loaded when needed
  const needsSession = state.view.page !== "session";
  if (needsSession && !(state.session.store && state.session.shift && state.session.staff)) {
    state.view = { page: "session", category: null, sauceSub: null };
  }

  const p = state.view.page;

  if (p === "session") return renderSession();
  if (p === "home") return renderHome();
  if (p === "sauce_menu") return renderSauceMenu();
  if (p === "category") return renderCategoryList();
  if (p === "item_form") return renderItemForm();
  if (p === "alerts") return renderAlerts();
  if (p === "manager") return renderManager();

  // fallback
  state.view = { page: "home", category: null, sauceSub: null };
  renderHome();
}

/* -------------------- Boot -------------------- */
async function boot() {
  loadSession();
  loadCustomCategories();

  // Default route
  if (state.session.store && state.session.shift && state.session.staff) {
    try {
      await loadItems();
      state.view = { page: "home", category: null, sauceSub: null };
    } catch {
      state.view = { page: "session", category: null, sauceSub: null };
    }
  } else {
    state.view = { page: "session", category: null, sauceSub: null };
  }

  // initial history state
  try {
    history.replaceState({ page: state.view.page, t: Date.now() }, "", location.pathname);
  } catch {}

  render();
}

boot();
