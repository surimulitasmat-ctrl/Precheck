/* PreCheck public/app.js (single-file, safe copy/paste)
   - Subway colors (uses your style.css)
   - Bottom nav: Home / Alerts / Manager
   - Manager PIN login + logout manager mode
   - Manager can: Add/Edit/Delete items, Rename categories, Move items out of category, Delete category (with confirmation)
   - Expiry rules: AUTO dropdown (N+1), MANUAL date-only, EOD, HOURLY, HOURLY_FIXED
   - Sauce menu: 2-level (Sauce -> sub -> items)
   - Swipe right = Back with confirmation guard
*/

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatDateLabel(d) {
  // "24 May 2026"
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" }); // May
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}
function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}
function toast(msg) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast hidden";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 1700);
}

/* ---------- DOM ---------- */
const main = $("#main");

const sessionPill = $("#sessionPill");
const btnHomeTop = $("#btnHome");
const btnAlertsTop = $("#btnAlerts");
const btnLogoutTop = $("#btnLogout");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

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
if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
}

/* ---------- Bottom Nav (create if missing) ---------- */
function ensureBottomNav() {
  let nav = $("#bottomNav");
  if (nav) return nav;

  nav = document.createElement("nav");
  nav.id = "bottomNav";
  nav.className = "bottom-nav hidden";
  nav.innerHTML = `
    <button id="navHome" class="bottom-tab" type="button">Home</button>
    <button id="navAlerts" class="bottom-tab" type="button">Alerts</button>
    <button id="navManager" class="bottom-tab" type="button">Manager</button>
  `;
  document.body.appendChild(nav);
  return nav;
}
ensureBottomNav();

const navHome = $("#navHome");
const navAlerts = $("#navAlerts");
const navManager = $("#navManager");
const bottomNav = $("#bottomNav");

/* ---------- Anim CSS injection (tiles float-in) ---------- */
(function injectAnimCss() {
  if ($("#precheckAnimStyle")) return;
  const style = document.createElement("style");
  style.id = "precheckAnimStyle";
  style.textContent = `
    .tile-anim { opacity:0; transform: translateY(10px); animation: tileIn .45s ease-out forwards; }
    @keyframes tileIn { to { opacity:1; transform: translateY(0); } }
  `;
  document.head.appendChild(style);
})();

/* ---------- Storage ---------- */
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") return s;
  } catch {}
  return { store: "", shift: "", staff: "" };
}
function saveSession(session) {
  localStorage.setItem("session", JSON.stringify(session));
}

/* ---------- Manager token ---------- */
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

/* ---------- API helpers ---------- */
async function apiGet(url) {
  const res = await fetch(url);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}
async function apiManager(method, url, body) {
  const token = getManagerToken();
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch {}

  if (res.status === 401) {
    setManagerToken("");
    updateTopAndNav();
    toast("Manager session expired. Please login again.");
    throw new Error("unauthorized");
  }

  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* ---------- App state ---------- */
const state = {
  session: loadSession(),
  items: [],
  alerts: [],
  view: { page: "session", category: null, sauceSub: null }, // pages: session, home, sauce_menu, category, alerts, manager
  onceSessionPopupShown: false,
};

/* ---------- Categories ---------- */
const CATEGORIES = [
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

/* ---------- Tile metadata (emoji icons, different colors) ---------- */
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

/* ---------- Canonical category ---------- */
function canonicalCategory(cat) {
  const n = norm(cat);
  if (n === "sauces") return "Sauce";
  const hit = CATEGORIES.find((c) => norm(c) === n);
  return hit || String(cat || "").trim();
}

/* ---------- Shelf life ---------- */
function getShelfLifeDays(item) {
  const raw = Number(item?.shelf_life_days ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return raw;
}

/* ---------- Expiry mode rules ---------- */
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
    "cajun spice packet",
  ].map(norm)
);

const HOURLY_FIXED_ITEMS = new Set(
  ["bread", "tomato soup (h)", "mushroom soup (h)"].map(norm)
);

function getMode(item) {
  const cat = canonicalCategory(item.category);
  const nameN = norm(item.name);

  // Chicken Bacon (C) ONLY → EOD
  if (nameN === norm("Chicken Bacon (C)") || nameN === norm("Chicken Bacon (c)")) return "EOD";

  // Unopened chiller always manual date-only
  if (norm(cat) === norm("Unopened chiller")) return "MANUAL_DATE";

  // Always manual list
  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

  // Cajun Spice Open Inner AUTO 5 days
  if (nameN === norm("Cajun Spice Open Inner")) return "AUTO";

  // Fixed times
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  // Beef Taco (H) Front counter SKH-only should be HOURLY (time dropdown)
  if (norm(cat) === norm("Front counter") && (nameN === norm("Beef Taco (H)") || nameN === norm("Beef Taco (h)"))) {
    return "HOURLY";
  }

  // Shelf life > 7 => manual date
  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE";

  // Default AUTO
  return "AUTO";
}

/* ---------- Helper text (no big mode labels) ---------- */
function getHelperText(item) {
  const mode = getMode(item);
  const cat = canonicalCategory(item.category);
  const sl = getShelfLifeDays(item);

  if (mode === "EOD") return "Expiry will be set automatically to 23:59 today";
  if (mode === "HOURLY_FIXED") return "Select time: 11am / 3pm / 7pm / 11pm";
  if (mode === "HOURLY") return "Select a time (past time allowed)";
  if (mode === "MANUAL_DATE") {
    if (norm(cat) === norm("Unopened chiller")) return "Select an expiry date (manual)";
    if (sl > 7) return "Select an expiry date (manual)";
    return "Select an expiry date (manual)";
  }
  // AUTO
  return sl > 0 ? `Select expiry date from list (Today to +${sl} days)` : "Select expiry date from list";
}

/* ---------- Expiry inputs builders ---------- */
function buildAutoDateOptions(days) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  const opts = [];
  const N = Math.max(0, Number(days) || 0);

  for (let i = 0; i <= N; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    opts.push({
      value: `${ymd(d)}T23:59:00`,
      label: formatDateLabel(d),
    });
  }
  return opts;
}
function buildHourlyFixedOptions() {
  return [
    { label: "11:00 AM", value: "11:00" },
    { label: "3:00 PM", value: "15:00" },
    { label: "7:00 PM", value: "19:00" },
    { label: "11:00 PM", value: "23:00" },
  ];
}
function buildHourlyOptions() {
  const opts = [];
  // every 30 mins (00:00 to 23:30)
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      const hh = pad2(h);
      const mm = pad2(m);
      const label = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-GB", {
        hour: "numeric",
        minute: "2-digit",
      });
      opts.push({ label, value: `${hh}:${mm}` });
    }
  }
  return opts;
}

/* ---------- UI: badges ---------- */
function badgeHtml(text, bg) {
  return `
    <span style="
      display:inline-flex;
      align-items:center;
      padding:4px 10px;
      border-radius:999px;
      font-size:12px;
      font-weight:950;
      color:#fff;
      background:${bg};
      margin-right:8px;
    ">${escapeHtml(text)}</span>
  `;
}
function updateSessionPill() {
  if (!sessionPill) return;

  const s = state.session;
  const parts = [];
  if (s.store) parts.push(s.store);
  if (s.shift) parts.push(s.shift);
  if (s.staff) parts.push(s.staff);

  const staffBadge = badgeHtml("STAFF", "#1E88E5"); // blue
  const managerBadge = isManagerMode() ? badgeHtml("MANAGER", "#E53935") : ""; // red

  sessionPill.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:6px;">
      ${managerBadge}${staffBadge}
    </div>
    <div style="font-weight:1000;font-size:15px;letter-spacing:.2px">
      ${escapeHtml(parts.join(" • ") || "No session")}
    </div>
  `;
  sessionPill.classList.remove("hidden");
}

/* ---------- Top/Bottom nav visibility ---------- */
function setActiveNav(page) {
  if (!navHome || !navAlerts || !navManager) return;

  navHome.classList.toggle("active", page === "home" || page === "sauce_menu" || page === "category");
  navAlerts.classList.toggle("active", page === "alerts");
  navManager.classList.toggle("active", page === "manager");
}

function updateTopAndNav() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  if (btnHomeTop) btnHomeTop.classList.toggle("hidden", !hasSession);
  if (btnAlertsTop) btnAlertsTop.classList.toggle("hidden", !hasSession);

  if (btnLogoutTop) {
    // When manager mode, this is "Exit Manager" OR "Logout" if not session
    btnLogoutTop.textContent = isManagerMode() ? "Exit Manager" : "Logout";
    btnLogoutTop.classList.toggle("hidden", !hasSession && !isManagerMode());
  }

  if (bottomNav) bottomNav.classList.toggle("hidden", !hasSession && !isManagerMode());

  // Manager tab visible only if session exists (so staff can enter manager)
  if (navManager) navManager.style.display = hasSession || isManagerMode() ? "" : "none";

  setActiveNav(state.view.page);
  updateSessionPill();
}

/* ---------- Navigation ---------- */
function go(page, extra = {}) {
  state.view = { page, category: null, sauceSub: null, ...extra };
  updateTopAndNav();
  render();
}
function goBack() {
  // back rules
  const p = state.view.page;
  if (p === "category") {
    if (norm(state.view.category) === "sauce") return go("sauce_menu");
    return go("home");
  }
  if (p === "sauce_menu") return go("home");
  if (p === "alerts") return go("home");
  if (p === "manager") return go("home");
  if (p === "home") {
    // home back: confirm (avoid accidental close)
    openConfirm("Exit app?", "If you go back, the browser may close this page.", () => {
      history.back();
    });
    return;
  }
  if (p === "session") {
    openConfirm("Exit app?", "If you go back, the browser may close this page.", () => {
      history.back();
    });
    return;
  }
  go("home");
}

/* ---------- Confirm modal ---------- */
function openConfirm(title, text, onYes) {
  openModal(
    title,
    `
    <div class="muted">${escapeHtml(text)}</div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button id="cNo" class="btn btn-ghost" type="button">Cancel</button>
      <button id="cYes" class="btn btn-primary" type="button">OK</button>
    </div>
  `
  );
  const no = $("#cNo");
  const yes = $("#cYes");
  if (no) no.addEventListener("click", closeModal);
  if (yes) yes.addEventListener("click", () => { closeModal(); onYes?.(); });
}

/* ---------- Swipe back (touch) + popstate guard ---------- */
function setupSwipeBack() {
  let startX = 0, startY = 0, moved = false;

  window.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    moved = false;
  }, { passive: true });

  window.addEventListener("touchmove", () => { moved = true; }, { passive: true });

  window.addEventListener("touchend", (e) => {
    if (!moved) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) {
        // swipe right = back
        goBack();
      }
    }
  }, { passive: true });

  // Prevent accidental browser back closing the app
  history.pushState({ precheck: true }, "");
  window.addEventListener("popstate", () => {
    // Ask before leaving
    openConfirm("Go back?", "Going back may close the app. Continue?", () => {
      // allow one step back
      history.back();
    });
    // re-arm
    history.pushState({ precheck: true }, "");
  });
}
setupSwipeBack();

/* ---------- Data loading ---------- */
async function loadItems() {
  const rows = await apiGet("/api/items");
  // normalize categories
  state.items = (rows || []).map((it) => ({
    ...it,
    category: canonicalCategory(it.category),
    sub_category: it.sub_category ?? null,
  }));
}
async function loadAlerts() {
  if (!state.session.store) return;
  state.alerts = await apiGet(`/api/expiry?store=${encodeURIComponent(state.session.store)}`);
}

/* ---------- Session start popup ---------- */
function showSessionStartPopupOnce() {
  if (state.onceSessionPopupShown) return;
  if (!(state.session.store && state.session.shift && state.session.staff)) return;

  state.onceSessionPopupShown = true;

  openModal(
    "PLEASE check expiry day for the items below",
    `
    <div class="card" style="box-shadow:none;border:0;padding:0;margin:0">
      <ol style="margin:0;padding-left:18px;line-height:1.6;font-weight:900;color:#14341f">
        <li>Liquid Egg</li>
        <li>Flatbread Thawing</li>
        <li>Mac N Cheese</li>
        <li>Chicken Bacon (C)</li>
        <li>Avocado</li>
        <li>Mix Green</li>
        <li>Lettuce</li>
      </ol>
      <div style="margin-top:14px">
        <button id="popupOk" class="btn btn-primary" type="button">OK</button>
      </div>
    </div>
    `
  );
  $("#popupOk")?.addEventListener("click", closeModal);
}

/* ---------- Manager login/logout ---------- */
function openManagerLogin() {
  openModal(
    "Manager Access",
    `
    <div class="field">
      <label class="label">PIN</label>
      <input id="mgrPin" class="input" type="password" inputmode="numeric" placeholder="Enter PIN" />
      <div id="mgrErr" class="error hidden"></div>
    </div>

    <div style="display:flex;gap:10px;margin-top:10px">
      <button id="mgrCancel" class="btn btn-ghost" type="button">Cancel</button>
      <button id="mgrLogin" class="btn btn-primary" type="button">Login</button>
    </div>
  `
  );

  $("#mgrCancel")?.addEventListener("click", closeModal);
  $("#mgrLogin")?.addEventListener("click", async () => {
    const pin = ($("#mgrPin")?.value || "").trim();
    const err = $("#mgrErr");
    if (err) { err.classList.add("hidden"); err.textContent = ""; }

    try {
      const out = await apiPost("/api/manager/login", { pin });
      setManagerToken(out.token || "");
      closeModal();
      go("manager");
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
}
function exitManagerMode() {
  openConfirm("Exit manager mode?", "You will return to staff mode.", () => {
    setManagerToken("");
    toast("Manager mode off");
    go("home");
  });
}

/* ---------- Logging ---------- */
async function saveLog({ item, qty, expiry_at }) {
  // qty optional: allow blank, 0 allowed
  const payload = {
    item_id: item.id,
    item_name: item.name,
    category: canonicalCategory(item.category),
    sub_category: item.sub_category ?? null,
    store: state.session.store,
    staff: state.session.staff,
    shift: state.session.shift,
    qty: qty === "" ? null : qty,
    expiry_at,
    created_at: new Date().toISOString(),
  };
  await apiPost("/api/log", payload);
}

/* ---------- Render: Session page ---------- */
function renderSession() {
  const s = state.session;

  main.innerHTML = `
    <div class="card">
      <div class="h1">Start Session</div>
      <div class="muted">Select Store, Shift and enter Staff name/ID.</div>

      <div class="field">
        <label class="label">Store</label>
        <select id="storeSel" class="input">
          <option value="" ${s.store ? "" : "selected"}>Select…</option>
          <option value="PDD" ${s.store === "PDD" ? "selected" : ""}>PDD</option>
          <option value="SKH" ${s.store === "SKH" ? "selected" : ""}>SKH</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Shift</label>
        <select id="shiftSel" class="input">
          <option value="" ${s.shift ? "" : "selected"}>Select…</option>
          <option value="AM" ${s.shift === "AM" ? "selected" : ""}>AM</option>
          <option value="PM" ${s.shift === "PM" ? "selected" : ""}>PM</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Staff</label>
        <input id="staffInp" class="input" placeholder="Name / ID" value="${escapeHtml(s.staff)}" />
      </div>

      <button id="startBtn" class="btn btn-primary" type="button" style="width:100%;margin-top:8px">Start</button>
      <div id="sessErr" class="error hidden"></div>

      <div style="margin-top:12px" class="muted">
        Tip: You can use Manager mode from the bottom “Manager” tab.
      </div>
    </div>
  `;

  $("#startBtn")?.addEventListener("click", async () => {
    const store = ($("#storeSel")?.value || "").trim();
    const shift = ($("#shiftSel")?.value || "").trim();
    const staff = ($("#staffInp")?.value || "").trim();
    const err = $("#sessErr");
    if (err) { err.classList.add("hidden"); err.textContent = ""; }

    if (!store || !shift || !staff) {
      if (err) { err.textContent = "Please select Store, Shift and enter Staff."; err.classList.remove("hidden"); }
      return;
    }

    state.session = { store, shift, staff };
    saveSession(state.session);

    // load items, go home
    try {
      await loadItems();
      go("home");
      showSessionStartPopupOnce();
    } catch (e) {
      if (err) { err.textContent = e?.message || "Failed to load items."; err.classList.remove("hidden"); }
    }
  });

  updateTopAndNav();
}

/* ---------- Render: Home ---------- */
function countByCategory() {
  const counts = {};
  for (const c of CATEGORIES) counts[c] = 0;

  state.items.forEach((it) => {
    const cat = canonicalCategory(it.category);
    if (counts[cat] == null) counts[cat] = 0;
    counts[cat]++;
  });
  return counts;
}

function renderHome() {
  const counts = countByCategory();

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>
      <section class="grid tiles-grid">
        ${CATEGORIES.map((cat, idx) => {
          const meta = TILE_META[cat] || { tone: "green", icon: "✅" };
          const count = counts[cat] ?? 0;
          return `
            <button class="tile tile--${meta.tone} tile-anim" style="animation-delay:${idx * 55}ms"
              data-cat="${escapeHtml(cat)}" type="button">
              <div class="tile-top">
                <div class="tile-icon" aria-hidden="true">${meta.icon}</div>
              </div>
              <div class="tile-title">${escapeHtml(cat)}</div>
              <div class="tile-sub">${count} item${count === 1 ? "" : "s"}</div>
            </button>
          `;
        }).join("")}
      </section>
    </section>
  `;

  $$("[data-cat]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "Sauce") go("sauce_menu", { category: "Sauce", sauceSub: null });
      else go("category", { category: cat, sauceSub: null });
    });
  });

  updateTopAndNav();
}

/* ---------- Render: Sauce menu ---------- */
function renderSauceMenu() {
  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid tiles-grid">
      ${SAUCE_SUBS.map((s, idx) => {
        const meta = { tone: "purple", icon: s === "Sandwich Unit" ? "🥪" : (s === "Standby" ? "🫙" : "🧴") };
        return `
          <button class="tile tile--${meta.tone} tile-anim" style="animation-delay:${idx * 55}ms"
            data-sauce="${escapeHtml(s)}" type="button">
            <div class="tile-top">
              <div class="tile-icon">${meta.icon}</div>
            </div>
            <div class="tile-title">${escapeHtml(s)}</div>
            <div class="tile-sub">Tap to open</div>
          </button>
        `;
      }).join("")}
    </section>
  `;

  $("#backBtn")?.addEventListener("click", () => goBack());

  $$("[data-sauce]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sauce");
      go("category", { category: "Sauce", sauceSub: sub });
    });
  });

  updateTopAndNav();
}

/* ---------- Items list for category ---------- */
function getItemsForCurrentList() {
  const cat = state.view.category;
  const sauceSub = state.view.sauceSub;

  let list = state.items
    .map((it) => ({
      ...it,
      category: canonicalCategory(it.category),
      sub_category: it.sub_category ?? null,
    }))
    .filter((it) => norm(it.category) === norm(cat));

  if (norm(cat) === "sauce") {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }

  // SKH-only: Beef Taco (H) must never appear for PDD (Front counter)
  if (norm(cat) === norm("Front counter") && state.session.store === "PDD") {
    list = list.filter((it) => norm(it.name) !== norm("Beef Taco (H)") && norm(it.name) !== norm("Beef Taco (h)"));
  }

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

function renderCategoryList() {
  const cat = state.view.category;
  const sauceSub = state.view.sauceSub;
  const title = norm(cat) === "sauce" ? `Sauce • ${sauceSub}` : cat;

  const list = getItemsForCurrentList();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <section class="list">
      ${
        list.length
          ? list.map((it) => `
            <button class="list-row" data-item-id="${it.id}" type="button">
              <div class="list-row-main">
                <div class="list-row-title">${escapeHtml(it.name)}</div>
                <div class="list-row-sub">${escapeHtml(getHelperText(it))}</div>
              </div>
              <div class="chev">›</div>
            </button>
          `).join("")
          : `<div class="empty">No items found.</div>`
      }
    </section>
  `;

  $("#backBtn")?.addEventListener("click", () => goBack());
  $$("[data-item-id]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-item-id"));
      const it = state.items.find((x) => Number(x.id) === id);
      if (it) openItemForm(it);
    });
  });

  updateTopAndNav();
}

/* ---------- Item Form ---------- */
function openItemForm(item) {
  const mode = getMode(item);
  const sl = getShelfLifeDays(item);

  let expiryBlockHtml = "";
  if (mode === "EOD") {
    expiryBlockHtml = `
      <div class="pill">
        <div style="font-weight:950">Expiry</div>
        <div class="muted">Auto: today 23:59</div>
      </div>
    `;
  } else if (mode === "AUTO") {
    const options = buildAutoDateOptions(sl);
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry Date</label>
        <select id="expAuto" class="input">
          <option value="" selected>Select…</option>
          ${options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
        <div class="helper">${escapeHtml(getHelperText(item))}</div>
      </div>
    `;
  } else if (mode === "MANUAL_DATE") {
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry Date</label>
        <input id="expManualDate" class="input" type="date" />
        <div class="helper">${escapeHtml(getHelperText(item))}</div>
      </div>
    `;
  } else if (mode === "HOURLY_FIXED") {
    const options = buildHourlyFixedOptions();
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry Time</label>
        <select id="expTime" class="input">
          <option value="" selected>Select…</option>
          ${options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
        <div class="helper">${escapeHtml(getHelperText(item))}</div>
      </div>
    `;
  } else if (mode === "HOURLY") {
    const options = buildHourlyOptions();
    expiryBlockHtml = `
      <div class="field">
        <label class="label">Expiry Time</label>
        <select id="expTime" class="input">
          <option value="" selected>Select…</option>
          ${options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
        <div class="helper">${escapeHtml(getHelperText(item))}</div>
      </div>
    `;
  }

  openModal(
    item.name,
    `
    <div class="modal-item-title">${escapeHtml(item.name)}</div>
    <div class="muted" style="margin-bottom:10px">${escapeHtml(getHelperText(item))}</div>

    <div class="field">
      <label class="label">Quantity (optional)</label>
      <input id="qty" class="input" inputmode="numeric" placeholder="Leave blank if not needed" />
      <div class="helper">Blank allowed • 0 allowed</div>
    </div>

    ${expiryBlockHtml}

    <div id="formErr" class="error hidden"></div>

    <div style="display:flex;gap:10px;margin-top:12px">
      <button id="cancelBtn" class="btn btn-ghost" type="button">Cancel</button>
      <button id="saveBtn" class="btn btn-primary" type="button" style="flex:1">Save</button>
    </div>
    `
  );

  $("#cancelBtn")?.addEventListener("click", closeModal);

  $("#saveBtn")?.addEventListener("click", async () => {
    const err = $("#formErr");
    if (err) { err.classList.add("hidden"); err.textContent = ""; }

    const qtyRaw = ($("#qty")?.value ?? "").trim();
    const qty = qtyRaw; // keep string; server will insert if column exists (optional)

    let expiry_at = null;

    if (mode === "EOD") {
      const d = new Date();
      d.setHours(23, 59, 0, 0);
      expiry_at = d.toISOString();
    } else if (mode === "AUTO") {
      const v = ($("#expAuto")?.value || "").trim();
      if (!v) {
        if (err) { err.textContent = "Expiry required."; err.classList.remove("hidden"); }
        return;
      }
      expiry_at = new Date(v).toISOString();
    } else if (mode === "MANUAL_DATE") {
      const dStr = ($("#expManualDate")?.value || "").trim();
      if (!dStr) {
        if (err) { err.textContent = "Expiry required."; err.classList.remove("hidden"); }
        return;
      }
      const d = new Date(`${dStr}T23:59:00`);
      expiry_at = d.toISOString();
    } else if (mode === "HOURLY_FIXED" || mode === "HOURLY") {
      const t = ($("#expTime")?.value || "").trim();
      if (!t) {
        if (err) { err.textContent = "Time required."; err.classList.remove("hidden"); }
        return;
      }
      const today = new Date();
      const [hh, mm] = t.split(":").map((x) => Number(x));
      const d = new Date(today);
      d.setHours(hh || 0, mm || 0, 0, 0);
      expiry_at = d.toISOString(); // past allowed (we do not block)
    }

    try {
      await saveLog({ item, qty, expiry_at });
      closeModal();
      toast("Saved");
      // refresh alerts data silently
      loadAlerts().catch(() => {});
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Save failed.";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Save failed.");
      }
    }
  });
}

/* ---------- Alerts page ---------- */
function renderAlerts() {
  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>

    <div class="card">
      <div class="card-title">Expiry Alerts</div>
      <div id="alertsBox" class="muted">Loading…</div>
    </div>
  `;

  $("#backBtn")?.addEventListener("click", () => goBack());

  (async () => {
    try {
      await loadAlerts();
      const rows = state.alerts || [];
      const box = $("#alertsBox");

      if (!box) return;

      if (!rows.length) {
        box.innerHTML = `<div class="muted">No alerts found.</div>`;
        return;
      }

      box.innerHTML = `
        ${rows.map((r) => {
          const name = r.name || r.item_name || "Item";
          const exp = r.expiry_value || "";
          return `
            <div class="alert-row">
              <div>
                <div class="alert-name">${escapeHtml(name)}</div>
                <div class="alert-extra">${escapeHtml(r.category || "")}${r.sub_category ? " • " + escapeHtml(r.sub_category) : ""}</div>
              </div>
              <div class="alert-extra">${escapeHtml(exp)}</div>
            </div>
          `;
        }).join("")}
      `;
    } catch (e) {
      const box = $("#alertsBox");
      if (box) box.innerHTML = `<div class="error">Failed: ${escapeHtml(e?.message || "Error")}</div>`;
    }
  })();

  updateTopAndNav();
}

/* ---------- Manager page ---------- */
function getAllCategoriesFromItems() {
  const set = new Set();
  state.items.forEach((it) => set.add(canonicalCategory(it.category)));
  // include official list so manager can use them even if empty
  CATEGORIES.forEach((c) => set.add(c));
  return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

async function managerReloadItems() {
  const rows = await apiManager("GET", "/api/manager/items");
  state.items = (rows || []).map((it) => ({
    ...it,
    category: canonicalCategory(it.category),
    sub_category: it.sub_category ?? null,
  }));
}

function renderManager() {
  if (!isManagerMode()) {
    // require login first
    openManagerLogin();
    go("home");
    return;
  }

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="card">
      <div class="card-title">Manager Tools</div>
      <div class="muted" style="margin-bottom:10px">
        You can add/edit/delete items, rename categories, and move items safely.
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button id="mgrRefresh" class="btn btn-ghost" type="button">Refresh</button>
        <button id="mgrAddItem" class="btn btn-primary" type="button">Add Item</button>
        <button id="mgrCats" class="btn btn-ghost" type="button">Manage Categories</button>
        <button id="mgrExit" class="btn btn-ghost" type="button">Exit Manager</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Items</div>

      <div class="field">
        <input id="mgrSearch" class="input" placeholder="Search item name…" />
      </div>

      <div id="mgrList" class="list"></div>
    </div>
  `;

  $("#backBtn")?.addEventListener("click", () => goBack());
  $("#mgrExit")?.addEventListener("click", exitManagerMode);

  const renderList = () => {
    const q = norm($("#mgrSearch")?.value || "");
    const list = $("#mgrList");
    if (!list) return;

    const items = state.items
      .slice()
      .sort((a, b) => norm(a.name).localeCompare(norm(b.name)))
      .filter((it) => !q || norm(it.name).includes(q));

    list.innerHTML = items.map((it) => `
      <button class="list-row" data-mid="${it.id}" type="button">
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(it.name)}</div>
          <div class="list-row-sub">${escapeHtml(canonicalCategory(it.category))}${it.sub_category ? " • " + escapeHtml(it.sub_category) : ""} • SL ${escapeHtml(it.shelf_life_days)}</div>
        </div>
        <div class="chev">›</div>
      </button>
    `).join("");

    $$("[data-mid]", list).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-mid"));
        const it = state.items.find((x) => Number(x.id) === id);
        if (it) openManagerItemEditor(it);
      });
    });
  };

  $("#mgrSearch")?.addEventListener("input", renderList);

  $("#mgrRefresh")?.addEventListener("click", async () => {
    try {
      await managerReloadItems();
      toast("Updated");
      renderList();
    } catch (e) {
      alert(e?.message || "Refresh failed");
    }
  });

  $("#mgrAddItem")?.addEventListener("click", () => openManagerNewItem());
  $("#mgrCats")?.addEventListener("click", () => openManagerCategories());

  renderList();
  updateTopAndNav();
}

function openManagerNewItem() {
  const cats = getAllCategoriesFromItems();
  openModal(
    "Add New Item",
    `
    <div class="field">
      <label class="label">Name</label>
      <input id="niName" class="input" placeholder="Item name" />
    </div>

    <div class="field">
      <label class="label">Category</label>
      <select id="niCat" class="input">
        ${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
      </select>
    </div>

    <div class="field">
      <label class="label">Sub Category (optional)</label>
      <select id="niSub" class="input">
        <option value="" selected>None</option>
        ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
      </select>
      <div class="helper">Use this only for Sauce items.</div>
    </div>

    <div class="field">
      <label class="label">Shelf Life Days</label>
      <input id="niSL" class="input" inputmode="numeric" placeholder="e.g. 3" />
    </div>

    <div id="niErr" class="error hidden"></div>

    <div style="display:flex;gap:10px;margin-top:10px">
      <button id="niCancel" class="btn btn-ghost" type="button">Cancel</button>
      <button id="niSave" class="btn btn-primary" type="button">Add</button>
    </div>
    `
  );

  $("#niCancel")?.addEventListener("click", closeModal);
  $("#niSave")?.addEventListener("click", async () => {
    const err = $("#niErr");
    if (err) { err.classList.add("hidden"); err.textContent = ""; }

    const name = ($("#niName")?.value || "").trim();
    const category = ($("#niCat")?.value || "").trim();
    const sub_category = ($("#niSub")?.value || "").trim() || null;
    const shelf_life_days = Number(($("#niSL")?.value || "").trim() || 0);

    if (!name || !category) {
      if (err) { err.textContent = "Name and category required."; err.classList.remove("hidden"); }
      return;
    }

    try {
      await apiManager("POST", "/api/manager/items", { name, category, sub_category, shelf_life_days });
      await managerReloadItems();
      closeModal();
      toast("Item added");
      renderManager();
    } catch (e) {
      if (err) { err.textContent = e?.message || "Add failed"; err.classList.remove("hidden"); }
      else alert(e?.message || "Add failed");
    }
  });
}

function openManagerItemEditor(item) {
  const cats = getAllCategoriesFromItems();
  openModal(
    "Edit Item",
    `
    <div class="field">
      <label class="label">Name</label>
      <input id="eiName" class="input" value="${escapeHtml(item.name)}" />
    </div>

    <div class="field">
      <label class="label">Category</label>
      <select id="eiCat" class="input">
        ${cats.map((c) =>
          `<option value="${escapeHtml(c)}" ${norm(c) === norm(item.category) ? "selected" : ""}>${escapeHtml(c)}</option>`
        ).join("")}
      </select>
    </div>

    <div class="field">
      <label class="label">Sub Category</label>
      <select id="eiSub" class="input">
        <option value="" ${item.sub_category ? "" : "selected"}>None</option>
        ${SAUCE_SUBS.map((s) =>
          `<option value="${escapeHtml(s)}" ${norm(s) === norm(item.sub_category || "") ? "selected" : ""}>${escapeHtml(s)}</option>`
        ).join("")}
      </select>
      <div class="helper">Use for Sauce only.</div>
    </div>

    <div class="field">
      <label class="label">Shelf Life Days</label>
      <input id="eiSL" class="input" inputmode="numeric" value="${escapeHtml(item.shelf_life_days)}" />
    </div>

    <div id="eiErr" class="error hidden"></div>

    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
      <button id="eiCancel" class="btn btn-ghost" type="button">Cancel</button>
      <button id="eiSave" class="btn btn-primary" type="button" style="flex:1">Save</button>
      <button id="eiDel" class="btn btn-ghost" type="button" style="border-color:#E53935;color:#E53935;background:#fff">Delete</button>
    </div>
    `
  );

  $("#eiCancel")?.addEventListener("click", closeModal);

  $("#eiSave")?.addEventListener("click", async () => {
    const err = $("#eiErr");
    if (err) { err.classList.add("hidden"); err.textContent = ""; }

    const name = ($("#eiName")?.value || "").trim();
    const category = ($("#eiCat")?.value || "").trim();
    const sub_category = ($("#eiSub")?.value || "").trim() || null;
    const shelf_life_days = Number(($("#eiSL")?.value || "").trim() || 0);

    if (!name || !category) {
      if (err) { err.textContent = "Name and category required."; err.classList.remove("hidden"); }
      return;
    }

    try {
      await apiManager("PATCH", `/api/manager/items/${item.id}`, { name, category, sub_category, shelf_life_days });
      await managerReloadItems();
      closeModal();
      toast("Saved");
      renderManager();
    } catch (e) {
      if (err) { err.textContent = e?.message || "Save failed"; err.classList.remove("hidden"); }
      else alert(e?.message || "Save failed");
    }
  });

  $("#eiDel")?.addEventListener("click", () => {
    openConfirm("Delete item?", `Delete "${item.name}" permanently?`, async () => {
      try {
        await apiManager("DELETE", `/api/manager/items/${item.id}`);
        await managerReloadItems();
        closeModal();
        toast("Deleted");
        renderManager();
      } catch (e) {
        alert(e?.message || "Delete failed");
      }
    });
  });
}

function openManagerCategories() {
  const cats = getAllCategoriesFromItems();
  openModal(
    "Manage Categories",
    `
    <div class="muted">Categories are stored inside items (no separate categories table).</div>

    <div class="field">
      <label class="label">Rename Category</label>
      <select id="rcFrom" class="input">
        ${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
      </select>
      <input id="rcTo" class="input" placeholder="New category name" style="margin-top:10px" />
      <button id="rcBtn" class="btn btn-primary" type="button" style="width:100%;margin-top:10px">Rename</button>
    </div>

    <hr style="border:0;border-top:1px solid rgba(0,0,0,0.08);margin:14px 0" />

    <div class="field">
      <label class="label">Delete Category (safe)</label>
      <div class="muted" style="margin-bottom:8px">
        To delete a category, move all its items into another category.
      </div>
      <select id="dcFrom" class="input">
        ${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
      </select>
      <select id="dcTo" class="input" style="margin-top:10px">
        ${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
      </select>
      <button id="dcBtn" class="btn btn-primary" type="button" style="width:100%;margin-top:10px">Move & Delete</button>
    </div>

    <div style="display:flex;gap:10px;margin-top:12px">
      <button id="catClose" class="btn btn-ghost" type="button">Close</button>
    </div>
    `
  );

  $("#catClose")?.addEventListener("click", closeModal);

  $("#rcBtn")?.addEventListener("click", async () => {
    const from = ($("#rcFrom")?.value || "").trim();
    const to = ($("#rcTo")?.value || "").trim();
    if (!from || !to) return alert("Select old category and enter new category name.");

    openConfirm("Rename category?", `Rename "${from}" to "${to}"?`, async () => {
      try {
        await apiManager("POST", "/api/manager/categories/rename", { from, to });
        await managerReloadItems();
        closeModal();
        toast("Category renamed");
        renderManager();
      } catch (e) {
        alert(e?.message || "Rename failed");
      }
    });
  });

  $("#dcBtn")?.addEventListener("click", async () => {
    const from = ($("#dcFrom")?.value || "").trim();
    const to = ($("#dcTo")?.value || "").trim();
    if (!from || !to) return alert("Select categories.");
    if (norm(from) === norm(to)) return alert("Choose a different destination category.");

    openConfirm("Move & delete category?", `Move all items from "${from}" to "${to}"?`, async () => {
      try {
        await apiManager("POST", "/api/manager/categories/move", { from, to });
        await managerReloadItems();
        closeModal();
        toast("Moved");
        renderManager();
      } catch (e) {
        alert(e?.message || "Move failed");
      }
    });
  });
}

/* ---------- Bind top buttons + bottom nav ---------- */
function bindNav() {
  // Top buttons
  btnHomeTop?.addEventListener("click", () => go("home"));
  btnAlertsTop?.addEventListener("click", () => go("alerts"));

  btnLogoutTop?.addEventListener("click", () => {
    if (isManagerMode()) return exitManagerMode();

    openConfirm("Logout?", "End staff session and return to Start Session?", () => {
      state.session = { store: "", shift: "", staff: "" };
      saveSession(state.session);
      state.onceSessionPopupShown = false;
      go("session");
    });
  });

  // Bottom nav
  navHome?.addEventListener("click", () => go("home"));
  navAlerts?.addEventListener("click", () => go("alerts"));
  navManager?.addEventListener("click", () => {
    if (isManagerMode()) go("manager");
    else openManagerLogin();
  });
}
bindNav();

/* ---------- Render router ---------- */
function render() {
  updateTopAndNav();

  const p = state.view.page;

  if (p === "session") return renderSession();
  if (p === "home") return renderHome();
  if (p === "sauce_menu") return renderSauceMenu();
  if (p === "category") return renderCategoryList();
  if (p === "alerts") return renderAlerts();
  if (p === "manager") return renderManager();

  // fallback
  renderHome();
}

/* ---------- Boot ---------- */
(async function boot() {
  updateTopAndNav();

  // If session exists, load items then go home
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  try {
    if (hasSession) {
      await loadItems();
      go("home");
      showSessionStartPopupOnce();
      loadAlerts().catch(() => {});
    } else {
      go("session");
    }
  } catch (e) {
    console.error(e);
    go("session");
  }
})();
