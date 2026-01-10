/* =========================
   PreCheck — app.js (FULL)
   Single-file, safe copy/paste
   UI: topbar + bottom nav (Home/Alerts/Manager/Logout)
   Manager: PIN login + edit items + add/delete (needs server endpoints)
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
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);
const MANUAL_ALWAYS = new Set([]);

/* ---------- DOM ---------- */
const main = $("#main");
const sessionLine = $("#sessionLine");

const btnManagerTop = $("#btnManager");
const btnLogoutTop = $("#btnLogout");

const bottomNav = $("#bottomNav");
const navHome = $("#navHome");
const navAlerts = $("#navAlerts");
const navManagerTab = $("#navManagerTab");
const navLogoutTab = $("#navLogoutTab");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

const toastEl = $("#toast");

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
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

/* ---------- Toast ---------- */
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 1600);
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
if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
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
    updateBars();
    toast("Manager expired. Login again.");
    throw new Error("unauthorized");
  }

  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* ---------- Helpers ---------- */
function canonicalCategory(cat) {
  const n = norm(cat);
  const hit = CATEGORIES.find((x) => norm(x) === n);
  return hit || String(cat || "").trim() || "Unknown";
}
function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? item.shelfLifeDays ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function getMode(item) {
  const cat = canonicalCategory(item.category);
  const nameN = norm(item.name);

  // Example rule
  if (nameN === norm("Chicken Bacon (C)")) return "EOD";

  if (cat === "Unopened chiller") return "MANUAL_DATE";
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

/* ---------- UI: Topbar + BottomNav ---------- */
function updateSessionLine() {
  if (!sessionLine) return;

  const { store, shift, staff } = state.session;
  const hasSession = !!(store && shift && staff);

  if (!hasSession) {
    sessionLine.classList.add("hidden");
    sessionLine.innerHTML = "";
    return;
  }

  const staffBadge = `<span style="display:inline-flex;align-items:center;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#1E88E5;margin-right:10px;">STAFF</span>`;
  const managerBadge = isManagerMode()
    ? `<span style="display:inline-flex;align-items:center;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#E53935;margin-right:10px;">MANAGER</span>`
    : "";

  sessionLine.innerHTML = `${managerBadge}${staffBadge}<strong>${escapeHtml(store)} • ${escapeHtml(shift)} • ${escapeHtml(staff)}</strong>`;
  sessionLine.classList.remove("hidden");
}

function updateBars() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  // top right buttons
  if (btnManagerTop) btnManagerTop.classList.toggle("hidden", !hasSession);
  if (btnLogoutTop) btnLogoutTop.classList.toggle("hidden", !hasSession && !isManagerMode());

  // bottom nav
  if (bottomNav) bottomNav.classList.toggle("hidden", !hasSession);

  // active tab
  const page = state.view.page;
  const setActive = (el, on) => el && el.classList.toggle("active", !!on);

  setActive(navHome, page === "home" || page === "category" || page === "sauce_menu");
  setActive(navAlerts, page === "alerts");
  setActive(navManagerTab, page === "manager");
}

/* ---------- Navigation ---------- */
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
  const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
  if (modalOpen) {
    closeModal();
    return;
  }

  const prev = state.navStack.pop();
  if (prev) {
    state.view = prev;
    render();
    return;
  }

  // confirm exit at root
  if (!confirm("Exit PreCheck?")) {
    try {
      history.pushState({ t: Date.now() }, "");
    } catch {}
  }
}

/* ---------- Swipe Back + Browser Back ---------- */
function bindSwipeBack() {
  let sx = 0,
    sy = 0,
    st = 0;

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

      if (dx > 70 && Math.abs(dy) < 45 && dt < 650) {
        const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
        if (modalOpen) return;
        goBack();
      }
    },
    { passive: true }
  );

  window.addEventListener("popstate", () => goBack());

  try {
    history.replaceState({ t: Date.now() }, "");
    history.pushState({ t: Date.now() }, "");
  } catch {}
}

/* ---------- Bind Buttons ---------- */
function bindTopButtons() {
  if (btnManagerTop) {
    btnManagerTop.addEventListener("click", () => {
      if (isManagerMode()) setView({ page: "manager" }, true);
      else openManagerLogin();
    });
  }

  if (btnLogoutTop) {
    btnLogoutTop.addEventListener("click", () => {
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
    });
  }
}

function bindBottomNav() {
  if (!navHome || !navAlerts || !navManagerTab || !navLogoutTab) {
    console.warn("[PreCheck] bottom nav missing (check index.html)");
    return;
  }

  if (navHome.dataset.bound === "1") return;
  navHome.dataset.bound = "1";

  navHome.addEventListener("click", () => {
    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });

  navAlerts.addEventListener("click", () => setView({ page: "alerts" }, true));

  navManagerTab.addEventListener("click", () => {
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  });

  navLogoutTab.addEventListener("click", () => {
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
  });
}

/* ---------- Data ---------- */
async function loadItems() {
  const rows = await apiGet("/api/items");
  state.items = (rows || []).map((x) => ({
    ...x,
    category: canonicalCategory(x.category),
    sub_category: x.sub_category ?? null,
  }));
}
function categoryCounts() {
  const counts = {};
  for (const c of CATEGORIES) counts[c] = 0;
  for (const it of state.items) {
    const c = canonicalCategory(it.category);
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}

/* ---------- Pages ---------- */
function renderSession() {
  updateSessionLine();
  updateBars();

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

function renderHome() {
  updateSessionLine();
  updateBars();

  const counts = categoryCounts();

  // emoji icons (simple + always works)
  const iconMap = {
    "Prepared items": "🧾",
    "Unopened chiller": "🧊",
    "Thawing": "❄️",
    "Vegetables": "🥬",
    "Backroom": "📦",
    "Back counter": "🧂",
    "Front counter": "🍲",
    "Back counter chiller": "🧀",
    Sauce: "🧴",
  };

  const toneMap = {
    "Prepared items": "green",
    "Unopened chiller": "blue",
    "Thawing": "cyan",
    "Vegetables": "lime",
    "Backroom": "orange",
    "Back counter": "yellow",
    "Front counter": "red",
    "Back counter chiller": "teal",
    Sauce: "purple",
  };

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>
      <div class="home-sub">Tap a category to log items.</div>

      <section class="grid">
        ${CATEGORIES
          .map((cat) => {
            const tone = toneMap[cat] || "green";
            const count = counts[cat] ?? 0;
            const ico = iconMap[cat] || "✅";

            return `
              <button class="tile tile--${tone}" data-cat="${escapeHtml(cat)}" type="button">
                <div class="tile-top">
                  <div class="tile-icon" aria-hidden="true">${ico}</div>
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

  $$("[data-cat]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "Sauce") setView({ page: "sauce_menu", category: "Sauce", sauceSub: null }, true);
      else setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });
}


function renderSauceMenu() {
  updateSessionLine();
  updateBars();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid">
      ${SAUCE_SUBS
        .map(
          (s) => `
        <button class="tile tile--purple" data-sauce="${escapeHtml(s)}" type="button">
          <div class="tile-top">
            <div class="tile-icon" aria-hidden="true">🧴</div>
          </div>
          <div class="tile-title">${escapeHtml(s)}</div>
          <div class="tile-sub">Tap to view items</div>
        </button>
      `
        )
        .join("")}
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


function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;

  let list = state.items.filter((it) => norm(canonicalCategory(it.category)) === norm(category));
  if (category === "Sauce") {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

function renderCategoryList() {
  updateSessionLine();
  updateBars();

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
          ? list.map((it) => `
              <button class="list-row" data-item-id="${it.id}" type="button">
                <div>
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
      </div>`;
  } else if (mode === "HOURLY_FIXED") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Time (Today)</label>
        <select id="expTime" class="input">
          <option value="">Select time</option>
          ${FIXED_TIME_SLOTS.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <div class="helper">Fixed time dropdown (today).</div>
      </div>`;
  } else if (mode === "EOD") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry</label>
        <div class="pill" style="display:flex;align-items:center;justify-content:space-between;">
          <span>End of day (today)</span>
          <span style="font-weight:1000;color:var(--green-dark);">${escapeHtml(today)}</span>
        </div>
        <div class="helper">Auto-set to 23:59 today.</div>
      </div>`;
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
      </div>`;
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

    <button id="btnSaveLog" class="btn btn-primary" type="button" style="width:100%;padding:14px 16px;">
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
      category: canonicalCategory(item.category),
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

async function renderAlerts() {
  updateSessionLine();
  updateBars();

  main.innerHTML = `
    <div class="card">
      <div class="h1">Alerts</div>
      <div class="muted">Latest expiry logged per item for this store.</div>
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
      ${rows.map((r) => `
        <div class="alert-row">
          <div>
            <div class="alert-name">${escapeHtml(r.name)}</div>
            <div class="alert-extra">${escapeHtml(r.category)}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
          </div>
          <div style="font-weight:1000;color:var(--green-dark)">${escapeHtml(r.expiry_value || "-")}</div>
        </div>
      `).join("")}
    `;
  } catch (e) {
    wrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
}

/* ---------- Manager ---------- */
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

async function renderManager() {
  updateSessionLine();
  updateBars();

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
        Manager can (current):
        <ul style="margin:8px 0 0 18px;">
          <li>Edit item category / sauce sub-category / shelf life</li>
          <li>Add new item (needs server POST endpoint)</li>
          <li>Delete item (needs server DELETE endpoint)</li>
        </ul>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Search</div>
      <input id="mgrSearch" class="input" placeholder="Type item name..." />
      <button id="btnAddItem" class="btn btn-primary" type="button" style="margin-top:10px;width:100%;padding:14px 16px;">
        Add Item
      </button>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div id="mgrList" class="muted">Loading…</div>
    </div>
  `;

  const listEl = $("#mgrList");
  const searchEl = $("#mgrSearch");
  $("#btnAddItem").addEventListener("click", openManagerAddItem);

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
              <button class="mgr-save btn btn-primary" data-id="${r.id}" type="button" style="flex:1;padding:12px 14px;">
                Save
              </button>
              <button class="mgr-del btn" data-id="${r.id}" type="button" style="flex:1;padding:12px 14px;color:#c62828;">
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
          await loadItems(); // refresh staff lists
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
          // requires: DELETE /api/manager/items/:id
          await apiManager("DELETE", `/api/manager/items/${id}`);
          toast("Deleted ✅");
          rows = rows.filter((x) => Number(x.id) !== id);
          await loadItems();
          renderRows();
        } catch (e) {
          err.textContent = (e.message || "Delete failed") + " (If 404: server endpoint not added yet)";
          err.classList.remove("hidden");
        }
      });
    });
  }

  searchEl.addEventListener("input", renderRows);
  renderRows();
}

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
    const finalSub = norm(category) === norm("Sauce") ? sub : null;

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

    try {
      // requires: POST /api/manager/items
      await apiManager("POST", "/api/manager/items", {
        name,
        category,
        sub_category: finalSub,
        shelf_life_days,
      });

      await loadItems();
      closeModal();
      toast("Added ✅");
      state.view = { page: "manager" };
      render();
    } catch (e) {
      err.textContent = (e.message || "Failed") + " (If 404: server endpoint not added yet)";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Render Router ---------- */
async function render() {
  if (!main) return;

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  updateSessionLine();
  updateBars();

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
  return renderHome();
}

/* ---------- Boot ---------- */
async function boot() {
  loadSession();

  bindTopButtons();
  bindBottomNav();
  bindSwipeBack();

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

boot().catch((e) => {
  console.error(e);
  if (main) {
    main.innerHTML = `<div class="card"><div class="h1">Error</div><div class="error">${escapeHtml(
      e?.message || e
    )}</div></div>`;
  }
});
