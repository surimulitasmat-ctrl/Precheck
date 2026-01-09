/* =========================
   PreCheck — app.js (FULL)
   Single-file, safe copy/paste
   Works with your current style.css colors (green/white/yellow)
   Adds: Bottom nav (Home/Alerts/Manager/Logout), swipe-back, manager mode + CRUD (if server endpoints exist)
   FIXED: bindBottomNav null.dataset crash + DOMContentLoaded boot guard
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
  // end of day local, store as ISO string
  const d = new Date(`${isoDate}T23:59:00`);
  return d.toISOString();
}
function toISOAtLocalTime(isoDate, hhmm) {
  const [hh, mm] = String(hhmm).split(":").map((x) => Number(x));
  const d = new Date(`${isoDate}T00:00:00`);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d.toISOString();
}

/* ---------- Constants ---------- */
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

// If you want fixed time dropdown items (date+time)
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([
  norm("Soup"),
  norm("Soups"),
  // add more fixed-time items here if needed
]);

// Always manual date-only items (besides Unopened chiller)
const MANUAL_ALWAYS = new Set([
  // add items here if you want forced manual date-only
  // norm("Mix Green"),
]);

/* ---------- Tile meta (SVG icons + tones) ---------- */
const ICONS = {
  box: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 8l-9-5-9 5 9 5 9-5Z"></path>
    <path d="M3 8v8l9 5 9-5V8"></path>
    <path d="M12 13v8"></path>
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
  clipboard: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 4h6"></path>
    <path d="M9 4a2 2 0 0 0-2 2v2h10V6a2 2 0 0 0-2-2"></path>
    <path d="M7 8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-1"></path>
  </svg>`,
  bottle: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 2h4"></path>
    <path d="M10 2v3l-1 1v2l-1 2v9a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-9l-1-2V6l-1-1V2"></path>
    <path d="M9 12h6"></path>
  </svg>`,
  counter: `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16"></path>
    <path d="M6 7v13"></path>
    <path d="M18 7v13"></path>
    <path d="M4 20h16"></path>
    <path d="M9 11h6"></path>
  </svg>`,
};

const TILE_META = {
  "Prepared items": { tone: "green", icon: ICONS.clipboard },
  "Unopened chiller": { tone: "blue", icon: ICONS.snow },
  "Thawing": { tone: "cyan", icon: ICONS.snow },
  "Vegetables": { tone: "lime", icon: ICONS.leaf },
  "Backroom": { tone: "orange", icon: ICONS.box },
  "Back counter": { tone: "yellow", icon: ICONS.counter },
  "Front counter": { tone: "red", icon: ICONS.clipboard },
  "Back counter chiller": { tone: "teal", icon: ICONS.snow },
  Sauce: { tone: "purple", icon: ICONS.bottle },
};

/* ---------- DOM ---------- */
const main = $("#main");
const sessionPill = $("#sessionPill");

// modal elements (from your index.html)
const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

// old topbar buttons may exist (we’ll ignore them; bottom nav is primary)
const btnHome = $("#btnHome");
const btnAlerts = $("#btnAlerts");
const btnLogout = $("#btnLogout");

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  items: [],
  view: { page: "session", category: null, sauceSub: null },
  toast: { show: false, text: "" },
  manager: { token: "" },
  navStack: [],
};

/* ---------- Storage ---------- */
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") state.session = { store: s.store || "", shift: s.shift || "", staff: s.staff || "" };
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
  state.manager.token = t || "";
}
function isManagerMode() {
  return !!getManagerToken();
}

/* ---------- Bottom Nav (inject if missing) ---------- */
function ensureBottomNav() {
  if ($("#bottomNav")) return;

  const nav = document.createElement("nav");
  nav.id = "bottomNav";
  nav.className = "bottom-nav hidden";
  nav.innerHTML = `
    <button id="navHome" class="bn-item" type="button">
      <div class="bn-ico">🏠</div>
      <div class="bn-txt">Home</div>
    </button>
    <button id="navAlerts" class="bn-item" type="button">
      <div class="bn-ico">🔔</div>
      <div class="bn-txt">Alerts</div>
    </button>
    <button id="navManager" class="bn-item" type="button">
      <div class="bn-ico">🛠️</div>
      <div class="bn-txt">Manager</div>
    </button>
    <button id="navLogout" class="bn-item" type="button">
      <div class="bn-ico">🚪</div>
      <div class="bn-txt">Logout</div>
    </button>
  `;
  document.body.appendChild(nav);
}

/* ---------- Modal ---------- */
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
function bindModal() {
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }
}

/* ---------- Toast ---------- */
function ensureToast() {
  if ($("#toast")) return;
  const t = document.createElement("div");
  t.id = "toast";
  t.className = "toast hidden";
  document.body.appendChild(t);
}
function toast(msg) {
  ensureToast();
  const t = $("#toast");
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
    updateTopBar();
    updateBottomNav();
    toast("Manager session expired. Login again.");
    throw new Error("unauthorized");
  }

  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* ---------- Category normalize ---------- */
function canonicalCategory(cat) {
  const n = norm(cat);
  const hit = CATEGORIES.find((x) => norm(x) === n);
  return hit || String(cat || "").trim() || "Unknown";
}

/* ---------- Shelf life ---------- */
function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? item.shelfLifeDays ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/* ---------- Expiry mode ---------- */
function getMode(item) {
  const cat = canonicalCategory(item.category);
  const nameN = norm(item.name);

  // Chicken Bacon (C) ONLY is end of day (your rule)
  if (nameN === norm("Chicken Bacon (C)")) return "EOD";

  // Unopened chiller always manual date-only
  if (cat === "Unopened chiller") return "MANUAL_DATE";

  // always manual list
  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

  // fixed time dropdown items (your soups etc)
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  // >7 days => manual date-only (your rule)
  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE";

  // default AUTO (dropdown dates)
  return "AUTO";
}

/* ---------- UI: top bar session line ---------- */
function updateSessionPill() {
  if (!sessionPill) return;

  const store = state.session.store || "";
  const shift = state.session.shift || "";
  const staff = state.session.staff || "";

  const roleBadge = isManagerMode()
    ? `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#E53935;margin-right:8px;">MANAGER</span>`
    : `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#1E88E5;margin-right:8px;">STAFF</span>`;

  const line = [store, shift, staff].filter(Boolean).join(" • ");

  sessionPill.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${roleBadge}
      <span style="font-weight:1000;font-size:14px">${escapeHtml(line || "No session yet")}</span>
    </div>
  `;
  sessionPill.classList.toggle("hidden", !line);
}

/* ---------- Bottom nav active + show/hide ---------- */
function updateBottomNav() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  const nav = $("#bottomNav");
  if (!nav) return;

  nav.classList.toggle("hidden", !hasSession);

  const page = state.view.page;
  const active = (id, on) => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("active", !!on);
  };

  active("#navHome", page === "home" || page === "category" || page === "sauce_menu");
  active("#navAlerts", page === "alerts");
  active("#navManager", page === "manager");
  // logout tab not "active"
}

/* ---------- Topbar old buttons (disable) ---------- */
function updateTopBar() {
  // Hide old topbar buttons, bottom nav is used
  if (btnHome) btnHome.classList.add("hidden");
  if (btnAlerts) btnAlerts.classList.add("hidden");
  if (btnLogout) btnLogout.classList.add("hidden");
}

/* ---------- Navigation (stack + back) ---------- */
function setView(next, push = true) {
  const prev = { ...state.view };
  state.view = { ...next };

  if (push) state.navStack.push(prev);

  // also integrate browser back
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

  // At root: confirm exit
  if (confirm("Exit PreCheck?")) {
    // let browser handle; do nothing
  } else {
    // prevent leaving by pushing state again
    try {
      history.pushState({ t: Date.now() }, "");
    } catch {}
  }
}

/* ---------- Swipe back ---------- */
function bindSwipeBack() {
  let sx = 0;
  let sy = 0;
  let st = 0;

  window.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || !e.touches[0]) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
    },
    { passive: true }
  );

  window.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const dt = Date.now() - st;

      // swipe right
      if (dx > 70 && Math.abs(dy) < 45 && dt < 600) {
        // don't swipe-back if modal open
        const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
        if (modalOpen) return;
        goBack();
      }
    },
    { passive: true }
  );

  // browser back
  window.addEventListener("popstate", () => {
    // ignore if modal open
    const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
    if (modalOpen) {
      closeModal();
      return;
    }
    goBack();
  });

  // keep a state so first back doesn't leave instantly
  try {
    history.replaceState({ t: Date.now() }, "");
    history.pushState({ t: Date.now() }, "");
  } catch {}
}

/* ---------- Bottom nav bindings (FIXED) ---------- */
function bindBottomNav() {
  const nav = $("#bottomNav");
  if (!nav) return;

  // bind once
  if (nav.dataset.bound === "1") return;
  nav.dataset.bound = "1";

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.id;

    if (id === "navHome") {
      state.navStack = [];
      state.view = { page: "home", category: null, sauceSub: null };
      render();
      return;
    }

    if (id === "navAlerts") {
      setView({ page: "alerts", category: null, sauceSub: null }, true);
      return;
    }

    if (id === "navManager") {
      if (isManagerMode()) {
        setView({ page: "manager" }, true);
      } else {
        openManagerLogin();
      }
      return;
    }

    if (id === "navLogout") {
      if (isManagerMode()) {
        if (!confirm("Exit manager mode?")) return;
        setManagerToken("");
        toast("Back to staff mode");
        state.view = { page: "home", category: null, sauceSub: null };
        render();
        return;
      }

      if (!confirm("Logout staff session?")) return;
      state.session = { store: "", shift: "", staff: "" };
      saveSession();
      state.navStack = [];
      state.view = { page: "session", category: null, sauceSub: null };
      render();
    }
  });
}

/* ---------- Data load ---------- */
async function loadItems() {
  const rows = await apiGet("/api/items");
  state.items = (rows || []).map((x) => ({
    ...x,
    category: canonicalCategory(x.category),
    sub_category: x.sub_category ?? null,
  }));
}

/* ---------- Home counts ---------- */
function categoryCounts() {
  const counts = {};
  for (const c of CATEGORIES) counts[c] = 0;

  for (const it of state.items) {
    const c = canonicalCategory(it.category);
    if (counts[c] == null) counts[c] = 0;
    counts[c]++;
  }
  return counts;
}

/* ---------- Render: Session ---------- */
function renderSession() {
  updateTopBar();
  updateSessionPill();
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
  const btnStart = $("#btnStart");
  const err = $("#startErr");

  storeSel.value = state.session.store || "";
  shiftSel.value = state.session.shift || "";
  staffInp.value = state.session.staff || "";

  btnStart.addEventListener("click", async () => {
    err.classList.add("hidden");
    const store = storeSel.value.trim();
    const shift = shiftSel.value.trim();
    const staff = staffInp.value.trim();

    if (!store || !shift || !staff) {
      err.textContent = "Please select Store, Shift and Staff.";
      err.classList.remove("hidden");
      return;
    }

    state.session = { store, shift, staff };
    saveSession();

    try {
      await loadItems();
    } catch (e) {
      err.textContent = `Failed to load items: ${e.message || e}`;
      err.classList.remove("hidden");
      return;
    }

    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });
}

/* ---------- Render: Home ---------- */
function renderHome() {
  updateTopBar();
  updateSessionPill();
  updateBottomNav();

  const counts = categoryCounts();

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>
      <div class="home-sub">Tap a category to log items.</div>

      <section class="grid tiles-grid">
        ${CATEGORIES.map((cat, idx) => {
          const meta = TILE_META[cat] || TILE_META["Prepared items"];
          const count = counts[cat] ?? 0;
          const delay = Math.min(0.6, idx * 0.05).toFixed(2);

          return `
            <button class="tile tile--${meta.tone}" style="animation-delay:${delay}s" data-cat="${escapeHtml(cat)}" type="button">
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
      if (cat === "Sauce") setView({ page: "sauce_menu", category: "Sauce", sauceSub: null }, true);
      else setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });
}

/* ---------- Render: Sauce menu ---------- */
function renderSauceMenu() {
  updateTopBar();
  updateSessionPill();
  updateBottomNav();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid">
      ${SAUCE_SUBS.map((s) => {
        const meta = TILE_META["Sauce"];
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

  $("#backBtn").addEventListener("click", () => goBack());

  $$("[data-sauce]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sauce");
      setView({ page: "category", category: "Sauce", sauceSub: sub }, true);
    });
  });
}

/* ---------- Items for list ---------- */
function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;

  let list = state.items.filter((it) => norm(canonicalCategory(it.category)) === norm(category));

  if (category === "Sauce") {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }

  // sort
  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

/* ---------- Helper text ---------- */
function getHelperText(it) {
  const mode = getMode(it);
  const sl = getShelfLifeDays(it);

  if (mode === "EOD") return "Expiry: End of day (auto).";
  if (mode === "HOURLY_FIXED") return "Expiry: Select fixed time (today).";
  if (mode === "MANUAL_DATE") return "Expiry: Staff sets date (manual).";
  if (mode === "AUTO") return `Expiry: Select date (0–${sl} day${sl === 1 ? "" : "s"}).`;
  return "Select expiry.";
}

/* ---------- Render: Category list ---------- */
function renderCategoryList() {
  updateTopBar();
  updateSessionPill();
  updateBottomNav();

  const { category, sauceSub } = state.view;
  const title = category === "Sauce" ? `Sauce • ${sauceSub}` : category;

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

  $("#backBtn").addEventListener("click", () => goBack());

  $$("[data-item-id]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-item-id"));
      const it = state.items.find((x) => Number(x.id) === id);
      if (!it) return;
      openLogModal(it);
    });
  });
}

/* ---------- Log modal (yellow save) ---------- */
function openLogModal(item) {
  const mode = getMode(item);
  const sl = getShelfLifeDays(item);
  const today = todayISODate();

  // Build expiry input
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
    // AUTO dropdown dates 0..sl (include today)
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

    // quantity
    const qtyRaw = (qtyInp?.value || "").trim();
    const qty = qtyRaw === "" ? null : Number(qtyRaw);
    if (qtyRaw !== "" && (!Number.isFinite(qty) || qty < 0)) {
      err.textContent = "Quantity must be a number (or blank).";
      err.classList.remove("hidden");
      return;
    }

    // expiry
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
      category: canonicalCategory(item.category),
      sub_category: item.sub_category || null,
      store: state.session.store,
      staff: state.session.staff,
      shift: state.session.shift,
      quantity: qty,
      // send date string for date-only, and expiry_at for datetime
      expiry: expiry_date || null,
      expiry_at: expiry_at || null,
      created_at: new Date().toISOString(),
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
  updateTopBar();
  updateSessionPill();
  updateBottomNav();

  main.innerHTML = `
    <div class="card">
      <div class="h1">Alerts</div>
      <div class="muted">Items with logged expiry (latest per item).</div>
      <div id="alertsWrap" class="muted" style="margin-top:12px;">Loading...</div>
    </div>
  `;

  const wrap = $("#alertsWrap");
  try {
    const rows = await apiGet(`/api/expiry?store=${encodeURIComponent(state.session.store)}`);
    if (!rows || !rows.length) {
      wrap.innerHTML = `<div class="muted">No logged expiry yet.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="card-title">Latest expiry for ${escapeHtml(state.session.store)}</div>
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

/* ---------- Manager login modal ---------- */
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
      setView({ page: "manager" }, true);
    } catch (e) {
      err.textContent = e?.message || "Login failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager page ---------- */
async function renderManager() {
  updateTopBar();
  updateSessionPill();
  updateBottomNav();

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
      <div class="h1">Manager</div>
      <div class="muted">
        For now, manager can:
        <ul style="margin:8px 0 0 18px;">
          <li>Edit item category / sauce sub-category / shelf life</li>
          <li>Add new item</li>
          <li>Delete item (with confirmation)</li>
        </ul>
        <div style="margin-top:8px;" class="muted">
          Note: Add/Delete requires server endpoints. If you see 404, your server does not have those routes yet.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Search</div>
      <input id="mgrSearch" class="input" placeholder="Type item name..." />
      <button id="btnAddItem" type="button"
        style="margin-top:10px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
        Add Item
      </button>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div id="mgrList" class="muted">Loading…</div>
    </div>
  `;

  $("#btnAddItem").addEventListener("click", openManagerAddItem);

  const listEl = $("#mgrList");
  const searchEl = $("#mgrSearch");

  let rows = [];
  try {
    rows = await apiManager("GET", "/api/manager/items");
  } catch (e) {
    listEl.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
    return;
  }

  function renderRows() {
    const q = norm(searchEl.value || "");
    const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;

    if (!filtered.length) {
      listEl.innerHTML = `<div class="muted">No matches.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .slice(0, 200) // avoid super long UI
      .map((r) => {
        const cat = canonicalCategory(r.category);
        const sub = r.sub_category || "";
        const sl = Number(r.shelf_life_days ?? 0);

        return `
          <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;">
            <div style="font-weight:1000;font-size:16px;margin-bottom:10px;">${escapeHtml(r.name)}</div>

            <div class="field">
              <label class="label">Category</label>
              <select class="input mgr-cat" data-id="${r.id}">
                ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${norm(c) === norm(cat) ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
              <select class="input mgr-sub" data-id="${r.id}">
                <option value="" ${sub ? "" : "selected"}>(none)</option>
                ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}" ${norm(s) === norm(sub) ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
              </select>
              <div class="helper">If category is not Sauce, sub-category should be empty.</div>
            </div>

            <div class="field">
              <label class="label">Shelf life (days)</label>
              <input class="input mgr-sl" data-id="${r.id}" inputmode="numeric" value="${escapeHtml(sl)}" />
              <div class="helper">&gt;7 days becomes manual in app.</div>
            </div>

            <div style="display:flex;gap:10px;">
              <button class="mgr-save" data-id="${r.id}" type="button"
                style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
                Save
              </button>
              <button class="mgr-del" data-id="${r.id}" type="button"
                style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:#fff;border:1px solid rgba(0,0,0,0.12);color:#c62828;cursor:pointer;">
                Delete
              </button>
            </div>

            <div class="mgr-err error hidden" data-id="${r.id}"></div>
          </div>
        `;
      })
      .join("");

    // bind save/delete
    $$(".mgr-save", listEl).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.mgr-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        const catSel = $(`.mgr-cat[data-id="${id}"]`, listEl);
        const subSel = $(`.mgr-sub[data-id="${id}"]`, listEl);
        const slInp = $(`.mgr-sl[data-id="${id}"]`, listEl);

        const category = String(catSel.value || "").trim();
        const sub_category = String(subSel.value || "").trim() || null;
        const shelf_life_days = Number(String(slInp.value || "0").trim());

        // enforce: if category != Sauce, sub_category must be null
        const finalSub = norm(category) === norm("Sauce") ? sub_category : null;

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

          // refresh items in app immediately
          await loadItems();
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

        if (!confirm("Delete this item? This cannot be undone.")) return;

        try {
          // requires server endpoint: DELETE /api/manager/items/:id
          await apiManager("DELETE", `/api/manager/items/${id}`);
          toast("Deleted ✅");

          // remove from list
          rows = rows.filter((x) => Number(x.id) !== id);

          await loadItems();
          renderRows();
        } catch (e) {
          err.textContent =
            (e.message || "") +
            " — If you see 404, your server does not have DELETE endpoint yet.";
          err.classList.remove("hidden");
        }
      });
    });
  }

  searchEl.addEventListener("input", renderRows);
  renderRows();
}

/* ---------- Manager: Add item modal ---------- */
function openManagerAddItem() {
  openModal(
    "Add Item",
    `
    <div class="modal-item-title">New item</div>

    <div class="field">
      <label class="label">Name</label>
      <input id="newName" class="input" placeholder="Item name" />
    </div>

    <div class="field">
      <label class="label">Category</label>
      <select id="newCat" class="input">
        ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
      </select>
    </div>

    <div class="field">
      <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
      <select id="newSub" class="input">
        <option value="" selected>(none)</option>
        ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
      </select>
      <div class="helper">If category is not Sauce, sub-category should be empty.</div>
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
      // requires server endpoint: POST /api/manager/items
      await apiManager("POST", "/api/manager/items", {
        name,
        category,
        sub_category: finalSub,
        shelf_life_days,
      });

      await loadItems();
      closeModal();
      toast("Added ✅");

      // go back to manager page refresh
      state.view = { page: "manager" };
      render();
    } catch (e) {
      err.textContent =
        (e.message || "Failed") +
        " — If you see 404, your server does not have POST endpoint yet.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Render router ---------- */
async function render() {
  if (!main) return;

  updateSessionPill();
  updateTopBar();
  updateBottomNav();

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  // if session not set → force session page
  if (!hasSession && state.view.page !== "session") {
    state.view = { page: "session", category: null, sauceSub: null };
  }

  // guard: if manager page but not logged in → still show manager page (it will show login)
  const page = state.view.page;

  if (page === "session") return renderSession();
  if (page === "home") return renderHome();
  if (page === "sauce_menu") return renderSauceMenu();
  if (page === "category") return renderCategoryList();
  if (page === "alerts") return renderAlerts();
  if (page === "manager") return renderManager();

  // fallback
  state.view = { page: "home", category: null, sauceSub: null };
  renderHome();
}

/* ---------- Boot ---------- */
async function boot() {
  ensureBottomNav();
  ensureToast();
  bindModal();
  bindBottomNav();
  bindSwipeBack();

  loadSession();
  setManagerToken(getManagerToken());

  // load items if session exists
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

  render();
}

/* ---------- Start after DOM ready (FIXED) ---------- */
function bootCrash(e) {
  console.error(e);
  if (main) {
    main.innerHTML = `<div class="card"><div class="h1">Error</div><div class="error">${escapeHtml(
      e?.message || e
    )}</div></div>`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => boot().catch(bootCrash));
} else {
  boot().catch(bootCrash);
}
