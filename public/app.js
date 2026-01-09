/* PreCheck app.js (2026-01-09) */

const $ = (sel) => document.querySelector(sel);
const main = $("#main");

// Top UI
const topbar = $("#topbar");
const sessionLine = $("#sessionLine");
const btnManager = $("#btnManager");
const btnLogout = $("#btnLogout");

// Bottom nav
const bottomNav = $("#bottomNav");
const navHome = $("#navHome");
const navAlerts = $("#navAlerts");
const navManager = $("#navManager");
const icoHome = $("#icoHome");
const icoAlerts = $("#icoAlerts");
const icoManager = $("#icoManager");

// Modal + toast
const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalClose = $("#modalClose");
const toastEl = $("#toast");

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

// ===== Icons (custom SVG) =====
const Icons = {
  home: `<svg viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>`,
  bell: `<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>`,
  shield: `<svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 9.4-8 10-4.5-.6-8-5-8-10V6l8-4z"/></svg>`,
  sandwich: `<svg viewBox="0 0 24 24"><path d="M4 12c2-4 14-4 16 0"/><path d="M6 14h12"/><path d="M5 16c3 5 11 5 14 0"/></svg>`,
  ice: `<svg viewBox="0 0 24 24"><path d="M12 2v20"/><path d="M4 7l16 10"/><path d="M20 7L4 17"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24"><path d="M4 20c10 0 16-6 16-16C10 4 4 10 4 20z"/><path d="M4 20c5-5 9-7 16-10"/></svg>`,
  box: `<svg viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>`,
  counter: `<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M4 7v13"/><path d="M20 7v13"/><path d="M4 14h16"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24"><path d="M6 2h12v20l-2-1-2 1-2-1-2 1-2-1-2 1V2z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h6"/></svg>`,
  cheese: `<svg viewBox="0 0 24 24"><path d="M21 10l-9-8-9 8v10h18V10z"/><path d="M7 16h.01"/><path d="M12 14h.01"/><path d="M17 16h.01"/></svg>`,
  bottle: `<svg viewBox="0 0 24 24"><path d="M10 2h4"/><path d="M10 2v4l-1 2v14h6V8l-1-2V2"/><path d="M9 12h6"/></svg>`,
};

icoHome.innerHTML = Icons.home;
icoAlerts.innerHTML = Icons.bell;
icoManager.innerHTML = Icons.shield;

const TILE_META = {
  "Prepared items": { tone: "green", icon: Icons.sandwich },
  "Unopened chiller": { tone: "blue", icon: Icons.ice },
  "Thawing": { tone: "cyan", icon: Icons.ice },
  "Vegetables": { tone: "lime", icon: Icons.leaf },
  "Backroom": { tone: "orange", icon: Icons.box },
  "Back counter": { tone: "yellow", icon: Icons.counter },
  "Front counter": { tone: "red", icon: Icons.receipt },
  "Back counter chiller": { tone: "teal", icon: Icons.cheese },
  "Sauce": { tone: "purple", icon: Icons.bottle },
};

// ===== State =====
const state = {
  items: [],
  session: loadSession(),
  view: { page: "session" }, // session | home | sauce_menu | category | alerts | manager
  history: [],
  managerItems: [],
};

function norm(s) {
  return String(s || "").trim().toLowerCase();
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function canonicalCategory(cat) {
  const c = String(cat || "").trim();
  // keep your exact category names casing as in Supabase, but normalize comparisons
  // (Your data currently has "Front counter", "Back counter chiller", etc.)
  const map = {
    "prepared items": "Prepared items",
    "unopened chiller": "Unopened chiller",
    "thawing": "Thawing",
    "vegetables": "Vegetables",
    "backroom": "Backroom",
    "back counter": "Back counter",
    "front counter": "Front counter",
    "back counter chiller": "Back counter chiller",
    "sauce": "Sauce",
  };
  return map[norm(c)] || c;
}

function isLoggedIn() {
  const s = state.session;
  return !!(s && s.store && s.shift && s.staff);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 1600);
}

// ===== Modal =====
function openModal(title, html) {
  modalTitleEl.textContent = title || "Info";
  modalBodyEl.innerHTML = html || "";
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
}
function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  modalBodyEl.innerHTML = "";
}
modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// ===== API (basic) =====
async function apiGet(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ===== Manager auth =====
function getManagerToken() {
  return localStorage.getItem("managerToken") || "";
}
function setManagerToken(token) {
  if (token) localStorage.setItem("managerToken", token);
  else localStorage.removeItem("managerToken");
}
function isManager() {
  return !!getManagerToken();
}
async function apiManager(path, { method = "GET", body } = {}) {
  const token = getManagerToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ===== Session storage =====
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem("precheck_session") || "null");
  } catch {
    return null;
  }
}
function saveSession(s) {
  localStorage.setItem("precheck_session", JSON.stringify(s));
  state.session = s;
}
function clearSession() {
  localStorage.removeItem("precheck_session");
  state.session = null;
}

// ===== Navigation (history + swipe back) =====
function pushView(next) {
  state.history.push(state.view);
  state.view = next;
  render();
}
function goBack() {
  if (modalBackdrop && !modalBackdrop.classList.contains("hidden")) {
    closeModal();
    return;
  }
  if (state.history.length === 0) {
    // at root
    confirmExit();
    return;
  }
  state.view = state.history.pop();
  render();
}
function confirmExit() {
  openModal(
    "Exit PreCheck?",
    `
    <div class="card" style="margin:0;">
      <div class="muted">If you leave, your session stays saved. You can come back anytime.</div>
      <div style="display:flex; gap:10px; margin-top:14px;">
        <button id="exitCancel" class="btn-ghost" type="button" style="flex:1;">Stay</button>
        <button id="exitOk" class="chip" type="button" style="flex:1; background:var(--yellow); border-color:transparent; color:#1a1a1a;">Leave</button>
      </div>
    </div>
    `
  );
  $("#exitCancel").addEventListener("click", closeModal);
  $("#exitOk").addEventListener("click", () => {
    closeModal();
    // On web you can't close tab; best is go to about:blank or show message
    window.location.href = "about:blank";
  });
}

// Swipe back (right swipe)
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;
document.addEventListener("touchstart", (e) => {
  if (!e.touches || e.touches.length !== 1) return;
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchActive = true;
}, { passive: true });

document.addEventListener("touchend", (e) => {
  if (!touchActive) return;
  touchActive = false;
  const t = (e.changedTouches && e.changedTouches[0]) || null;
  if (!t) return;

  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;

  // Right swipe only (back)
  if (dx > 80 && Math.abs(dy) < 70) {
    goBack();
  }
}, { passive: true });

// ===== Expiry mode rules =====

// manual date-only list (your confirmed items)
const MANUAL_ALWAYS = new Set([
  norm("Canola Oil"),
  norm("Salt Open Inner"),
  norm("Pepper Open Inner"),
  norm("Olive Open Bottle"),
  norm("Parmesan Oregano"),
  norm("Shallot"),
  norm("Honey Oat"),
  norm("Parmesan Open Inner"),
  norm("Shallot Open Inner"),
  norm("Honey Oat Open Inner"),
  norm("Salt"),
  norm("Pepper"),
  norm("Cookies"),
  norm("Olive Oil"),
  norm("Milo"),
  norm("Tea Bag"),
  norm("Cajun Spice Packet"),
]);

const HOURLY_FIXED_ITEMS = new Set([
  norm("Bread"),
  norm("Tomato Soup (H)"),
  norm("Mushroom Soup (H)"),
]);

// ONLY Chicken Bacon (C) is EOD (your latest requirement)
function isChickenBaconC(item) {
  return norm(item.name) === norm("Chicken Bacon (C)");
}

function getShelfLifeDays(item) {
  const n = Number(item?.shelf_life_days ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Mode labels are internal only (not shown to staff)
function getMode(item) {
  const cat = canonicalCategory(item.category);
  const nameN = norm(item.name);

  // Unopened chiller always manual DATE-only (no time)
  if (cat === "Unopened chiller") return "MANUAL_DATE";

  // Chicken Bacon (C) -> EOD
  if (isChickenBaconC(item)) return "EOD";

  // Cajun Spice Open Inner -> AUTO, 5 days (even if shelf is wrong in DB)
  if (nameN === norm("Cajun Spice Open Inner")) return "AUTO";

  // Always manual list -> date-only
  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

  // Fixed time dropdown
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  // Beef Taco (H) SKH-only (if present in DB) - hourly
  if (canonicalCategory(item.category) === "Front counter" && nameN === norm("Beef Taco (H)")) return "HOURLY";

  // Shelf life > 7 => manual date-only
  if (getShelfLifeDays(item) > 7) return "MANUAL_DATE";

  // default AUTO
  return "AUTO";
}

function getHelperText(item) {
  const mode = getMode(item);
  if (mode === "AUTO") return "Select expiry date";
  if (mode === "MANUAL_DATE") return "Choose expiry date";
  if (mode === "EOD") return "Auto set to end of day";
  if (mode === "HOURLY") return "Select expiry time";
  if (mode === "HOURLY_FIXED") return "Select 11am / 3pm / 7pm / 11pm";
  return "Select expiry";
}

// AUTO date options: Today..Today+N (N+1 options)
function buildAutoDateOptions(days) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    out.push(d);
  }
  return out;
}

function fmtDate(d) {
  // “24 May 2026”
  const dd = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short" });
  const yyyy = d.getFullYear();
  return `${dd} ${month} ${yyyy}`;
}

function fmtTime12(h, m) {
  const ampm = h >= 12 ? "PM" : "AM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm} ${ampm}`;
}

function fixedTimes() {
  // Must be exactly: 11:00 AM, 3:00 PM, 7:00 PM, 11:00 PM
  return [
    { h: 11, m: 0, label: "11:00 AM" },
    { h: 15, m: 0, label: "3:00 PM" },
    { h: 19, m: 0, label: "7:00 PM" },
    { h: 23, m: 0, label: "11:00 PM" },
  ];
}

// For HOURLY (free time dropdown), we give 30-min increments
function hourlyTimes() {
  const arr = [];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      arr.push({ h, m, label: fmtTime12(h, m) });
    }
  }
  return arr;
}

function todayAt(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d;
}

// ===== Render =====
function setNavActive(which) {
  [navHome, navAlerts, navManager].forEach((b) => b.classList.remove("is-active"));
  if (which === "home") navHome.classList.add("is-active");
  if (which === "alerts") navAlerts.classList.add("is-active");
  if (which === "manager") navManager.classList.add("is-active");
}

function setTopAndNavVisible(on) {
  topbar.classList.toggle("hidden", !on);
  bottomNav.classList.toggle("hidden", !on);
}

function updateTopSessionLine() {
  if (!isLoggedIn()) {
    sessionLine.classList.add("hidden");
    btnLogout.classList.add("hidden");
    btnManager.classList.add("hidden");
    navManager.classList.add("hidden");
    return;
  }

  const s = state.session;
  sessionLine.innerHTML = `<strong>${escapeHtml(s.store)}</strong> • ${escapeHtml(s.shift)} • ${escapeHtml(s.staff)}`;
  sessionLine.classList.remove("hidden");
  btnLogout.classList.remove("hidden");

  // show manager chip if logged in as manager
  if (isManager()) {
    btnManager.textContent = "Manager ✓";
    btnManager.classList.remove("hidden");
    navManager.classList.remove("hidden");
  } else {
    btnManager.textContent = "Manager";
    btnManager.classList.remove("hidden");
    navManager.classList.add("hidden");
  }
}

function render() {
  // gate
  if (!isLoggedIn()) {
    state.view = { page: "session" };
  }

  updateTopSessionLine();

  if (state.view.page === "session") {
    setTopAndNavVisible(false);
    renderSession();
    return;
  }

  setTopAndNavVisible(true);

  // show/hide manager nav
  navManager.classList.toggle("hidden", !isManager());

  if (state.view.page === "home") {
    setNavActive("home");
    renderHome();
    return;
  }
  if (state.view.page === "sauce_menu") {
    setNavActive("home");
    renderSauceMenu();
    return;
  }
  if (state.view.page === "category") {
    setNavActive("home");
    renderCategoryList();
    return;
  }
  if (state.view.page === "alerts") {
    setNavActive("alerts");
    renderAlerts();
    return;
  }
  if (state.view.page === "manager") {
    setNavActive("manager");
    renderManager();
    return;
  }

  // fallback
  state.view = { page: "home" };
  render();
}

// ===== Pages =====

function renderSession() {
  main.innerHTML = `
    <div class="card">
      <div class="h1">Start Session</div>
      <div class="muted">Choose store, shift, and your name.</div>

      <div class="field">
        <label class="label">Store</label>
        <select id="sessStore" class="input">
          <option value="">Select store</option>
          <option value="PDD">PDD</option>
          <option value="SKH">SKH</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Shift</label>
        <select id="sessShift" class="input">
          <option value="">Select shift</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
          <option value="FULL">FULL</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Staff</label>
        <input id="sessStaff" class="input" placeholder="e.g. Aiman / ID 59" />
      </div>

      <div id="sessErr" class="error hidden"></div>

      <div style="display:flex; gap:10px; margin-top:14px;">
        <button id="sessStart" class="chip" type="button" style="flex:1; background:var(--yellow); border-color:transparent; color:#1a1a1a;">Start</button>
      </div>
    </div>
  `;

  const storeEl = $("#sessStore");
  const shiftEl = $("#sessShift");
  const staffEl = $("#sessStaff");
  const errEl = $("#sessErr");

  // defaults from last
  if (state.session) {
    storeEl.value = state.session.store || "";
    shiftEl.value = state.session.shift || "";
    staffEl.value = state.session.staff || "";
  }

  $("#sessStart").addEventListener("click", () => {
    const store = storeEl.value;
    const shift = shiftEl.value;
    const staff = staffEl.value.trim();

    if (!store || !shift || !staff) {
      errEl.textContent = "Please select store, shift and staff.";
      errEl.classList.remove("hidden");
      return;
    }
    errEl.classList.add("hidden");
    saveSession({ store, shift, staff });

    state.history = [];
    state.view = { page: "home" };
    render();

    // show session popup reminder
    showSessionReminder();
  });
}

function showSessionReminder() {
  const list = [
    "Liquid Egg",
    "Flatbread (Thawing)",
    "Mac N Cheese",
    "Chicken Bacon (C)",
    "Avocado",
    "Mix Green",
    "Lettuce",
  ];
  openModal(
    "PLEASE check expiry day",
    `
    <div class="card" style="margin:0;">
      <div class="muted">Before starting, check these items:</div>
      <ol style="margin:12px 0 0; padding-left:18px; font-weight:900;">
        ${list.map((x) => `<li style="margin:6px 0;">${escapeHtml(x)}</li>`).join("")}
      </ol>
      <div style="margin-top:14px;">
        <button id="remOk" class="chip" type="button" style="width:100%; background:var(--yellow); border-color:transparent; color:#1a1a1a;">OK</button>
      </div>
    </div>
    `
  );
  $("#remOk").addEventListener("click", closeModal);
}

function countsByCategory() {
  const counts = {};
  for (const c of CATEGORIES) counts[c] = 0;
  for (const it of state.items) {
    const cat = canonicalCategory(it.category);
    if (counts[cat] === undefined) continue;
    counts[cat]++;
  }
  return counts;
}

function renderHome() {
  const counts = countsByCategory();
  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>
      <div class="home-sub">Tap a category to log items</div>

      <section class="grid">
        ${CATEGORIES.map((cat, idx) => {
          const meta = TILE_META[cat] || { tone: "green", icon: Icons.sandwich };
          const count = counts[cat] ?? 0;
          const delay = (idx * 60);
          return `
            <button class="tile tile--${meta.tone}" data-cat="${escapeHtml(cat)}" type="button" style="animation-delay:${delay}ms">
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

  main.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "Sauce") pushView({ page: "sauce_menu" });
      else pushView({ page: "category", category: cat, sauceSub: null });
    });
  });
}

function renderSauceMenu() {
  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid">
      ${SAUCE_SUBS.map((s, idx) => {
        const delay = (idx * 70);
        return `
          <button class="tile tile--purple" data-sauce="${escapeHtml(s)}" type="button" style="animation-delay:${delay}ms">
            <div class="tile-top">
              <div class="tile-icon" aria-hidden="true">${Icons.bottle}</div>
            </div>
            <div class="tile-title">${escapeHtml(s)}</div>
            <div class="tile-sub">Open list</div>
          </button>
        `;
      }).join("")}
    </section>
  `;

  $("#backBtn").addEventListener("click", goBack);

  main.querySelectorAll("[data-sauce]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sauce");
      pushView({ page: "category", category: "Sauce", sauceSub: sub });
    });
  });
}

function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;
  let list = state.items.filter((it) => canonicalCategory(it.category) === category);

  // Sauce two-level
  if (category === "Sauce") {
    list = list.filter((it) => String(it.sub_category || "") === String(sauceSub || ""));
  }

  // SKH-only Beef Taco (H) never show on PDD (if exists)
  if (state.session?.store === "PDD") {
    list = list.filter((it) => norm(it.name) !== norm("Beef Taco (H)"));
  }

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

function renderCategoryList() {
  const { category, sauceSub } = state.view;
  const title = category === "Sauce" ? `Sauce • ${sauceSub}` : category;

  const list = getItemsForCurrentList();

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <section class="list">
      ${
        list.length
          ? list
              .map(
                (it) => `
        <button class="list-row" data-item-id="${it.id}" type="button">
          <div>
            <div class="list-row-title">${escapeHtml(it.name)}</div>
            <div class="list-row-sub">${escapeHtml(getHelperText(it))}</div>
          </div>
          <div class="chev">›</div>
        </button>`
              )
              .join("")
          : `<div class="empty">No items found.</div>`
      }
    </section>
  `;

  $("#backBtn").addEventListener("click", goBack);

  main.querySelectorAll("[data-item-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-item-id"));
      const item = state.items.find((x) => Number(x.id) === id);
      if (item) openItemModal(item);
    });
  });
}

async function renderAlerts() {
  const store = state.session?.store;
  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>
    <div class="card">
      <div class="card-title">Expiry Alerts</div>
      <div id="alertsBody" class="muted">Loading…</div>
    </div>
  `;
  $("#backBtn").addEventListener("click", goBack);

  try {
    const rows = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
    const wrap = $("#alertsBody");
    if (!rows.length) {
      wrap.innerHTML = `<div class="muted">No alerts right now.</div>`;
      return;
    }
    wrap.innerHTML = rows
      .map(
        (r) => `
      <div class="alert-row">
        <div>
          <div class="alert-name">${escapeHtml(r.name)}</div>
          <div class="alert-extra">${escapeHtml(canonicalCategory(r.category))}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
        </div>
        <div class="alert-extra">${escapeHtml(r.expiry_value || "-")}</div>
      </div>
    `
      )
      .join("");
  } catch (e) {
    $("#alertsBody").innerHTML = `<div class="error">Failed to load alerts.</div>`;
  }
}

async function renderManager() {
  if (!isManager()) {
    showManagerLogin();
    return;
  }

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div class="muted">Add or edit categories, sub-categories and shelf life.</div>
      <div style="display:flex; gap:10px; margin-top:12px;">
        <button id="btnAddItem" class="chip" type="button" style="background:var(--yellow); border-color:transparent; color:#1a1a1a;">+ Add Item</button>
        <button id="btnMgrLogout" class="chip chip--ghost" type="button">Logout Manager</button>
      </div>
      <div class="field" style="margin-top:12px;">
        <input id="mgrSearch" class="input" placeholder="Search item name…" />
      </div>
      <div id="mgrList" class="list"></div>
    </div>
  `;

  $("#backBtn").addEventListener("click", goBack);

  $("#btnMgrLogout").addEventListener("click", () => {
    setManagerToken("");
    showToast("Manager logged out");
    render();
  });

  $("#btnAddItem").addEventListener("click", () => openManagerItemEditor(null));

  let items = [];
  try {
    items = await apiManager("/api/manager/items");
    state.managerItems = items;
  } catch (e) {
    openModal("Error", `<div class="error">Failed to load manager items.</div>`);
    return;
  }

  const listEl = $("#mgrList");
  const searchEl = $("#mgrSearch");

  function draw() {
    const q = norm(searchEl.value);
    const filtered = items.filter((x) => norm(x.name).includes(q));

    listEl.innerHTML = filtered
      .slice(0, 200)
      .map(
        (it) => `
        <button class="list-row" data-mid="${it.id}" type="button">
          <div>
            <div class="list-row-title">${escapeHtml(it.name)}</div>
            <div class="list-row-sub">${escapeHtml(canonicalCategory(it.category))}${it.sub_category ? ` • ${escapeHtml(it.sub_category)}` : ""} • shelf ${escapeHtml(String(it.shelf_life_days ?? 0))}</div>
          </div>
          <div class="chev">›</div>
        </button>
      `
      )
      .join("");

    listEl.querySelectorAll("[data-mid]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = Number(b.getAttribute("data-mid"));
        const it = items.find((x) => Number(x.id) === id);
        if (it) openManagerItemEditor(it);
      });
    });
  }

  searchEl.addEventListener("input", draw);
  draw();
}

function showManagerLogin() {
  openModal(
    "Manager Login",
    `
    <div class="field">
      <label class="label">PIN</label>
      <input id="mgrPin" class="input" inputmode="numeric" placeholder="Enter PIN" />
      <div class="helper">Manager only.</div>
    </div>
    <div id="mgrErr" class="error hidden"></div>
    <div style="display:flex; gap:10px; margin-top:12px;">
      <button id="mgrCancel" class="btn-ghost" type="button" style="flex:1;">Cancel</button>
      <button id="mgrLogin" class="chip" type="button" style="flex:1; background:var(--yellow); border-color:transparent; color:#1a1a1a;">Login</button>
    </div>
    `
  );

  $("#mgrCancel").addEventListener("click", closeModal);

  $("#mgrLogin").addEventListener("click", async () => {
    const pin = $("#mgrPin").value.trim();
    const errEl = $("#mgrErr");
    errEl.classList.add("hidden");

    try {
      const out = await apiPost("/api/manager/login", { pin });
      setManagerToken(out.token || "");
      closeModal();
      state.view = { page: "manager" };
      render();
      showToast("Manager login OK");
    } catch (e) {
      errEl.textContent = "Login failed.";
      errEl.classList.remove("hidden");
    }
  });
}

function openManagerItemEditor(item) {
  const isNew = !item;
  const title = isNew ? "Add Item" : "Edit Item";

  openModal(
    title,
    `
    <div class="field">
      <label class="label">Name</label>
      <input id="mName" class="input" value="${escapeHtml(item?.name || "")}" placeholder="Item name" />
    </div>

    <div class="field">
      <label class="label">Category</label>
      <input id="mCat" class="input" value="${escapeHtml(item?.category || "")}" placeholder="e.g. Thawing" />
    </div>

    <div class="field">
      <label class="label">Sub-category (optional)</label>
      <input id="mSub" class="input" value="${escapeHtml(item?.sub_category || "")}" placeholder="Sauce only (Standby/Open Inner/Sandwich Unit)" />
    </div>

    <div class="field">
      <label class="label">Shelf life (days)</label>
      <input id="mShelf" class="input" inputmode="numeric" value="${escapeHtml(String(item?.shelf_life_days ?? 0))}" />
      <div class="helper">AUTO uses Today → Today+N. Shelf > 7 becomes manual.</div>
    </div>

    <div id="mErr" class="error hidden"></div>

    <div style="display:flex; gap:10px; margin-top:12px;">
      <button id="mCancel" class="btn-ghost" type="button" style="flex:1;">Cancel</button>
      <button id="mSave" class="chip" type="button" style="flex:1; background:var(--yellow); border-color:transparent; color:#1a1a1a;">Save</button>
    </div>
    `
  );

  $("#mCancel").addEventListener("click", closeModal);

  $("#mSave").addEventListener("click", async () => {
    const errEl = $("#mErr");
    errEl.classList.add("hidden");

    const name = $("#mName").value.trim();
    const category = $("#mCat").value.trim();
    const sub_category = $("#mSub").value.trim() || null;
    const shelf_life_days = Number($("#mShelf").value);

    if (!name || !category || !Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
      errEl.textContent = "Please fill name, category, and valid shelf life.";
      errEl.classList.remove("hidden");
      return;
    }

    try {
      if (isNew) {
        await apiManager("/api/manager/items", {
          method: "POST",
          body: { name, category, sub_category, shelf_life_days },
        });
        showToast("Item added");
      } else {
        await apiManager(`/api/manager/items/${item.id}`, {
          method: "PATCH",
          body: { name, category, sub_category, shelf_life_days },
        });
        showToast("Item saved");
      }

      closeModal();
      // refresh main items list for staff immediately
      await loadItems();
      render();
    } catch (e) {
      errEl.textContent = "Save failed.";
      errEl.classList.remove("hidden");
    }
  });
}

function openItemModal(item) {
  const mode = getMode(item);
  const store = state.session?.store || "";
  const shift = state.session?.shift || "";
  const staff = state.session?.staff || "";

  // build expiry input
  let expiryHtml = "";
  let requiredNote = "";
  const nameN = norm(item.name);

  // Special shelf life override: Cajun Spice Open Inner -> 5
  let shelf = getShelfLifeDays(item);
  if (nameN === norm("Cajun Spice Open Inner")) shelf = 5;

  if (mode === "AUTO") {
    const opts = buildAutoDateOptions(shelf);
    expiryHtml = `
      <label class="label">Expiry date</label>
      <select id="expSel" class="input">
        <option value="">Select date</option>
        ${opts.map((d) => `<option value="${d.toISOString()}">${escapeHtml(fmtDate(d))}</option>`).join("")}
      </select>
      <div class="helper">Choose a date (required).</div>
    `;
    requiredNote = "date";
  }

  if (mode === "MANUAL_DATE") {
    expiryHtml = `
      <label class="label">Expiry date</label>
      <input id="expDate" class="input" type="date" />
      <div class="helper">Choose a date (required).</div>
    `;
    requiredNote = "date";
  }

  if (mode === "EOD") {
    const d = endOfToday();
    expiryHtml = `
      <label class="label">Expiry</label>
      <div class="input" style="display:flex; align-items:center; gap:8px;">
        <strong>${escapeHtml(fmtDate(d))}</strong>
        <span class="muted">23:59</span>
      </div>
      <div class="helper">Automatically set to end of day.</div>
    `;
    requiredNote = "auto";
  }

  if (mode === "HOURLY_FIXED") {
    const times = fixedTimes();
    expiryHtml = `
      <label class="label">Expiry time</label>
      <select id="expTime" class="input">
        <option value="">Select time</option>
        ${times.map((t) => `<option value="${t.h}:${t.m}">${escapeHtml(t.label)}</option>`).join("")}
      </select>
      <div class="helper">Past time allowed. Required.</div>
    `;
    requiredNote = "time";
  }

  if (mode === "HOURLY") {
    const times = hourlyTimes();
    expiryHtml = `
      <label class="label">Expiry time</label>
      <select id="expTime" class="input">
        <option value="">Select time</option>
        ${times.map((t) => `<option value="${t.h}:${t.m}">${escapeHtml(t.label)}</option>`).join("")}
      </select>
      <div class="helper">Past time allowed. Required.</div>
    `;
    requiredNote = "time";
  }

  openModal(
    item.name,
    `
    <div class="modal-item-title">${escapeHtml(item.name)}</div>
    <div class="muted" style="margin-top:-6px;">
      ${escapeHtml(canonicalCategory(item.category))}${item.sub_category ? ` • ${escapeHtml(item.sub_category)}` : ""}
    </div>

    <div class="field" style="margin-top:14px;">
      <label class="label">Quantity (optional)</label>
      <input id="qty" class="input" inputmode="numeric" placeholder="Leave blank if not needed" />
      <div class="helper">Blank allowed. 0 allowed.</div>
    </div>

    <div class="field">
      ${expiryHtml}
    </div>

    <div id="saveErr" class="error hidden"></div>

    <div style="display:flex; gap:10px; margin-top:12px;">
      <button id="cancelBtn" class="btn-ghost" type="button" style="flex:1;">Cancel</button>
      <button id="saveBtn" class="chip" type="button" style="flex:1; background:var(--yellow); border-color:transparent; color:#1a1a1a;">Save</button>
    </div>
    `
  );

  $("#cancelBtn").addEventListener("click", closeModal);

  $("#saveBtn").addEventListener("click", async () => {
    const errEl = $("#saveErr");
    errEl.classList.add("hidden");

    const qtyRaw = ($("#qty")?.value ?? "").trim();
    const qty = qtyRaw === "" ? null : Number(qtyRaw);

    // quantity: allow blank and 0; only reject NaN if user typed junk
    if (qtyRaw !== "" && !Number.isFinite(qty)) {
      errEl.textContent = "Quantity must be a number (or leave blank).";
      errEl.classList.remove("hidden");
      return;
    }

    let expiry_at = null;

    if (mode === "AUTO") {
      const v = $("#expSel").value;
      if (!v) {
        errEl.textContent = "Expiry required.";
        errEl.classList.remove("hidden");
        return;
      }
      const d = new Date(v);
      // store as end of day 23:59 for date expiry
      d.setHours(23, 59, 0, 0);
      expiry_at = d.toISOString();
    }

    if (mode === "MANUAL_DATE") {
      const v = $("#expDate").value;
      if (!v) {
        errEl.textContent = "Expiry required.";
        errEl.classList.remove("hidden");
        return;
      }
      const d = new Date(v + "T23:59:00");
      expiry_at = d.toISOString();
    }

    if (mode === "EOD") {
      expiry_at = endOfToday().toISOString();
    }

    if (mode === "HOURLY_FIXED" || mode === "HOURLY") {
      const v = $("#expTime").value;
      if (!v) {
        errEl.textContent = "Expiry required.";
        errEl.classList.remove("hidden");
        return;
      }
      const [h, m] = v.split(":").map((x) => Number(x));
      const d = todayAt(h, m);
      expiry_at = d.toISOString();
    }

    try {
      await apiPost("/api/log", {
        item_id: item.id,
        item_name: item.name,
        category: canonicalCategory(item.category),
        sub_category: item.sub_category || null,
        store,
        shift,
        staff,
        qty: qty,
        expiry_at,
      });
      closeModal();
      showToast("Saved");
    } catch (e) {
      errEl.textContent = "Save failed.";
      errEl.classList.remove("hidden");
    }
  });
}

// ===== Bottom nav actions =====
navHome.addEventListener("click", () => {
  state.history = [];
  state.view = { page: "home" };
  render();
});
navAlerts.addEventListener("click", () => {
  pushView({ page: "alerts" });
});
navManager.addEventListener("click", () => {
  pushView({ page: "manager" });
});

btnLogout.addEventListener("click", () => {
  clearSession();
  state.history = [];
  state.view = { page: "session" };
  render();
});

btnManager.addEventListener("click", () => {
  if (isManager()) pushView({ page: "manager" });
  else showManagerLogin();
});

// ===== Data loading =====
async function loadItems() {
  const rows = await apiGet("/api/items");
  // normalize categories in memory (keep display consistent)
  state.items = rows.map((x) => ({
    ...x,
    category: canonicalCategory(x.category),
  }));
}

async function boot() {
  // Register service worker (PWA basic)
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js?v=20260109a");
    } catch {}
  }

  try {
    await loadItems();
  } catch (e) {
    // If backend down, still render session
  }

  if (isLoggedIn()) {
    state.view = { page: "home" };
  } else {
    state.view = { page: "session" };
  }
  render();
}

boot();
