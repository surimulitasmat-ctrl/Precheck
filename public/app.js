/* =========================
   PreCheck — app.js (FULL)
   - Top bar: badges + session line
   - Bottom nav: Home / Alerts / Manager / Logout
   - Yellow buttons: Start / Save / Login / OK
   - Store-separated categories + items
   - Manager: add/edit/delete categories + items (soft delete)
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

/* ---------- DOM ---------- */
const main = $("#main");
const sessionLine = $("#sessionLine");
const btnManagerTop = $("#btnManager");
const btnLogoutTop = $("#btnLogout");

const navHome = $("#navHome");
const navAlerts = $("#navAlerts");
const navManager = $("#navManager");
const navLogout = $("#navLogout");
const bottomNav = $("#bottomNav");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

const toastEl = $("#toast");

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  categories: [], // store-scoped
  items: [], // store-scoped
  view: { page: "session", category: null },
  manager: { token: "" },
  navStack: [],
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

/* ---------- Modal ---------- */
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

/* ---------- Toast ---------- */
function toast(msg) {
  if (!toastEl) return alert(msg);
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 1600);
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

/* ---------- Expiry rules ---------- */
const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);
const MANUAL_ALWAYS = new Set([]); // add names if you want forced manual

function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function getMode(item) {
  const cat = String(item.category || "").trim();
  const nameN = norm(item.name);

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

/* ---------- UI updates ---------- */
function updateSessionLine() {
  if (!sessionLine) return;

  const store = state.session.store || "";
  const shift = state.session.shift || "";
  const staff = state.session.staff || "";

  const hasSession = !!(store && shift && staff);

  const roleBadge = isManagerMode()
    ? `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#E53935;">MANAGER</span>`
    : `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:1000;font-size:12px;color:#fff;background:#1E88E5;">STAFF</span>`;

  const line = [store, shift, staff].filter(Boolean).join(" • ");

  sessionLine.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      ${roleBadge}
      <span style="font-weight:1000;">${escapeHtml(line || "")}</span>
    </div>
  `;

  sessionLine.classList.toggle("hidden", !hasSession);
}

function updateTopButtons() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  if (btnManagerTop) btnManagerTop.classList.toggle("hidden", !hasSession);
  if (btnLogoutTop) btnLogoutTop.classList.toggle("hidden", !hasSession);
}

function updateBottomNav() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  if (!bottomNav) return;

  bottomNav.classList.toggle("hidden", !hasSession);

  // active state
  const page = state.view.page;
  const setActive = (el, on) => el && el.classList.toggle("active", !!on);

  setActive(navHome, page === "home" || page === "category" || page === "sauce_menu");
  setActive(navAlerts, page === "alerts");
  setActive(navManager, page === "manager");
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
    state.view = { page: "home", category: null };
    render();
  }
}

/* ---------- Data load (store-scoped) ---------- */
async function loadStoreData() {
  const store = state.session.store;
  state.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
  state.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);
}

function categoryCountsByName() {
  const counts = {};
  for (const c of state.categories) counts[c.name] = 0;
  for (const it of state.items) {
    const c = String(it.category || "").trim();
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}

/* ---------- Render: Session ---------- */
function renderSession() {
  updateSessionLine();
  updateTopButtons();
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
      await loadStoreData();
      state.navStack = [];
      state.view = { page: "home", category: null };
      render();
    } catch (e) {
      err.textContent = `Failed to load store data: ${e.message || e}`;
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Render: Home (categories from DB) ---------- */
function renderHome() {
  updateSessionLine();
  updateTopButtons();
  updateBottomNav();

  const counts = categoryCountsByName();

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>
      <div class="home-sub">Tap a category to log items.</div>

      <section class="grid">
        ${state.categories
          .map((c) => {
            const name = c.name;
            const count = counts[name] || 0;

            // simple emoji icon per name (no missing icons)
            const icon =
              name === "Prepared items" ? "🧾" :
              name === "Unopened chiller" ? "🧊" :
              name === "Thawing" ? "❄️" :
              name === "Vegetables" ? "🥬" :
              name === "Backroom" ? "📦" :
              name === "Back counter" ? "🧂" :
              name === "Front counter" ? "🥣" :
              name === "Back counter chiller" ? "🧀" :
              name === "Sauce" ? "🧴" : "📋";

            return `
              <button class="tile tile--green" data-cat="${escapeHtml(name)}" type="button">
                <div class="tile-top">
                  <div class="tile-icon" aria-hidden="true">${icon}</div>
                </div>
                <div class="tile-title">${escapeHtml(name)}</div>
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
      if (cat === "Sauce") setView({ page: "sauce_menu", category: "Sauce" }, true);
      else setView({ page: "category", category: cat }, true);
    });
  });
}

/* ---------- Render: Sauce menu ---------- */
function renderSauceMenu() {
  updateSessionLine();
  updateTopButtons();
  updateBottomNav();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid">
      ${SAUCE_SUBS.map((s) => {
        return `
          <button class="tile tile--purple" data-sauce="${escapeHtml(s)}" type="button">
            <div class="tile-top">
              <div class="tile-icon" aria-hidden="true">🧴</div>
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
      // category page uses "Sauce • sub"
      setView({ page: "category", category: `Sauce • ${sub}` }, true);
    });
  });
}

/* ---------- Items list for category ---------- */
function getItemsForCategoryPage(catLabel) {
  if (catLabel.startsWith("Sauce • ")) {
    const sub = catLabel.replace("Sauce • ", "").trim();
    return state.items
      .filter((x) => String(x.category).trim() === "Sauce")
      .filter((x) => norm(x.sub_category || "") === norm(sub))
      .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  }

  return state.items
    .filter((x) => String(x.category).trim() === String(catLabel).trim())
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
}

/* ---------- Log modal (yellow save) ---------- */
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
      <div class="helper">${escapeHtml(getHelperText(item))}</div>
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

    let expiry = null;
    let expiry_at = null;

    if (mode === "MANUAL_DATE") {
      expiry = (expDate?.value || "").trim() || null;
      if (!expiry) {
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
      expiry = (expSelect?.value || "").trim() || null;
      if (!expiry) {
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
      expiry,
      expiry_at,
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

/* ---------- Render: Category list ---------- */
function renderCategoryList() {
  updateSessionLine();
  updateTopButtons();
  updateBottomNav();

  const title = state.view.category || "";
  const list = getItemsForCategoryPage(title);

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
      if (it) openLogModal(it);
    });
  });
}

/* ---------- Alerts ---------- */
async function renderAlerts() {
  updateSessionLine();
  updateTopButtons();
  updateBottomNav();

  main.innerHTML = `
    <div class="card">
      <div class="h1">Alerts</div>
      <div class="muted">Latest expiry per item (this store).</div>
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
      <div class="card-title">Store: ${escapeHtml(state.session.store)}</div>
      ${rows
        .map(
          (r) => `
          <div class="alert-row">
            <div>
              <div class="alert-name">${escapeHtml(r.name)}</div>
              <div class="alert-extra">${escapeHtml(r.category || "")}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
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

/* ---------- Manager login modal (yellow login) ---------- */
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

  $("#btnPinLogin", modalBodyEl).addEventListener("click", async () => {
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
      setView({ page: "manager", category: null }, true);
    } catch (e) {
      err.textContent = e?.message || "Login failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager: Categories UI (store-separated) ---------- */
async function renderManagerCategoriesInto(containerEl) {
  const store = state.session.store;

  containerEl.innerHTML = `
    <div class="card">
      <div class="card-title">Categories (${escapeHtml(store)})</div>

      <div class="field">
        <label class="label">New Category Name</label>
        <input id="catNewName" class="input" placeholder="e.g. Backroom" />
      </div>

      <div class="field">
        <label class="label">Sort Order</label>
        <input id="catNewSort" class="input" inputmode="numeric" value="100" />
        <div class="helper">Smaller number shows higher on Home.</div>
      </div>

      <button id="btnCatAdd" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
        Add Category
      </button>

      <div id="catAddErr" class="error hidden"></div>
    </div>

    <div class="card">
      <div class="card-title">Manage Categories</div>
      <div id="catList" class="muted">Loading…</div>
    </div>
  `;

  const addErr = $("#catAddErr", containerEl);
  const listEl = $("#catList", containerEl);

  let rows = [];
  try {
    rows = await apiManager("GET", `/api/manager/categories?store=${encodeURIComponent(store)}`);
  } catch (e) {
    listEl.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
    return;
  }

  function draw() {
    if (!rows.length) {
      listEl.innerHTML = `<div class="muted">No categories yet.</div>`;
      return;
    }

    listEl.innerHTML = rows
      .map((c) => {
        const inactive = !(c.is_active ?? true) || !!c.deleted_at;
        return `
          <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;opacity:${inactive ? "0.55" : "1"};">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
              <div style="font-weight:1000;font-size:15px;">${escapeHtml(c.name)}</div>
              ${inactive ? `<span class="pill" style="padding:6px 10px;font-weight:1000;">Inactive</span>` : ""}
            </div>

            <div class="field">
              <label class="label">Rename</label>
              <input class="input cat-name" data-id="${c.id}" value="${escapeHtml(c.name)}" />
            </div>

            <div class="field">
              <label class="label">Sort Order</label>
              <input class="input cat-sort" data-id="${c.id}" inputmode="numeric" value="${escapeHtml(c.sort_order ?? 100)}" />
            </div>

            <div style="display:flex;gap:10px;">
              <button class="cat-save" data-id="${c.id}" type="button"
                style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
                Save
              </button>

              <button class="cat-del" data-id="${c.id}" type="button"
                style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:#fff;border:1px solid rgba(0,0,0,0.12);color:#c62828;cursor:pointer;">
                Delete
              </button>
            </div>

            <div class="cat-err error hidden" data-id="${c.id}"></div>
          </div>
        `;
      })
      .join("");

    $$(".cat-save", listEl).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.cat-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        const nameInp = $(`.cat-name[data-id="${id}"]`, listEl);
        const sortInp = $(`.cat-sort[data-id="${id}"]`, listEl);

        const name = String(nameInp.value || "").trim();
        const sort_order = Number(String(sortInp.value || "100").trim());

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
          const out = await apiManager("PATCH", `/api/manager/categories/${id}`, {
            store,
            name,
            sort_order,
          });
          rows = rows.map((x) => (Number(x.id) === id ? out.category : x));
          toast("Category saved ✅");

          // refresh store categories on home
          state.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
        } catch (e) {
          err.textContent = e.message || "Save failed.";
          err.classList.remove("hidden");
        }
      });
    });

    $$(".cat-del", listEl).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.cat-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        if (!confirm("Delete this category for this store? (Soft delete)")) return;

        try {
          const out = await apiManager(
            "DELETE",
            `/api/manager/categories/${id}?store=${encodeURIComponent(store)}`
          );
          rows = rows.map((x) => (Number(x.id) === id ? out.category : x));
          toast("Category deleted ✅");

          state.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
          draw();
        } catch (e) {
          err.textContent = e.message || "Delete failed.";
          err.classList.remove("hidden");
        }
      });
    });
  }

  $("#btnCatAdd", containerEl).addEventListener("click", async () => {
    addErr.classList.add("hidden");
    const name = String($("#catNewName", containerEl).value || "").trim();
    const sort_order = Number(String($("#catNewSort", containerEl).value || "100").trim());

    if (!name) {
      addErr.textContent = "Name required.";
      addErr.classList.remove("hidden");
      return;
    }
    if (!Number.isFinite(sort_order)) {
      addErr.textContent = "Sort order must be a number.";
      addErr.classList.remove("hidden");
      return;
    }

    try {
      const out = await apiManager("POST", "/api/manager/categories", { store, name, sort_order });
      rows.unshift(out.category);
      toast("Category added ✅");
      $("#catNewName", containerEl).value = "";
      state.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
      draw();
    } catch (e) {
      addErr.textContent = e.message || "Add failed.";
      addErr.classList.remove("hidden");
    }
  });

  draw();
}

/* ---------- Manager: Items UI (store-separated) ---------- */
async function renderManagerItemsInto(containerEl) {
  const store = state.session.store;

  containerEl.innerHTML = `
    <div class="card">
      <div class="card-title">Items (${escapeHtml(store)})</div>

      <div class="field">
        <label class="label">Search</label>
        <input id="mgrSearch" class="input" placeholder="Type item name..." />
      </div>

      <button id="btnAddItem" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
        Add Item
      </button>
    </div>

    <div class="card">
      <div class="card-title">Manage Items</div>
      <div id="mgrList" class="muted">Loading…</div>
    </div>
  `;

  const listEl = $("#mgrList", containerEl);
  const searchEl = $("#mgrSearch", containerEl);

  let rows = [];
  try {
    rows = await apiManager("GET", `/api/manager/items?store=${encodeURIComponent(store)}`);
  } catch (e) {
    listEl.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
    return;
  }

  $("#btnAddItem", containerEl).addEventListener("click", () => openManagerAddItem(store));

  function draw() {
    const q = norm(searchEl.value || "");
    const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;

    if (!filtered.length) {
      listEl.innerHTML = `<div class="muted">No matches.</div>`;
      return;
    }

    const categoryOptions = state.categories.map((c) => c.name);

    listEl.innerHTML = filtered
      .slice(0, 200)
      .map((r) => {
        const inactive = !(r.is_active ?? true) || !!r.deleted_at;

        return `
          <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;opacity:${inactive ? "0.55" : "1"};">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
              <div style="font-weight:1000;font-size:16px;">${escapeHtml(r.name)}</div>
              ${inactive ? `<span class="pill" style="padding:6px 10px;font-weight:1000;">Inactive</span>` : ""}
            </div>

            <div class="field">
              <label class="label">Category</label>
              <select class="input mgr-cat" data-id="${r.id}">
                ${categoryOptions
                  .map((c) => `<option value="${escapeHtml(c)}" ${norm(c) === norm(r.category) ? "selected" : ""}>${escapeHtml(c)}</option>`)
                  .join("")}
              </select>
            </div>

            <div class="field">
              <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
              <select class="input mgr-sub" data-id="${r.id}">
                <option value="" ${(r.sub_category || "") === "" ? "selected" : ""}>(none)</option>
                ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}" ${norm(s) === norm(r.sub_category || "") ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label class="label">Shelf life (days)</label>
              <input class="input mgr-sl" data-id="${r.id}" inputmode="numeric" value="${escapeHtml(r.shelf_life_days ?? 0)}" />
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

    $$(".mgr-save", listEl).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.mgr-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        const catSel = $(`.mgr-cat[data-id="${id}"]`, listEl);
        const subSel = $(`.mgr-sub[data-id="${id}"]`, listEl);
        const slInp = $(`.mgr-sl[data-id="${id}"]`, listEl);

        const category = String(catSel.value || "").trim();
        const shelf_life_days = Number(String(slInp.value || "0").trim());
        const sub_category_raw = String(subSel.value || "").trim() || null;

        const sub_category = norm(category) === norm("Sauce") ? sub_category_raw : null;

        if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
          err.textContent = "Shelf life must be a number ≥ 0.";
          err.classList.remove("hidden");
          return;
        }

        try {
          const out = await apiManager("PATCH", `/api/manager/items/${id}`, {
            store,
            category,
            sub_category,
            shelf_life_days,
          });

          toast("Item saved ✅");

          rows = rows.map((x) => (Number(x.id) === id ? out.item : x));

          // refresh staff list instantly
          state.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);
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

        if (!confirm("Delete this item? (Soft delete)")) return;

        try {
          const out = await apiManager(
            "DELETE",
            `/api/manager/items/${id}?store=${encodeURIComponent(store)}`
          );

          toast("Item deleted ✅");
          rows = rows.map((x) => (Number(x.id) === id ? out.item : x));

          state.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);
          draw();
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

/* ---------- Add Item modal ---------- */
function openManagerAddItem(store) {
  const categoryOptions = state.categories.map((c) => c.name);

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
        ${categoryOptions.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
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

  const err = $("#addErr", modalBodyEl);

  $("#btnAddSave", modalBodyEl).addEventListener("click", async () => {
    err.classList.add("hidden");

    const name = String($("#newName", modalBodyEl).value || "").trim();
    const category = String($("#newCat", modalBodyEl).value || "").trim();
    const subRaw = String($("#newSub", modalBodyEl).value || "").trim() || null;
    const shelf_life_days = Number(String($("#newSL", modalBodyEl).value || "0").trim());

    if (!name) {
      err.textContent = "Name required.";
      err.classList.remove("hidden");
      return;
    }
    if (!category) {
      err.textContent = "Category required.";
      err.classList.remove("hidden");
      return;
    }
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
      err.textContent = "Shelf life must be a number ≥ 0.";
      err.classList.remove("hidden");
      return;
    }

    const sub_category = norm(category) === norm("Sauce") ? subRaw : null;

    try {
      await apiManager("POST", "/api/manager/items", {
        store,
        name,
        category,
        sub_category,
        shelf_life_days,
      });

      closeModal();
      toast("Item added ✅");

      // refresh store items
      state.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);
      render();
    } catch (e) {
      err.textContent = e.message || "Add failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager page ---------- */
async function renderManager() {
  updateSessionLine();
  updateTopButtons();
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
        Store-separated controls. Changes affect ONLY <strong>${escapeHtml(state.session.store)}</strong>.
      </div>
    </div>

    <div id="mgrCats"></div>
    <div id="mgrItems"></div>
  `;

  const catsMount = $("#mgrCats");
  const itemsMount = $("#mgrItems");

  await renderManagerCategoriesInto(catsMount);
  await renderManagerItemsInto(itemsMount);
}

/* ---------- Bind top + bottom buttons ---------- */
function bindGlobalButtons() {
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  if (btnManagerTop) {
    btnManagerTop.addEventListener("click", () => {
      if (isManagerMode()) setView({ page: "manager", category: null }, true);
      else openManagerLogin();
    });
  }

  if (btnLogoutTop) {
    btnLogoutTop.addEventListener("click", () => doLogout());
  }

  if (navHome) {
    navHome.addEventListener("click", () => {
      state.navStack = [];
      setView({ page: "home", category: null }, false);
    });
  }
  if (navAlerts) {
    navAlerts.addEventListener("click", () => setView({ page: "alerts", category: null }, true));
  }
  if (navManager) {
    navManager.addEventListener("click", () => {
      if (isManagerMode()) setView({ page: "manager", category: null }, true);
      else openManagerLogin();
    });
  }
  if (navLogout) {
    navLogout.addEventListener("click", () => doLogout());
  }
}

function doLogout() {
  // if manager mode: log out manager only
  if (isManagerMode()) {
    if (!confirm("Exit manager mode?")) return;
    setManagerToken("");
    toast("Back to staff mode");
    render();
    return;
  }

  if (!confirm("Logout staff session?")) return;
  state.session = { store: "", shift: "", staff: "" };
  saveSession();
  state.navStack = [];
  state.view = { page: "session", category: null };
  render();
}

/* ---------- Router ---------- */
async function render() {
  if (!main) return;

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  updateSessionLine();
  updateTopButtons();
  updateBottomNav();

  if (!hasSession && state.view.page !== "session") {
    state.view = { page: "session", category: null };
  }

  const page = state.view.page;

  if (page === "session") return renderSession();
  if (page === "home") return renderHome();
  if (page === "sauce_menu") return renderSauceMenu();
  if (page === "category") return renderCategoryList();
  if (page === "alerts") return renderAlerts();
  if (page === "manager") return renderManager();

  state.view = { page: "home", category: null };
  renderHome();
}

/* ---------- Boot ---------- */
async function boot() {
  bindGlobalButtons();

  loadSession();
  setManagerToken(getManagerToken());

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  if (hasSession) {
    try {
      await loadStoreData();
      state.view = { page: "home", category: null };
    } catch {
      state.view = { page: "session", category: null };
    }
  } else {
    state.view = { page: "session", category: null };
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
