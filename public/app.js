/* =========================
   PreCheck — app.js (FULL)
   Single-file, safe copy/paste
   UI: keep your current style.css (green/yellow)
   Bottom nav: Home/Alerts/Manager/Logout
   Manager: soft delete only (items + categories)
   Home: categories loaded from DB (/api/categories) with fallback defaults
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

/* ---------- Defaults (fallback if DB categories fail) ---------- */
const DEFAULT_CATEGORIES = [
  { name: "Prepared items", sort_order: 10 },
  { name: "Unopened chiller", sort_order: 20 },
  { name: "Thawing", sort_order: 30 },
  { name: "Vegetables", sort_order: 40 },
  { name: "Backroom", sort_order: 50 },
  { name: "Back counter", sort_order: 60 },
  { name: "Front counter", sort_order: 70 },
  { name: "Back counter chiller", sort_order: 80 },
  { name: "Sauce", sort_order: 90 },
];
const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];

/* fixed time dropdown items */
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);

/* always manual date-only items */
const MANUAL_ALWAYS = new Set([]);

/* ---------- Tile meta (emoji = no missing icons) ---------- */
const TILE_META = {
  "Prepared items": { tone: "green", ico: "🧾" },
  "Unopened chiller": { tone: "blue", ico: "🧊" },
  "Thawing": { tone: "cyan", ico: "❄️" },
  "Vegetables": { tone: "lime", ico: "🥬" },
  "Backroom": { tone: "orange", ico: "📦" },
  "Back counter": { tone: "yellow", ico: "🧂" },
  "Front counter": { tone: "red", ico: "🥣" },
  "Back counter chiller": { tone: "teal", ico: "🧀" },
  Sauce: { tone: "purple", ico: "🧴" },
};

/* ---------- DOM ---------- */
const main = $("#main");
const sessionLine = $("#sessionLine");
const btnManagerTop = $("#btnManager");
const btnLogoutTop = $("#btnLogout");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

/* Bottom nav */
const navHome = $("#navHome");
const navAlerts = $("#navAlerts");
const navManager = $("#navManager");
const navLogout = $("#navLogout");
const bottomNav = $("#bottomNav");

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  categories: [], // from DB
  items: [],
  view: { page: "session", category: null, sauceSub: null },
  navStack: [],
};

/* ---------- Storage ---------- */
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

/* Manager token */
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
function toast(msg) {
  const t = $("#toast");
  if (!t) return alert(msg);
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
    updateSessionLine();
    updateNav();
    toast("Manager session expired. Login again.");
    throw new Error("unauthorized");
  }

  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* ---------- Data load ---------- */
async function loadCategories() {
  try {
    const rows = await apiGet("/api/categories");
    // rows: [{id,name,sort_order,active}]
    state.categories = (rows || [])
      .filter((c) => c && c.name)
      .map((c) => ({ id: c.id, name: c.name, sort_order: Number(c.sort_order ?? 0) }))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || norm(a.name).localeCompare(norm(b.name)));
  } catch {
    // fallback
    state.categories = DEFAULT_CATEGORIES.slice().sort((a, b) => a.sort_order - b.sort_order);
  }
}
async function loadItems() {
  const rows = await apiGet("/api/items");
  state.items = (rows || []).map((x) => ({
    ...x,
    category: String(x.category || "").trim(),
    sub_category: x.sub_category ?? null,
  }));
}

/* ---------- Expiry mode rules ---------- */
function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? item.shelfLifeDays ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function getMode(item) {
  const cat = String(item.category || "").trim();
  const nameN = norm(item.name);

  if (nameN === norm("Chicken Bacon (C)")) return "EOD";
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
  if (mode === "AUTO") return `Expiry: Select date (0–${sl} day${sl === 1 ? "" : "s"}).`;
  return "Select expiry.";
}

/* ---------- UI: session line (BADGES) ---------- */
function updateSessionLine() {
  if (!sessionLine) return;

  const store = state.session.store || "";
  const shift = state.session.shift || "";
  const staff = state.session.staff || "";

  const line = [store, shift, staff].filter(Boolean).join(" • ");

  // IMPORTANT: show ONLY ONE role badge
  const roleBadge = isManagerMode()
    ? `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#E53935;margin-right:8px;">MANAGER</span>`
    : `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#1E88E5;margin-right:8px;">STAFF</span>`;

  sessionLine.innerHTML = `${roleBadge} <strong>${escapeHtml(line || "")}</strong>`;
  sessionLine.classList.toggle("hidden", !line);
}

/* ---------- UI: nav show/hide + active ---------- */
function updateNav() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  if (bottomNav) bottomNav.classList.toggle("hidden", !hasSession);

  const setActive = (btn, on) => {
    if (!btn) return;
    btn.classList.toggle("active", !!on);
  };

  const page = state.view.page;
  setActive(navHome, page === "home" || page === "category" || page === "sauce_menu");
  setActive(navAlerts, page === "alerts");
  setActive(navManager, page === "manager");
  // navLogout never "active"

  // Topbar buttons show/hide
  if (btnManagerTop) btnManagerTop.classList.toggle("hidden", !hasSession);
  if (btnLogoutTop) btnLogoutTop.classList.toggle("hidden", !hasSession);

  // Manager button always available, it opens login if not manager
  if (btnManagerTop) btnManagerTop.textContent = isManagerMode() ? "Manager" : "Manager";
}

/* ---------- Navigation helpers ---------- */
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
  let sx = 0, sy = 0, st = 0;

  window.addEventListener("touchstart", (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    sx = t.clientX;
    sy = t.clientY;
    st = Date.now();
  }, { passive: true });

  window.addEventListener("touchend", (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    const dt = Date.now() - st;

    if (dx > 70 && Math.abs(dy) < 45 && dt < 600) {
      const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
      if (modalOpen) return;
      goBack();
    }
  }, { passive: true });

  window.addEventListener("popstate", () => {
    const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
    if (modalOpen) { closeModal(); return; }
    goBack();
  });

  try {
    history.replaceState({ t: Date.now() }, "");
    history.pushState({ t: Date.now() }, "");
  } catch {}
}

/* ---------- Bind top + bottom buttons ---------- */
function bindNavButtons() {
  // Bottom nav
  if (navHome) navHome.addEventListener("click", () => {
    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });
  if (navAlerts) navAlerts.addEventListener("click", () => setView({ page: "alerts" }, true));
  if (navManager) navManager.addEventListener("click", () => {
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  });
  if (navLogout) navLogout.addEventListener("click", logoutAction);

  // Topbar
  if (btnManagerTop) btnManagerTop.addEventListener("click", () => {
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  });
  if (btnLogoutTop) btnLogoutTop.addEventListener("click", logoutAction);
}

function logoutAction() {
  if (isManagerMode()) {
    if (!confirm("Exit manager mode and go back to staff mode?")) return;
    setManagerToken("");
    toast("Back to staff mode");
    updateSessionLine();
    updateNav();
    state.view = { page: "home", category: null, sauceSub: null };
    render();
    return;
  }

  if (!confirm("Logout staff session?")) return;
  state.session = { store: "", shift: "", staff: "" };
  saveSession();
  state.navStack = [];
  setManagerToken("");
  state.view = { page: "session", category: null, sauceSub: null };
  render();
}

/* ---------- Render: Session ---------- */
function renderSession() {
  updateSessionLine();
  updateNav();

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

      <button id="btnStart" class="btn btn-primary" type="button" style="width:100%;padding:14px 16px;">
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
      await Promise.all([loadCategories(), loadItems()]);
    } catch (e) {
      err.textContent = `Failed to load: ${e.message || e}`;
      err.classList.remove("hidden");
      return;
    }

    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });
}

/* ---------- Home counts ---------- */
function categoryCounts() {
  const counts = {};
  for (const c of state.categories) counts[c.name] = 0;

  for (const it of state.items) {
    const c = String(it.category || "").trim();
    if (counts[c] == null) counts[c] = 0;
    counts[c]++;
  }
  return counts;
}

/* ---------- Render: Home ---------- */
function renderHome() {
  updateSessionLine();
  updateNav();

  const counts = categoryCounts();

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>
      <div class="home-sub">Tap a category to log items.</div>

      <section class="grid tiles-grid">
        ${state.categories.map((c, idx) => {
          const cat = c.name;
          const meta = TILE_META[cat] || TILE_META["Prepared items"];
          const count = counts[cat] ?? 0;
          const delay = Math.min(0.6, idx * 0.05).toFixed(2);

          return `
            <button class="tile tile--${meta.tone}" style="animation-delay:${delay}s" data-cat="${escapeHtml(cat)}" type="button">
              <div class="tile-top">
                <div class="tile-icon" aria-hidden="true">${escapeHtml(meta.ico)}</div>
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
      if (norm(cat) === norm("Sauce")) setView({ page: "sauce_menu", category: "Sauce", sauceSub: null }, true);
      else setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });
}

/* ---------- Render: Sauce menu ---------- */
function renderSauceMenu() {
  updateSessionLine();
  updateNav();

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
              <div class="tile-icon" aria-hidden="true">${escapeHtml(meta.ico)}</div>
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

/* ---------- Items for current list ---------- */
function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;

  let list = state.items.filter((it) => norm(it.category) === norm(category));
  if (norm(category) === norm("Sauce")) {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

/* ---------- Render: Category list ---------- */
function renderCategoryList() {
  updateSessionLine();
  updateNav();

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

    <button id="btnSaveLog" class="btn btn-primary" type="button" style="margin-top:6px;width:100%;padding:14px 16px;">
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
  updateSessionLine();
  updateNav();

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

/* ---------- Manager login ---------- */
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

    <button id="btnPinLogin" class="btn btn-primary" type="button" style="width:100%;padding:14px 16px;">
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
      const out = await apiPost("/api/manager/login", { pin, store: state.session.store });

      setManagerToken(out.token || "");
      closeModal();
      toast("Manager mode ✅");
      updateSessionLine();
      updateNav();
      setView({ page: "manager" }, true);
    } catch (e) {
      err.textContent = e?.message || "Login failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager: Categories UI ---------- */
function openAddCategoryModal(onDone) {
  openModal(
    "Add Category",
    `
    <div class="field">
      <label class="label">Category name</label>
      <input id="catName" class="input" placeholder="e.g. Drinks" />
    </div>

    <div class="field">
      <label class="label">Sort order</label>
      <input id="catOrder" class="input" inputmode="numeric" value="100" />
      <div class="helper">Lower number shows higher on Home.</div>
    </div>

    <div id="catErr" class="error hidden"></div>

    <button id="catSave" class="btn btn-primary" type="button" style="width:100%;padding:14px 16px;">
      Save
    </button>
  `
  );

  const nameEl = $("#catName", modalBodyEl);
  const orderEl = $("#catOrder", modalBodyEl);
  const err = $("#catErr", modalBodyEl);

  $("#catSave", modalBodyEl).addEventListener("click", async () => {
    err.classList.add("hidden");
    const name = String(nameEl.value || "").trim();
    const sort_order = Number(String(orderEl.value || "0").trim());

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
      await apiManager("POST", "/api/manager/categories", { name, sort_order });
      closeModal();
      toast("Category added ✅");
      await loadCategories();
      onDone?.();
    } catch (e) {
      err.textContent = e?.message || "Failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager: Items add modal ---------- */
function openManagerAddItem(onDone) {
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
        ${state.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("")}
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

    <button id="btnAddSave" class="btn btn-primary" type="button" style="width:100%;padding:14px 16px;">
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
        name,
        category,
        sub_category: finalSub,
        shelf_life_days,
      });

      await loadItems();
      closeModal();
      toast("Item added ✅");
      onDone?.();
    } catch (e) {
      err.textContent = e?.message || "Failed";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Render: Manager ---------- */
async function renderManager() {
  updateSessionLine();
  updateNav();

  if (!isManagerMode()) {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted">Login required.</div>
        <button id="btnGoLogin" class="btn btn-primary" type="button" style="margin-top:12px;width:100%;padding:14px 16px;">
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
        Soft delete only (safe). Deleted items/categories are hidden from staff.
      </div>
    </div>

    <div class="card">
      <div class="card-title">Categories</div>
      <button id="btnAddCat" class="btn btn-primary" type="button" style="width:100%;padding:14px 16px;">
        Add Category
      </button>
      <div id="catList" class="muted" style="margin-top:12px;">Loading…</div>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <input id="mgrSearch" class="input" placeholder="Type item name..." />
      <button id="btnAddItem" class="btn btn-primary" type="button" style="margin-top:10px;width:100%;padding:14px 16px;">
        Add Item
      </button>
      <div id="mgrList" class="muted" style="margin-top:12px;">Loading…</div>
    </div>
  `;

  // Categories
  const catListEl = $("#catList");
  $("#btnAddCat").addEventListener("click", () => openAddCategoryModal(() => renderManager()));
  let cats = [];
  try {
    cats = await apiManager("GET", "/api/manager/categories");
  } catch (e) {
    catListEl.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
    cats = [];
  }

  if (!cats.length) {
    catListEl.innerHTML = `<div class="muted">No categories found.</div>`;
  } else {
    catListEl.innerHTML = cats
      .filter((c) => !c.deleted_at)
      .map((c) => {
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px dashed rgba(0,0,0,0.10);">
            <div>
              <div style="font-weight:1000">${escapeHtml(c.name)}</div>
              <div class="muted">Order: ${escapeHtml(c.sort_order ?? 0)}</div>
            </div>
            <button class="btn-ghost cat-del" data-id="${c.id}" type="button" style="color:#c62828;">
              Delete
            </button>
          </div>
        `;
      })
      .join("");

    $$(".cat-del", catListEl).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        if (!confirm("Soft delete this category? (It will disappear from Home)")) return;

        try {
          await apiManager("DELETE", `/api/manager/categories/${id}`);
          toast("Category deleted ✅");
          await loadCategories();
          renderManager();
        } catch (e) {
          alert(e?.message || "Delete failed");
        }
      });
    });
  }

  // Items
  $("#btnAddItem").addEventListener("click", () => openManagerAddItem(() => renderManager()));

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
      .slice(0, 200)
      .map((r) => {
        const cat = String(r.category || "").trim();
        const sub = r.sub_category || "";
        const sl = Number(r.shelf_life_days ?? 0);

        return `
          <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;">
            <div style="font-weight:1000;font-size:16px;margin-bottom:10px;">${escapeHtml(r.name)}</div>

            <div class="field">
              <label class="label">Category</label>
              <select class="input mgr-cat" data-id="${r.id}">
                ${state.categories.map((c) => {
                  const name = c.name;
                  return `<option value="${escapeHtml(name)}" ${norm(name) === norm(cat) ? "selected" : ""}>${escapeHtml(name)}</option>`;
                }).join("")}
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
              <button class="btn btn-primary mgr-save" data-id="${r.id}" type="button" style="flex:1;padding:12px 14px;">
                Save
              </button>
              <button class="btn-ghost mgr-del" data-id="${r.id}" type="button" style="flex:1;color:#c62828;">
                Delete
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
        const sub_category = String(subSel.value || "").trim() || null;
        const shelf_life_days = Number(String(slInp.value || "0").trim());

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

        if (!confirm("Soft delete this item? (Staff will not see it)")) return;

        try {
          await apiManager("DELETE", `/api/manager/items/${id}`);
          toast("Deleted ✅");

          rows = rows.filter((x) => Number(x.id) !== id);
          await loadItems();
          renderRows();
        } catch (e) {
          err.textContent = e.message || "Delete failed.";
          err.classList.remove("hidden");
        }
      });
    });
  }

  searchEl.addEventListener("input", renderRows);
  renderRows();
}

/* ---------- Render router ---------- */
async function render() {
  if (!main) return;

  updateSessionLine();
  updateNav();

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  if (!hasSession && state.view.page !== "session") {
    state.view = { page: "session", category: null, sauceSub: null };
  }

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
  bindNavButtons();

  loadSession();

  // load data if session exists
  if (state.session.store && state.session.shift && state.session.staff) {
    try {
      await Promise.all([loadCategories(), loadItems()]);
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
    main.innerHTML = `<div class="card"><div class="h1">Error</div><div class="error">${escapeHtml(
      e?.message || e
    )}</div></div>`;
  }
});
