/* =========================
   PreCheck — app.js (FULL)
   UI: topbar session + bottom nav (Home/Alerts/Manager/Logout)
   Store-separated: categories + items per store (PDD vs SKH)
   Manager:
     - Login PIN
     - CRUD Items (soft delete)
     - CRUD Categories (soft delete)
   ========================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- Utils ---------- */
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
function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDaysISODate(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function toISOAtLocalEndOfDay(isoDate) {
  const d = new Date(`${isoDate}T23:59:00`);
  return d.toISOString();
}
function toISOAtLocalTime(isoDate, hhmm) {
  const [hh, mm] = String(hhmm).split(":").map((x) => Number(x));
  const d = new Date(`${isoDate}T00:00:00`);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d.toISOString();
}
function mustStore(s) {
  const t = String(s || "").trim().toUpperCase();
  return t === "PDD" || t === "SKH" ? t : "";
}

/* ---------- Fixed sauce subcategories ---------- */
const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);
const MANUAL_ALWAYS = new Set([]);

/* ---------- Tile icons (SVG) ---------- */
const ICONS = {
  clipboard: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 4h6"></path>
    <path d="M9 4a2 2 0 0 0-2 2v2h10V6a2 2 0 0 0-2-2"></path>
    <path d="M7 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-1"></path>
  </svg>`,
  snow: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2v20"></path>
    <path d="M5 5l14 14"></path>
    <path d="M19 5 5 19"></path>
  </svg>`,
  leaf: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 4s-9 1-13 5-5 13-5 13 9-1 13-5 5-13 5-13Z"></path>
    <path d="M7 17c3-3 7-7 10-10"></path>
  </svg>`,
  box: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 8l-9-5-9 5 9 5 9-5Z"></path>
    <path d="M3 8v8l9 5 9-5V8"></path>
    <path d="M12 13v8"></path>
  </svg>`,
  counter: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16"></path>
    <path d="M6 7v13"></path>
    <path d="M18 7v13"></path>
    <path d="M4 20h16"></path>
    <path d="M9 11h6"></path>
  </svg>`,
  bottle: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 2h4"></path>
    <path d="M10 2v3l-1 1v2l-1 2v9a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-9l-1-2V6l-1-1V2"></path>
    <path d="M9 12h6"></path>
  </svg>`,
};

/* If category name matches these, we give nice tones/icons */
function metaForCategory(catName) {
  const n = norm(catName);
  if (n === norm("Prepared items")) return { tone: "green", icon: ICONS.clipboard };
  if (n === norm("Unopened chiller")) return { tone: "blue", icon: ICONS.snow };
  if (n === norm("Thawing")) return { tone: "cyan", icon: ICONS.snow };
  if (n === norm("Vegetables")) return { tone: "lime", icon: ICONS.leaf };
  if (n === norm("Backroom")) return { tone: "orange", icon: ICONS.box };
  if (n === norm("Back counter")) return { tone: "yellow", icon: ICONS.counter };
  if (n === norm("Front counter")) return { tone: "red", icon: ICONS.clipboard };
  if (n === norm("Back counter chiller")) return { tone: "teal", icon: ICONS.snow };
  if (n === norm("Sauce")) return { tone: "purple", icon: ICONS.bottle };
  return { tone: "green", icon: ICONS.clipboard };
}

/* ---------- DOM ---------- */
const main = $("#main");
const sessionLine = $("#sessionLine");
const btnManagerTop = $("#btnManager");
const btnLogoutTop = $("#btnLogout");

const bottomNav = $("#bottomNav");
const navHome = $("#navHome");
const navAlerts = $("#navAlerts");
const navManager = $("#navManager");
const navLogout = $("#navLogout");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  categories: [], // from DB (per store)
  items: [], // from DB (per store)
  view: { page: "session", category: null, sauceSub: null },
  navStack: [],
};

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") {
      state.session = { store: s.store || "", shift: s.shift || "", staff: s.staff || "" };
    }
  } catch {}
}
function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}

function getManagerToken() {
  return localStorage.getItem("managerToken") || "";
}
function setManagerToken(t) {
  if (t) localStorage.setItem("managerToken", t);
  else localStorage.removeItem("managerToken");
}
function isManagerMode() {
  return !!getManagerToken();
}

/* ---------- Modal ---------- */
function openModal(title, bodyHtml) {
  modalTitleEl.textContent = title || " ";
  modalBodyEl.innerHTML = bodyHtml || "";
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
}
function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  modalBodyEl.innerHTML = "";
}
function bindModal() {
  modalCloseBtn?.addEventListener("click", closeModal);
  modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
}

/* ---------- Toast ---------- */
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 1800);
}

/* ---------- API ---------- */
async function apiJSON(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
async function apiGet(url) {
  const res = await fetch(url);
  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await apiJSON(res);
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

  if (res.status === 401) {
    setManagerToken("");
    updateTopbar();
    updateBottomNav();
    toast("Manager session expired. Login again.");
    throw new Error("unauthorized");
  }

  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* ---------- Data load (store separated) ---------- */
async function loadAllForStore() {
  const store = mustStore(state.session.store);
  if (!store) throw new Error("store not set");

  // categories first, then items
  state.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
  state.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);
}

/* ---------- UI: Topbar (only ONE badge) ---------- */
function updateTopbar() {
  const store = state.session.store || "";
  const shift = state.session.shift || "";
  const staff = state.session.staff || "";
  const hasSession = !!(store && shift && staff);

  // top buttons visibility
  btnManagerTop?.classList.toggle("hidden", !hasSession);
  btnLogoutTop?.classList.toggle("hidden", !hasSession);

  if (!sessionLine) return;

  if (!hasSession) {
    sessionLine.classList.add("hidden");
    sessionLine.innerHTML = "";
    return;
  }

  const badge = isManagerMode()
    ? `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#E53935;">MANAGER</span>`
    : `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#1E88E5;">STAFF</span>`;

  sessionLine.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      ${badge}
      <span style="font-weight:1000">${escapeHtml(store)} • ${escapeHtml(shift)} • ${escapeHtml(staff)}</span>
    </div>
  `;
  sessionLine.classList.remove("hidden");
}

/* ---------- Bottom nav show/hide + active ---------- */
function updateBottomNav() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  bottomNav?.classList.toggle("hidden", !hasSession);

  // Manager tab always visible when session exists (staff can tap, it asks PIN)
  navManager?.classList.toggle("hidden", !hasSession);

  const page = state.view.page;
  const setActive = (el, on) => el?.classList.toggle("active", !!on);

  setActive(navHome, page === "home" || page === "category" || page === "sauce_menu");
  setActive(navAlerts, page === "alerts");
  setActive(navManager, page === "manager");
}

/* ---------- Navigation stack + back ---------- */
function setView(next, push = true) {
  const prev = { ...state.view };
  state.view = { ...next };
  if (push) state.navStack.push(prev);

  try {
    history.pushState({ t: Date.now() }, "");
  } catch {}

  render();
}
function goBack() {
  const prev = state.navStack.pop();
  if (prev) {
    state.view = prev;
    render();
    return;
  }
}
function bindSwipeBack() {
  let sx = 0,
    sy = 0,
    st = 0;

  window.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      sx = t.clientX;
      sy = t.clientY;
      st = Date.now();
    },
    { passive: true }
  );

  window.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const dt = Date.now() - st;

      if (dx > 70 && Math.abs(dy) < 45 && dt < 600) {
        const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
        if (modalOpen) return;
        goBack();
      }
    },
    { passive: true }
  );

  window.addEventListener("popstate", () => {
    const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
    if (modalOpen) {
      closeModal();
      return;
    }
    goBack();
  });

  try {
    history.replaceState({ t: Date.now() }, "");
    history.pushState({ t: Date.now() }, "");
  } catch {}
}

/* ---------- Bind top + bottom buttons ---------- */
function bindNav() {
  // topbar
  btnManagerTop?.addEventListener("click", () => {
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  });

  btnLogoutTop?.addEventListener("click", () => doLogout());

  // bottom nav
  navHome?.addEventListener("click", () => {
    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });

  navAlerts?.addEventListener("click", () => {
    setView({ page: "alerts", category: null, sauceSub: null }, true);
  });

  navManager?.addEventListener("click", () => {
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  });

  navLogout?.addEventListener("click", () => doLogout());
}

function doLogout() {
  // If manager mode is on, logout button exits manager mode first
  if (isManagerMode()) {
    if (!confirm("Exit manager mode?")) return;
    setManagerToken("");
    toast("Back to staff mode");
    updateTopbar();
    updateBottomNav();
    state.view = { page: "home", category: null, sauceSub: null };
    render();
    return;
  }

  if (!confirm("Logout staff session?")) return;
  state.session = { store: "", shift: "", staff: "" };
  saveSession();

  state.categories = [];
  state.items = [];

  state.navStack = [];
  state.view = { page: "session", category: null, sauceSub: null };
  render();
}

/* ---------- Expiry mode rules ---------- */
function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function getMode(item) {
  const cat = String(item.category || "").trim();
  const nameN = norm(item.name);

  // Chicken Bacon (C) ONLY EOD
  if (nameN === norm("Chicken Bacon (C)")) return "EOD";

  // Unopened chiller always manual date-only
  if (norm(cat) === norm("Unopened chiller")) return "MANUAL_DATE";

  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE";

  return "AUTO";
}
function getHelperText(it) {
  const mode = getMode(it);
  const sl = getShelfLifeDays(it);

  if (mode === "EOD") return "Expiry: End of day (auto).";
  if (mode === "HOURLY_FIXED") return "Expiry: Select fixed time (today).";
  if (mode === "MANUAL_DATE") return "Expiry: Staff sets date (manual).";
  return `Expiry: Select date (0–${sl} day${sl === 1 ? "" : "s"}).`;
}

/* ---------- Counts ---------- */
function categoryCounts() {
  const counts = {};
  for (const c of state.categories) counts[c.name] = 0;

  for (const it of state.items) {
    const cat = String(it.category || "").trim();
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

/* =========================
   RENDERS
   ========================= */

function renderSession() {
  updateTopbar();
  updateBottomNav();

  main.innerHTML = `
    <div class="card">
      <div class="h1">Start Session</div>
      <div class="muted">Select store, shift, and staff name.</div>

      <div class="field">
        <label class="label">Store</label>
        <select id="storeSel" class="input">
          <option value="">Select store</option>
          <option value="PDD">PDD</option>
          <option value="SKH">SKH</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Shift</label>
        <select id="shiftSel" class="input">
          <option value="">Select shift</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Staff</label>
        <input id="staffInp" class="input" placeholder="Your name" />
      </div>

      <button id="btnStart" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
        Start
      </button>

      <div id="startErr" class="error hidden"></div>
    </div>
  `;

  const storeSel = $("#storeSel");
  const shiftSel = $("#shiftSel");
  const staffInp = $("#staffInp");
  const err = $("#startErr");

  storeSel.value = state.session.store || "";
  shiftSel.value = state.session.shift || "";
  staffInp.value = state.session.staff || "";

  $("#btnStart").addEventListener("click", async () => {
    err.classList.add("hidden");

    const store = mustStore(storeSel.value);
    const shift = String(shiftSel.value || "").trim();
    const staff = String(staffInp.value || "").trim();

    if (!store || !shift || !staff) {
      err.textContent = "Please select Store, Shift and Staff.";
      err.classList.remove("hidden");
      return;
    }

    state.session = { store, shift, staff };
    saveSession();

    try {
      await loadAllForStore();
    } catch (e) {
      err.textContent = `Failed to load data: ${e.message || e}`;
      err.classList.remove("hidden");
      return;
    }

    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });
}

function renderHome() {
  updateTopbar();
  updateBottomNav();

  const counts = categoryCounts();

  // If no categories in DB for this store, show message
  if (!state.categories.length) {
    main.innerHTML = `
      <div class="card">
        <div class="h1">No categories</div>
        <div class="muted">
          This store has no categories in database.<br/>
          Manager must add categories for <b>${escapeHtml(state.session.store)}</b>.
        </div>
        <button id="btnGoMgr" type="button"
          style="margin-top:12px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
          Open Manager
        </button>
      </div>
    `;
    $("#btnGoMgr").addEventListener("click", () => {
      if (isManagerMode()) setView({ page: "manager" }, true);
      else openManagerLogin();
    });
    return;
  }

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>
      <div class="home-sub">Tap a category to log items.</div>

      <section class="grid tiles-grid">
        ${state.categories
          .map((c, idx) => {
            const meta = metaForCategory(c.name);
            const count = counts[c.name] ?? 0;
            const delay = Math.min(0.6, idx * 0.05).toFixed(2);

            return `
              <button class="tile tile--${meta.tone}" style="animation-delay:${delay}s" data-cat="${escapeHtml(
              c.name
            )}" type="button">
                <div class="tile-top">
                  <div class="tile-icon" aria-hidden="true">${meta.icon}</div>
                </div>
                <div class="tile-title">${escapeHtml(c.name)}</div>
                <div class="tile-sub">${count} item${count === 1 ? "" : "s"}</div>
              </button>
            `;
          })
          .join("")}
      </section>
    </section>
  `;

  $$("[data-cat]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (norm(cat) === norm("Sauce")) setView({ page: "sauce_menu", category: cat, sauceSub: null }, true);
      else setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });
}

function renderSauceMenu() {
  updateTopbar();
  updateBottomNav();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid">
      ${SAUCE_SUBS.map((s) => {
        const meta = metaForCategory("Sauce");
        return `
          <button class="tile tile--${meta.tone}" data-sauce="${escapeHtml(s)}" type="button">
            <div class="tile-top">
              <div class="tile-icon" aria-hidden="true">${meta.icon}</div>
            </div>
            <div class="tile-title">${escapeHtml(s)}</div>
            <div class="tile-sub">Tap to view items</div>
          </button>
        `;
      }).join("")}
    </section>
  `;

  $("#backBtn").addEventListener("click", goBack);

  $$("[data-sauce]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sauce");
      setView({ page: "category", category: "Sauce", sauceSub: sub }, true);
    });
  });
}

function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;

  let list = state.items.filter((it) => norm(it.category) === norm(category));

  if (norm(category) === norm("Sauce")) {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

function renderCategoryList() {
  updateTopbar();
  updateBottomNav();

  const { category, sauceSub } = state.view;
  const title = norm(category) === norm("Sauce") ? `Sauce • ${sauceSub}` : category;

  const list = getItemsForCurrentList();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
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

  $("#backBtn").addEventListener("click", goBack);

  $$("[data-item-id]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-item-id"));
      const it = state.items.find((x) => Number(x.id) === id);
      if (!it) return;
      openLogModal(it);
    });
  });
}

/* ---------- Log modal (yellow Save) ---------- */
function openLogModal(item) {
  const mode = getMode(item);
  const sl = getShelfLifeDays(item);
  const today = todayISODate();

  let expiryHtml = "";
  if (mode === "MANUAL_DATE") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Date</label>
        <input id="expDate" class="input" type="date" />
        <div class="helper">Select expiry date.</div>
      </div>
    `;
  } else if (mode === "HOURLY_FIXED") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Time (Today)</label>
        <select id="expTime" class="input">
          <option value="">Select time</option>
          ${FIXED_TIME_SLOTS.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <div class="helper">Fixed time dropdown (today).</div>
      </div>
    `;
  } else if (mode === "EOD") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry</label>
        <div class="input" style="display:flex;align-items:center;justify-content:space-between;">
          <span>End of day (today)</span>
          <span style="font-weight:1000;color:var(--green-dark);">${escapeHtml(today)}</span>
        </div>
        <div class="helper">Auto-set to 23:59 today.</div>
      </div>
    `;
  } else {
    const opts = [];
    const max = Math.max(0, sl || 0);
    for (let i = 0; i <= max; i++) {
      const d = addDaysISODate(today, i);
      opts.push(`<option value="${d}">${d}</option>`);
    }
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Date</label>
        <select id="expSelect" class="input">
          <option value="">Select date</option>
          ${opts.join("")}
        </select>
        <div class="helper">Auto dropdown based on shelf life.</div>
      </div>
    `;
  }

  openModal(
    "Log Item",
    `
    <div class="modal-item-title">${escapeHtml(item.name)}</div>

    <div class="field">
      <label class="label">Quantity (optional)</label>
      <input id="qtyInp" class="input" inputmode="numeric" placeholder="Leave blank if not needed" />
      <div class="helper">Blank allowed.</div>
    </div>

    ${expiryHtml}

    <div id="logErr" class="error hidden"></div>

    <button id="btnSaveLog" type="button"
      style="margin-top:6px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
      Save
    </button>
  `
  );

  const qtyInp = $("#qtyInp", modalBodyEl);
  const expDate = $("#expDate", modalBodyEl);
  const expSelect = $("#expSelect", modalBodyEl);
  const expTime = $("#expTime", modalBodyEl);
  const err = $("#logErr", modalBodyEl);
  const btnSave = $("#btnSaveLog", modalBodyEl);

  btnSave.addEventListener("click", async () => {
    err.classList.add("hidden");

    const qtyRaw = (qtyInp?.value || "").trim();
    const qty = qtyRaw === "" ? null : Number(qtyRaw);
    if (qtyRaw !== "" && (!Number.isFinite(qty) || qty < 0)) {
      err.textContent = "Quantity must be a number (or blank).";
      err.classList.remove("hidden");
      return;
    }

    let expiry_date = "";
    let expiry_at = null;

    if (mode === "MANUAL_DATE") {
      expiry_date = (expDate?.value || "").trim();
      if (!expiry_date) {
        err.textContent = "Expiry required.";
        err.classList.remove("hidden");
        return;
      }
    } else if (mode === "HOURLY_FIXED") {
      const t = (expTime?.value || "").trim();
      if (!t) {
        err.textContent = "Expiry time required.";
        err.classList.remove("hidden");
        return;
      }
      expiry_at = toISOAtLocalTime(today, t);
    } else if (mode === "EOD") {
      expiry_at = toISOAtLocalEndOfDay(today);
    } else {
      expiry_date = (expSelect?.value || "").trim();
      if (!expiry_date) {
        err.textContent = "Expiry required.";
        err.classList.remove("hidden");
        return;
      }
    }

    const payload = {
      item_id: item.id,
      item_name: item.name,
      category: item.category,
      sub_category: item.sub_category || null,
      store: state.session.store,
      staff: state.session.staff,
      shift: state.session.shift,
      quantity: qty,
      expiry: expiry_date || null,
      expiry_at: expiry_at || null,
    };

    try {
      await apiPost("/api/log", payload);
      closeModal();
      toast("Saved ✅");
    } catch (e) {
      err.textContent = e?.message || "Save failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Alerts ---------- */
async function renderAlerts() {
  updateTopbar();
  updateBottomNav();

  main.innerHTML = `
    <div class="card">
      <div class="h1">Alerts</div>
      <div class="muted">Latest logged expiry per item (this store only).</div>
      <div id="alertsWrap" class="muted" style="margin-top:12px;">Loading...</div>
    </div>
  `;

  const wrap = $("#alertsWrap");
  try {
    const store = mustStore(state.session.store);
    const rows = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
    if (!rows || !rows.length) {
      wrap.innerHTML = `<div class="muted">No logged expiry yet.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="card-title">Latest expiry for ${escapeHtml(store)}</div>
      ${rows
        .map(
          (r) => `
          <div class="alert-row">
            <div>
              <div class="alert-name">${escapeHtml(r.name)}</div>
              <div class="alert-extra">${escapeHtml(r.category)}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
            </div>
            <div style="font-weight:1000;color:var(--green-dark)">${escapeHtml(r.expiry_value || "-")}</div>
          </div>
        `
        )
        .join("")}
    `;
  } catch (e) {
    wrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
}

/* ---------- Manager Login (yellow) ---------- */
function openManagerLogin() {
  openModal(
    "Manager Access",
    `
    <div class="field">
      <label class="label">Enter PIN</label>
      <input id="pinInp" class="input" inputmode="numeric" placeholder="PIN" />
      <div class="helper">Manager only.</div>
    </div>

    <div id="pinErr" class="error hidden"></div>

    <button id="btnPinLogin" type="button"
      style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
      Login
    </button>
  `
  );

  const pinInp = $("#pinInp", modalBodyEl);
  const err = $("#pinErr", modalBodyEl);
  const btn = $("#btnPinLogin", modalBodyEl);

  btn.addEventListener("click", async () => {
    err.classList.add("hidden");
    const pin = (pinInp.value || "").trim();
    if (!pin) {
      err.textContent = "PIN required.";
      err.classList.remove("hidden");
      return;
    }

    try {
      const out = await apiPost("/api/manager/login", { pin });
      setManagerToken(out.token || "");
      closeModal();
      toast("Manager mode ✅");
      updateTopbar();
      updateBottomNav();
      setView({ page: "manager" }, true);
    } catch (e) {
      err.textContent = e?.message || "Login failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager Page: Items + Categories ---------- */
async function renderManager() {
  updateTopbar();
  updateBottomNav();

  const store = mustStore(state.session.store);

  if (!isManagerMode()) {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted">Login required.</div>
        <button id="btnGoLogin" type="button"
          style="margin-top:12px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
          Enter PIN
        </button>
      </div>
    `;
    $("#btnGoLogin").addEventListener("click", openManagerLogin);
    return;
  }

  main.innerHTML = `
    <div class="card">
      <div class="h1">Manager — ${escapeHtml(store)}</div>
      <div class="muted">
        <b>Soft Delete</b> = hides it (keeps data).<br/>
        <b>Hard Delete</b> = permanently removes (we are NOT using hard delete here).
      </div>
    </div>

    <!-- CATEGORIES -->
    <div class="card">
      <div class="card-title">Categories (this store only)</div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="btnAddCat" type="button"
          style="flex:1;min-width:160px;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
          Add Category
        </button>
        <button id="btnReloadAll" type="button"
          style="flex:1;min-width:160px;border:1px solid rgba(0,0,0,0.12);border-radius:999px;padding:12px 14px;font-weight:1000;background:#fff;color:#1b1b1b;cursor:pointer;">
          Reload
        </button>
      </div>

      <div id="catList" class="muted" style="margin-top:12px;">Loading…</div>
    </div>

    <!-- ITEMS -->
    <div class="card">
      <div class="card-title">Items (this store only)</div>
      <input id="mgrSearch" class="input" placeholder="Type item name..." />
      <button id="btnAddItem" type="button"
        style="margin-top:10px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
        Add Item
      </button>

      <div id="mgrList" class="muted" style="margin-top:12px;">Loading…</div>
    </div>
  `;

  $("#btnAddCat").addEventListener("click", openManagerAddCategory);
  $("#btnAddItem").addEventListener("click", openManagerAddItem);
  $("#btnReloadAll").addEventListener("click", async () => {
    await reloadManagerData();
  });

  async function reloadManagerData() {
    // load for manager sections + refresh staff home data too
    try {
      const [cats, items] = await Promise.all([
        apiManager("GET", `/api/manager/categories?store=${encodeURIComponent(store)}`),
        apiManager("GET", `/api/manager/items?store=${encodeURIComponent(store)}`),
      ]);
      renderCategoryManager(cats);
      renderItemManager(items);

      // refresh staff data used in home right away
      await loadAllForStore();
    } catch (e) {
      $("#catList").innerHTML = `<div class="error">${escapeHtml(e.message || e)}</div>`;
      $("#mgrList").innerHTML = `<div class="error">${escapeHtml(e.message || e)}</div>`;
    }
  }

  function renderCategoryManager(rows) {
    const catList = $("#catList");
    if (!rows?.length) {
      catList.innerHTML = `<div class="muted">No categories yet.</div>`;
      return;
    }

    catList.innerHTML = rows
      .map((c) => {
        return `
          <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;">
            <div style="font-weight:1000;font-size:16px;margin-bottom:10px;">${escapeHtml(c.name)}</div>

            <div class="field">
              <label class="label">Sort order</label>
              <input class="input cat-sort" data-id="${c.id}" inputmode="numeric" value="${escapeHtml(
          c.sort_order ?? 0
        )}" />
            </div>

            <div style="display:flex;gap:10px;">
              <button class="cat-save" data-id="${c.id}" type="button"
                style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
                Save
              </button>
              <button class="cat-del" data-id="${c.id}" type="button"
                style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:#fff;border:1px solid rgba(0,0,0,0.12);color:#c62828;cursor:pointer;">
                Soft Delete
              </button>
            </div>

            <div class="cat-err error hidden" data-id="${c.id}"></div>
          </div>
        `;
      })
      .join("");

    $$(".cat-save", catList).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.cat-err[data-id="${id}"]`, catList);
        err.classList.add("hidden");

        const sortInp = $(`.cat-sort[data-id="${id}"]`, catList);
        const sort_order = Number(String(sortInp.value || "0").trim());
        if (!Number.isFinite(sort_order)) {
          err.textContent = "Sort order must be a number.";
          err.classList.remove("hidden");
          return;
        }

        try {
          await apiManager("PATCH", `/api/manager/categories/${id}`, { sort_order });
          toast("Category saved ✅");
          await loadAllForStore();
        } catch (e) {
          err.textContent = e.message || "Save failed.";
          err.classList.remove("hidden");
        }
      });
    });

    $$(".cat-del", catList).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.cat-err[data-id="${id}"]`, catList);
        err.classList.add("hidden");

        if (!confirm("Soft delete this category? (It will hide from staff)")) return;

        try {
          await apiManager("DELETE", `/api/manager/categories/${id}`);
          toast("Category deleted ✅");
          await reloadManagerData();
        } catch (e) {
          err.textContent = e.message || "Delete failed.";
          err.classList.remove("hidden");
        }
      });
    });
  }

  function renderItemManager(rows) {
    const listEl = $("#mgrList");
    const searchEl = $("#mgrSearch");

    function draw() {
      const q = norm(searchEl.value || "");
      const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;

      if (!filtered.length) {
        listEl.innerHTML = `<div class="muted">No matches.</div>`;
        return;
      }

      // categories for dropdown from DB
      const catOptions = state.categories.map((c) => c.name);

      listEl.innerHTML = filtered
        .slice(0, 250)
        .map((r) => {
          const sub = r.sub_category || "";
          const sl = Number(r.shelf_life_days ?? 0);

          return `
            <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;">
              <div style="font-weight:1000;font-size:16px;margin-bottom:10px;">${escapeHtml(r.name)}</div>

              <div class="field">
                <label class="label">Category</label>
                <select class="input mgr-cat" data-id="${r.id}">
                  ${catOptions
                    .map((c) => `<option value="${escapeHtml(c)}" ${norm(c) === norm(r.category) ? "selected" : ""}>${escapeHtml(c)}</option>`)
                    .join("")}
                </select>
              </div>

              <div class="field">
                <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
                <select class="input mgr-sub" data-id="${r.id}">
                  <option value="" ${sub ? "" : "selected"}>(none)</option>
                  ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}" ${norm(s) === norm(sub) ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
                </select>
                <div class="helper">If category is not Sauce, sub-category must be (none).</div>
              </div>

              <div class="field">
                <label class="label">Shelf life (days)</label>
                <input class="input mgr-sl" data-id="${r.id}" inputmode="numeric" value="${escapeHtml(sl)}" />
                <div class="helper">&gt; 7 days becomes manual in app.</div>
              </div>

              <div style="display:flex;gap:10px;">
                <button class="mgr-save" data-id="${r.id}" type="button"
                  style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
                  Save
                </button>
                <button class="mgr-del" data-id="${r.id}" type="button"
                  style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:#fff;border:1px solid rgba(0,0,0,0.12);color:#c62828;cursor:pointer;">
                  Soft Delete
                </button>
              </div>

              <div class="mgr-err error hidden" data-id="${r.id}"></div>
            </div>
          `;
        })
        .join("");

      $$(".mgr-save", listEl).forEach((b) => {
        b.addEventListener("click", async () => {
          const id = Number(b.getAttribute("data-id"));
          const err = $(`.mgr-err[data-id="${id}"]`, listEl);
          err.classList.add("hidden");

          const catSel = $(`.mgr-cat[data-id="${id}"]`, listEl);
          const subSel = $(`.mgr-sub[data-id="${id}"]`, listEl);
          const slInp = $(`.mgr-sl[data-id="${id}"]`, listEl);

          const category = String(catSel.value || "").trim();
          const sub_category_raw = String(subSel.value || "").trim() || null;
          const shelf_life_days = Number(String(slInp.value || "0").trim());

          const finalSub = norm(category) === norm("Sauce") ? sub_category_raw : null;

          if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
            err.textContent = "Shelf life must be a number ≥ 0.";
            err.classList.remove("hidden");
            return;
          }

          try {
            await apiManager("PATCH", `/api/manager/items/${id}`, {
              category,
              sub_category: finalSub,
              shelf_life_days,
            });
            toast("Saved ✅");
            await loadAllForStore();
          } catch (e) {
            err.textContent = e.message || "Save failed.";
            err.classList.remove("hidden");
          }
        });
      });

      $$(".mgr-del", listEl).forEach((b) => {
        b.addEventListener("click", async () => {
          const id = Number(b.getAttribute("data-id"));
          const err = $(`.mgr-err[data-id="${id}"]`, listEl);
          err.classList.add("hidden");

          if (!confirm("Soft delete this item?")) return;

          try {
            await apiManager("DELETE", `/api/manager/items/${id}`);
            toast("Deleted ✅");
            await reloadManagerData();
          } catch (e) {
            err.textContent = e.message || "Delete failed.";
            err.classList.remove("hidden");
          }
        });
      });
    }

    searchEl.addEventListener("input", draw);
    draw();
  }

  await reloadManagerData();
}

/* ---------- Manager: Add Category ---------- */
function openManagerAddCategory() {
  const store = mustStore(state.session.store);

  openModal(
    "Add Category",
    `
    <div class="modal-item-title">New category (${escapeHtml(store)})</div>

    <div class="field">
      <label class="label">Name</label>
      <input id="newCatName" class="input" placeholder="Category name" />
    </div>

    <div class="field">
      <label class="label">Sort order</label>
      <input id="newCatSort" class="input" inputmode="numeric" value="10" />
    </div>

    <div id="catAddErr" class="error hidden"></div>

    <button id="btnCatAddSave" type="button"
      style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
      Save
    </button>
  `
  );

  const nameEl = $("#newCatName", modalBodyEl);
  const sortEl = $("#newCatSort", modalBodyEl);
  const err = $("#catAddErr", modalBodyEl);

  $("#btnCatAddSave", modalBodyEl).addEventListener("click", async () => {
    err.classList.add("hidden");
    const name = String(nameEl.value || "").trim();
    const sort_order = Number(String(sortEl.value || "0").trim());

    if (!name) {
      err.textContent = "Name required.";
      err.classList.remove("hidden");
      return;
    }
    if (!Number.isFinite(sort_order)) {
      err.textContent = "Sort order must be a number.";
      err.classList.remove("hidden");
      return;
    }

    try {
      await apiManager("POST", "/api/manager/categories", { store, name, sort_order });
      await loadAllForStore();
      closeModal();
      toast("Category added ✅");
      // Refresh manager page
      state.view = { page: "manager" };
      render();
    } catch (e) {
      err.textContent = e.message || "Failed to add category.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager: Add Item ---------- */
function openManagerAddItem() {
  const store = mustStore(state.session.store);
  const catOptions = state.categories.map((c) => c.name);

  openModal(
    "Add Item",
    `
    <div class="modal-item-title">New item (${escapeHtml(store)})</div>

    <div class="field">
      <label class="label">Name</label>
      <input id="newName" class="input" placeholder="Item name" />
    </div>

    <div class="field">
      <label class="label">Category</label>
      <select id="newCat" class="input">
        ${catOptions.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
      </select>
    </div>

    <div class="field">
      <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
      <select id="newSub" class="input">
        <option value="" selected>(none)</option>
        ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
      </select>
    </div>

    <div class="field">
      <label class="label">Shelf life (days)</label>
      <input id="newSL" class="input" inputmode="numeric" value="1" />
    </div>

    <div id="addErr" class="error hidden"></div>

    <button id="btnAddSave" type="button"
      style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
      Save
    </button>
  `
  );

  const nameEl = $("#newName", modalBodyEl);
  const catEl = $("#newCat", modalBodyEl);
  const subEl = $("#newSub", modalBodyEl);
  const slEl = $("#newSL", modalBodyEl);
  const err = $("#addErr", modalBodyEl);

  $("#btnAddSave", modalBodyEl).addEventListener("click", async () => {
    err.classList.add("hidden");

    const name = String(nameEl.value || "").trim();
    const category = String(catEl.value || "").trim();
    const sub = String(subEl.value || "").trim() || null;
    const shelf_life_days = Number(String(slEl.value || "0").trim());

    if (!name) {
      err.textContent = "Name required.";
      err.classList.remove("hidden");
      return;
    }
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
      err.textContent = "Shelf life must be a number ≥ 0.";
      err.classList.remove("hidden");
      return;
    }

    const finalSub = norm(category) === norm("Sauce") ? sub : null;

    try {
      await apiManager("POST", "/api/manager/items", {
        store,
        name,
        category,
        sub_category: finalSub,
        shelf_life_days,
      });

      await loadAllForStore();
      closeModal();
      toast("Added ✅");

      state.view = { page: "manager" };
      render();
    } catch (e) {
      err.textContent = e.message || "Failed to add item.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Router ---------- */
async function render() {
  if (!main) return;

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  if (!hasSession && state.view.page !== "session") state.view = { page: "session", category: null, sauceSub: null };

  updateTopbar();
  updateBottomNav();

  const page = state.view.page;

  if (page === "session") return renderSession();
  if (page === "home") return renderHome();
  if (page === "sauce_menu") return renderSauceMenu();
  if (page === "category") return renderCategoryList();
  if (page === "alerts") return renderAlerts();
  if (page === "manager") return renderManager();

  state.view = { page: "home", category: null, sauceSub: null };
  renderHome();
}

/* ---------- Boot ---------- */
async function boot() {
  bindModal();
  bindSwipeBack();
  bindNav();

  loadSession();

  // If session exists, load store data
  if (state.session.store && state.session.shift && state.session.staff) {
    try {
      await loadAllForStore();
      state.view = { page: "home", category: null, sauceSub: null };
    } catch {
      state.view = { page: "session", category: null, sauceSub: null };
    }
  } else {
    state.view = { page: "session", category: null, sauceSub: null };
  }

  render();
}

boot().catch((e) => {
  console.error(e);
  if (main) {
    main.innerHTML = `<div class="card"><div class="h1">Error</div><div class="error">${escapeHtml(e?.message || e)}</div></div>`;
  }
});
