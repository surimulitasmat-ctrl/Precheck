/* =========================
   PreCheck — app.js (FULL)
   UI: bottom nav + yellow primary buttons
   Session at top bar: role badge + store/shift/staff
   Store-separated items & categories (API expects ?store=)
   Manager mode: PIN login + manage Items + manage Categories (soft delete)
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
function toast(msg) {
  const t = $("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 1600);
}

/* ---------- DOM ---------- */
const main = $("#main");
const sessionLine = $("#sessionLine");
const btnManagerTop = $("#btnManager");
const btnLogoutTop = $("#btnLogout");

/* ---------- Modal ---------- */
const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

function openModal(title, bodyHtml) {
  if (!modalBackdrop || !modalTitleEl || !modalBodyEl) {
    alert(title || "Notice");
    return;
  }
  modalTitleEl.textContent = title || " ";
  modalBodyEl.innerHTML = bodyHtml || "";
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
}
function closeModal() {
  if (!modalBackdrop || !modalBodyEl) return;
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

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  categories: [], // store-specific from DB
  items: [],      // store-specific from DB
  view: { page: "session", category: null, sauceSub: null },
  navStack: [],
  manager: { token: "" },
};

/* ---------- Storage ---------- */
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") {
      state.session = {
        store: s.store || "",
        shift: s.shift || "",
        staff: s.staff || "",
      };
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
  state.manager.token = t || "";
}
function isManagerMode() {
  return !!getManagerToken();
}

/* ---------- Icons (tiles) ---------- */
const ICONS = {
  receipt: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2h12v20l-2-1-2 1-2-1-2 1-2-1-2 1V2Z"></path>
      <path d="M9 7h6"></path>
      <path d="M9 11h6"></path>
      <path d="M9 15h4"></path>
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
  sauce: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 2h4"></path>
      <path d="M10 2v3l-1 1v2l-1 2v9a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-9l-1-2V6l-1-1V2"></path>
      <path d="M9 12h6"></path>
    </svg>`,
};

const DEFAULT_TONE = "green";
function toneForCategory(name) {
  const n = norm(name);
  if (n.includes("prepared")) return "green";
  if (n.includes("unopened")) return "blue";
  if (n.includes("thaw")) return "cyan";
  if (n.includes("veget")) return "lime";
  if (n.includes("backroom")) return "orange";
  if (n.includes("front")) return "red";
  if (n.includes("chiller")) return "teal";
  if (n.includes("sauce")) return "purple";
  if (n.includes("back counter")) return "yellow";
  return DEFAULT_TONE;
}
function iconForCategory(name) {
  const n = norm(name);
  if (n.includes("prepared")) return ICONS.receipt;
  if (n.includes("unopened")) return ICONS.snow;
  if (n.includes("thaw")) return ICONS.snow;
  if (n.includes("veget")) return ICONS.leaf;
  if (n.includes("backroom")) return ICONS.box;
  if (n.includes("front")) return ICONS.counter;
  if (n.includes("chiller")) return ICONS.snow;
  if (n.includes("sauce")) return ICONS.sauce;
  if (n.includes("counter")) return ICONS.counter;
  return ICONS.receipt;
}

/* ---------- Expiry rules ---------- */
const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);

function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function getMode(item) {
  const cat = String(item.category || "");
  const nameN = norm(item.name);

  if (nameN === norm("Chicken Bacon (C)")) return "EOD";
  if (norm(cat) === norm("Unopened chiller")) return "MANUAL_DATE";
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
    toast("Manager session expired. Login again.");
    throw new Error("unauthorized");
  }

  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* ---------- Data load (STORE-SPECIFIC) ---------- */
async function loadCategories() {
  const store = state.session.store;
  state.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
}
async function loadItems() {
  const store = state.session.store;
  state.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);
}

/* ---------- UI: top session line (FIX: only ONE badge) ---------- */
function updateSessionLine() {
  if (!sessionLine) return;

  const store = state.session.store || "";
  const shift = state.session.shift || "";
  const staff = state.session.staff || "";

  const role = isManagerMode() ? "MANAGER" : "STAFF";
  const roleColor = isManagerMode() ? "#E53935" : "#1E88E5";

  const line = [store, shift, staff].filter(Boolean).join(" • ");

  if (!line) {
    sessionLine.classList.add("hidden");
    sessionLine.innerHTML = "";
    return;
  }

  sessionLine.classList.remove("hidden");
  sessionLine.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:${roleColor};margin-right:8px;">
      ${role}
    </span>
    <span style="font-weight:1000;">${escapeHtml(line)}</span>
  `;
}

/* ---------- Bottom nav ---------- */
function updateBottomNav() {
  const nav = $("#bottomNav");
  if (!nav) return;

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  nav.classList.toggle("hidden", !hasSession);

  const active = (id, on) => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("active", !!on);
  };

  const page = state.view.page;
  active("#navHome", page === "home" || page === "category" || page === "sauce_menu");
  active("#navAlerts", page === "alerts");
  active("#navManager", page === "manager");
}

function bindBottomNav() {
  const navHome = $("#navHome");
  const navAlerts = $("#navAlerts");
  const navManager = $("#navManager");
  const navLogout = $("#navLogout");

  // SAFE: if any missing, just skip (prevents your old “dataset null” crash)
  if (!navHome || !navAlerts || !navManager || !navLogout) return;

  if (navHome.dataset.bound === "1") return;
  navHome.dataset.bound = "1";

  navHome.addEventListener("click", () => {
    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });

  navAlerts.addEventListener("click", () => setView({ page: "alerts" }, true));

  navManager.addEventListener("click", () => {
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  });

  navLogout.addEventListener("click", () => {
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

/* ---------- Navigation ---------- */
function setView(next, push = true) {
  const prev = { ...state.view };
  state.view = { ...next };
  if (push) state.navStack.push(prev);
  render();
}
function goBack() {
  const prev = state.navStack.pop();
  if (prev) {
    state.view = prev;
    render();
  } else {
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  }
}

/* ---------- Render: Session ---------- */
function renderSession() {
  updateSessionLine();
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
      await loadCategories();
      await loadItems();
      state.navStack = [];
      state.view = { page: "home", category: null, sauceSub: null };
      render();
    } catch (e) {
      err.textContent = `Failed to load: ${e.message || e}`;
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Home counts ---------- */
function categoryCounts() {
  const counts = {};
  for (const c of state.categories) counts[c.name] = 0;
  for (const it of state.items) {
    const c = it.category;
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}

/* ---------- Render: Home ---------- */
function renderHome() {
  updateSessionLine();
  updateBottomNav();

  const counts = categoryCounts();

  const cats = (state.categories || []).slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>
      <div class="home-sub">Tap a category to log items.</div>

      <section class="grid tiles-grid">
        ${cats
          .map((c, idx) => {
            const tone = toneForCategory(c.name);
            const icon = iconForCategory(c.name);
            const count = counts[c.name] ?? 0;
            const delay = Math.min(0.6, idx * 0.05).toFixed(2);

            return `
              <button class="tile tile--${tone}" style="animation-delay:${delay}s" data-cat="${escapeHtml(c.name)}" type="button">
                <div class="tile-top">
                  <div class="tile-icon" aria-hidden="true">${icon}</div>
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
      if (norm(cat) === norm("Sauce")) setView({ page: "sauce_menu", category: "Sauce", sauceSub: null }, true);
      else setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });
}

/* ---------- Render: Sauce menu ---------- */
function renderSauceMenu() {
  updateSessionLine();
  updateBottomNav();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid">
      ${SAUCE_SUBS.map((s) => {
        const tone = "purple";
        const icon = ICONS.sauce;
        return `
          <button class="tile tile--${tone}" data-sauce="${escapeHtml(s)}" type="button">
            <div class="tile-top">
              <div class="tile-icon" aria-hidden="true">${icon}</div>
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

function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;
  let list = (state.items || []).filter((it) => norm(it.category) === norm(category));

  if (norm(category) === norm("Sauce")) {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

/* ---------- Render: Category list ---------- */
function renderCategoryList() {
  updateSessionLine();
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
      store: state.session.store,
      shift: state.session.shift,
      staff: state.session.staff,
      item_id: item.id,
      item_name: item.name,
      category: item.category,
      sub_category: item.sub_category || null,
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
  updateBottomNav();

  main.innerHTML = `
    <div class="card">
      <div class="h1">Alerts</div>
      <div class="muted">Latest expiry per item (this store only).</div>
      <div id="alertsWrap" class="muted" style="margin-top:12px;">Loading...</div>
    </div>
  `;

  const wrap = $("#alertsWrap");
  try {
    const store = state.session.store;
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

/* ---------- Manager: Categories + Items (soft delete) ---------- */
async function renderManager() {
  updateSessionLine();
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
        Store: <strong>${escapeHtml(state.session.store)}</strong><br/>
        Categories + Items are <strong>separate per store</strong>.
      </div>
    </div>

    <div class="card">
      <div class="card-title">Categories</div>
      <div class="muted">Add / rename / soft delete categories for this store.</div>

      <div style="display:flex;gap:10px;margin-top:10px;">
        <input id="catNewName" class="input" placeholder="New category name" />
        <button id="btnCatAdd" type="button"
          style="white-space:nowrap;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
          Add
        </button>
      </div>

      <div id="catErr" class="error hidden"></div>
      <div id="catList" class="muted" style="margin-top:10px;">Loading…</div>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div class="muted">Add / edit / soft delete items for this store.</div>

      <input id="mgrSearch" class="input" placeholder="Search item name..." style="margin-top:10px;" />
      <button id="btnAddItem" type="button"
        style="margin-top:10px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
        Add Item
      </button>

      <div id="mgrList" class="muted" style="margin-top:10px;">Loading…</div>
    </div>
  `;

  const store = state.session.store;

  // ---- Categories ----
  const catList = $("#catList");
  const catErr = $("#catErr");
  const catNewName = $("#catNewName");
  const btnCatAdd = $("#btnCatAdd");

  let cats = [];
  try {
    cats = await apiManager("GET", `/api/manager/categories?store=${encodeURIComponent(store)}`);
  } catch (e) {
    catList.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
    cats = [];
  }

  function renderCats() {
    if (!cats.length) {
      catList.innerHTML = `<div class="muted">No categories yet.</div>`;
      return;
    }

    catList.innerHTML = cats
      .slice()
      .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
      .map((c) => {
        return `
          <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;">
            <div style="font-weight:1000;font-size:16px;margin-bottom:10px;">${escapeHtml(c.name)}</div>

            <div class="field">
              <label class="label">Name</label>
              <input class="input cat-name" data-id="${c.id}" value="${escapeHtml(c.name)}" />
            </div>

            <div class="field">
              <label class="label">Sort order</label>
              <input class="input cat-sort" data-id="${c.id}" inputmode="numeric" value="${escapeHtml(c.sort_order ?? 10)}" />
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

            <div class="cat-row-err error hidden" data-id="${c.id}"></div>
          </div>
        `;
      })
      .join("");

    $$(".cat-save", catList).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const rowErr = $(`.cat-row-err[data-id="${id}"]`, catList);
        rowErr.classList.add("hidden");

        const nameEl = $(`.cat-name[data-id="${id}"]`, catList);
        const sortEl = $(`.cat-sort[data-id="${id}"]`, catList);

        const name = String(nameEl.value || "").trim();
        const sort_order = Number(String(sortEl.value || "10").trim());

        if (!name) {
          rowErr.textContent = "Name required.";
          rowErr.classList.remove("hidden");
          return;
        }
        if (!Number.isFinite(sort_order)) {
          rowErr.textContent = "Sort order must be a number.";
          rowErr.classList.remove("hidden");
          return;
        }

        try {
          await apiManager("PATCH", `/api/manager/categories/${id}`, { store, name, sort_order });
          toast("Category saved ✅");
          cats = await apiManager("GET", `/api/manager/categories?store=${encodeURIComponent(store)}`);
          await loadCategories();
          renderCats();
        } catch (e) {
          rowErr.textContent = e.message || "Save failed.";
          rowErr.classList.remove("hidden");
        }
      });
    });

    $$(".cat-del", catList).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const rowErr = $(`.cat-row-err[data-id="${id}"]`, catList);
        rowErr.classList.add("hidden");

        if (!confirm("Soft delete this category? (You can restore later in DB)")) return;

        try {
          await apiManager("DELETE", `/api/manager/categories/${id}?store=${encodeURIComponent(store)}`);
          toast("Category deleted ✅");
          cats = cats.filter((x) => Number(x.id) !== id);
          await loadCategories();
          renderCats();
        } catch (e) {
          rowErr.textContent = e.message || "Delete failed.";
          rowErr.classList.remove("hidden");
        }
      });
    });
  }

  btnCatAdd.addEventListener("click", async () => {
    catErr.classList.add("hidden");
    const name = String(catNewName.value || "").trim();
    if (!name) {
      catErr.textContent = "Category name required.";
      catErr.classList.remove("hidden");
      return;
    }

    try {
      await apiManager("POST", `/api/manager/categories`, { store, name });
      catNewName.value = "";
      toast("Category added ✅");
      cats = await apiManager("GET", `/api/manager/categories?store=${encodeURIComponent(store)}`);
      await loadCategories();
      renderCats();
    } catch (e) {
      catErr.textContent = e.message || "Add failed.";
      catErr.classList.remove("hidden");
    }
  });

  renderCats();

  // ---- Items ----
  const listEl = $("#mgrList");
  const searchEl = $("#mgrSearch");

  let rows = [];
  try {
    rows = await apiManager("GET", `/api/manager/items?store=${encodeURIComponent(store)}`);
  } catch (e) {
    listEl.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
    rows = [];
  }

  $("#btnAddItem").addEventListener("click", () => openManagerAddItem(store));

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
        const cat = r.category || "";
        const sub = r.sub_category || "";
        const sl = Number(r.shelf_life_days ?? 0);

        return `
          <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;">
            <div style="font-weight:1000;font-size:16px;margin-bottom:10px;">${escapeHtml(r.name)}</div>

            <div class="field">
              <label class="label">Category</label>
              <select class="input mgr-cat" data-id="${r.id}">
                ${(state.categories || [])
                  .map((c) => `<option value="${escapeHtml(c.name)}" ${norm(c.name) === norm(cat) ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
                  .join("")}
              </select>
            </div>

            <div class="field">
              <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
              <select class="input mgr-sub" data-id="${r.id}">
                <option value="" ${sub ? "" : "selected"}>(none)</option>
                ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}" ${norm(s) === norm(sub) ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label class="label">Shelf life (days)</label>
              <input class="input mgr-sl" data-id="${r.id}" inputmode="numeric" value="${escapeHtml(sl)}" />
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
            store,
            category,
            sub_category: finalSub,
            shelf_life_days,
          });
          toast("Saved ✅");

          await loadItems(); // refresh app
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
          await apiManager("DELETE", `/api/manager/items/${id}?store=${encodeURIComponent(store)}`);
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

/* ---------- Manager: Add item ---------- */
function openManagerAddItem(store) {
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
          ${(state.categories || []).map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("")}
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

      await loadItems();
      closeModal();
      toast("Added ✅");
      state.view = { page: "manager" };
      render();
    } catch (e) {
      err.textContent = e.message || "Add failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Router ---------- */
async function render() {
  if (!main) return;

  updateSessionLine();
  updateBottomNav();

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  if (!hasSession) state.view = { page: "session", category: null, sauceSub: null };

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

/* ---------- Top buttons ---------- */
function bindTopButtons() {
  if (btnManagerTop) {
    btnManagerTop.addEventListener("click", () => {
      if (isManagerMode()) setView({ page: "manager" }, true);
      else openManagerLogin();
    });
  }
  if (btnLogoutTop) {
    btnLogoutTop.addEventListener("click", () => {
      // same behavior as navLogout
      const navLogout = $("#navLogout");
      if (navLogout) navLogout.click();
    });
  }
}

/* ---------- Boot ---------- */
async function boot() {
  bindModal();
  bindBottomNav();
  bindTopButtons();

  loadSession();
  setManagerToken(getManagerToken());

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  if (hasSession) {
    try {
      await loadCategories();
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
    main.innerHTML = `
      <div class="card">
        <div class="h1">Error</div>
        <div class="error">${escapeHtml(e?.message || e)}</div>
      </div>
    `;
  }
});
