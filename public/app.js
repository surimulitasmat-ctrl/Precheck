/* =========================
   PreCheck — app.js (FULL)
   UI Revamp: Mockup-style Home + Summary Cards
   Store-separated categories (PDD/SKH)
   Drawer menu (hamburger), no bottom nav
   Keeps your existing expiry logic + yellow save
   ========================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);
const MANUAL_ALWAYS = new Set([]);

/* ---- Category icon files (you will add these PNGs) ---- */
const CAT_ICON = {
  "Prepared items": "/assets/cat-icons/prepared.png",
  "Unopened chiller": "/assets/cat-icons/unopened.png",
  "Thawing": "/assets/cat-icons/thawing.png",
  "Vegetables": "/assets/cat-icons/vegetables.png",
  "Backroom": "/assets/cat-icons/backroom.png",
  "Fountain Drinks": "/assets/cat-icons/fountain.png",
  "Front counter": "/assets/cat-icons/frontcounter.png",
  "Back counter chiller": "/assets/cat-icons/backcounterchiller.png",
  "Sauce": "/assets/cat-icons/sauce.png",
};

/* ---- Tile colors to match mockup vibe ---- */
const CAT_TONE = {
  "Prepared items": "tone-green",
  "Unopened chiller": "tone-blue",
  "Thawing": "tone-cyan",
  "Vegetables": "tone-veg",
  "Backroom": "tone-backroom",
  "Fountain Drinks": "tone-orange",
  "Front counter": "tone-red",
  "Back counter chiller": "tone-teal",
  "Sauce": "tone-purple",
};

/* ---------- DOM ---------- */
const main = $("#main");
const sessionLine = $("#sessionLine");
const topbar = $("#topbar");

/* ---------- Modal ---------- */
const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  categories: [],
  items: [],
  view: { page: "session", category: null, sauceSub: null, filter: null },
  manager: { token: "" },
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
  state.manager.token = t || "";
}
function isManagerMode() {
  return !!getManagerToken();
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
  setTimeout(() => t.classList.add("hidden"), 1600);
}

/* ---------- Modal ---------- */
function hasModal() {
  return !!(modalBackdrop && modalTitleEl && modalBodyEl);
}
function openModal(title, bodyHtml) {
  if (!hasModal()) return alert(title || "Notice");
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

/* ---------- Drawer UI ---------- */
function ensureDrawer() {
  if ($("#drawer")) return;

  // hamburger in topbar (left)
  const burger = document.createElement("button");
  burger.id = "btnBurger";
  burger.type = "button";
  burger.setAttribute("aria-label", "Menu");
  burger.style.cssText = `
    border:0;background:transparent;color:#fff;font-size:22px;
    width:44px;height:44px;display:flex;align-items:center;justify-content:center;
    border-radius:12px;cursor:pointer;
  `;
  burger.textContent = "☰";

  // inject into topbar
  const row = $(".topbar-row");
  if (row) row.insertBefore(burger, row.firstChild);

  // drawer + backdrop
  const wrap = document.createElement("div");
  wrap.id = "drawerWrap";
  wrap.className = "drawer-wrap hidden";
  wrap.innerHTML = `
    <div class="drawer-backdrop" id="drawerBackdrop"></div>
    <aside class="drawer" id="drawer">
      <div class="drawer-head">
        <div style="font-weight:1000;font-size:18px">Menu</div>
        <button id="drawerClose" class="icon-btn" type="button">✕</button>
      </div>

      <div class="drawer-items">
        <button class="drawer-item" data-go="home">🏠 Home</button>
        <button class="drawer-item" data-go="alerts">🔔 Alerts</button>
        <button class="drawer-item" data-go="manager" id="drawerManager">🛠️ Manager</button>
        <button class="drawer-item" data-go="logout">🚪 Logout</button>
      </div>

      <div class="drawer-foot muted" style="padding:12px 14px;">
        Store-separated: PDD / SKH
      </div>
    </aside>
  `;
  document.body.appendChild(wrap);

  function openDrawer() {
    $("#drawerWrap")?.classList.remove("hidden");
    updateDrawerVisibility();
  }
  function closeDrawer() {
    $("#drawerWrap")?.classList.add("hidden");
  }

  burger.addEventListener("click", openDrawer);
  $("#drawerClose")?.addEventListener("click", closeDrawer);
  $("#drawerBackdrop")?.addEventListener("click", closeDrawer);

  $$(".drawer-item", wrap).forEach((b) => {
    b.addEventListener("click", () => {
      const go = b.getAttribute("data-go");
      closeDrawer();
      if (go === "home") setView({ page: "home", category: null, sauceSub: null, filter: null }, true);
      if (go === "alerts") setView({ page: "alerts", filter: null }, true);
      if (go === "manager") {
        if (isManagerMode()) setView({ page: "manager" }, true);
        else openManagerLogin();
      }
      if (go === "logout") doLogout();
    });
  });
}

function updateDrawerVisibility() {
  const mgrBtn = $("#drawerManager");
  if (mgrBtn) mgrBtn.style.display = "block";
}

/* ---------- Top right badge (manager/staff) ---------- */
function updateTopRightBadge() {
  if (!topbar) return;

  let badge = $("#roleBadgeTop");
  if (!badge) {
    badge = document.createElement("button");
    badge.id = "roleBadgeTop";
    badge.type = "button";
    badge.style.cssText = `
      border:1px solid rgba(255,255,255,0.35);
      background:rgba(255,255,255,0.08);
      color:#fff;
      padding:10px 12px;
      border-radius:999px;
      font-weight:900;
      display:flex;align-items:center;gap:10px;
      cursor:pointer;
    `;
    const right = $(".topbar-right");
    if (right) right.prepend(badge);
  }

  if (isManagerMode()) {
    badge.innerHTML = `MANAGER <span style="font-size:18px">👑</span>`;
    badge.style.background = "rgba(229,57,53,0.25)";
    badge.style.borderColor = "rgba(229,57,53,0.55)";
    badge.onclick = () => setView({ page: "manager" }, true);
  } else {
    badge.innerHTML = `STAFF <span style="font-size:18px">🎓</span>`;
    badge.style.background = "rgba(30,136,229,0.25)";
    badge.style.borderColor = "rgba(30,136,229,0.55)";
    badge.onclick = () => openManagerLogin();
  }
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
    setView({ page: "home", category: null, sauceSub: null, filter: null }, false);
  }
}

/* ---------- Data load ---------- */
async function loadCategoriesAndItems() {
  const store = state.session.store;
  const [cats, items] = await Promise.all([
    apiGet(`/api/categories?store=${encodeURIComponent(store)}`),
    apiGet(`/api/items?store=${encodeURIComponent(store)}`),
  ]);
  state.categories = cats || [];
  state.items = (items || []).map((x) => ({
    ...x,
    sub_category: x.sub_category ?? null,
  }));
}

function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/* ---------- Expiry mode logic (UNCHANGED rules) ---------- */
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
  if (mode === "AUTO") return `Expiry: Select date (0–${sl} day${sl === 1 ? "" : "s"}).`;
  return "Select expiry.";
}

/* ---------- Session line (topbar) ---------- */
function updateSessionLine() {
  if (!sessionLine) return;
  const { store, shift, staff } = state.session;
  const line = [store, shift, staff].filter(Boolean).join(" • ");
  sessionLine.classList.toggle("hidden", !line);
  sessionLine.innerHTML = line ? `<div style="font-weight:900">${escapeHtml(line)}</div>` : "";
}

/* ---------- Logout ---------- */
function doLogout() {
  if (isManagerMode()) {
    if (!confirm("Exit manager mode?")) return;
    setManagerToken("");
    toast("Back to staff mode");
    setView({ page: "home", category: null, sauceSub: null, filter: null }, true);
    return;
  }

  if (!confirm("Logout staff session?")) return;
  state.session = { store: "", shift: "", staff: "" };
  saveSession();
  state.navStack = [];
  state.view = { page: "session" };
  render();
}

/* ---------- Render: Session ---------- */
function renderSession() {
  updateSessionLine();
  updateTopRightBadge();

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
      await loadCategoriesAndItems();
    } catch (e) {
      err.textContent = `Failed to load: ${e.message || e}`;
      err.classList.remove("hidden");
      return;
    }

    state.navStack = [];
    state.view = { page: "home" };
    render();
  });
}

/* ---------- Summary row ---------- */
async function renderSummaryRow() {
  const store = state.session.store;
  const sum = await apiGet(`/api/summary?store=${encodeURIComponent(store)}`);

  const today = Number(sum?.today || 0);
  const tomorrow = Number(sum?.tomorrow || 0);
  const safe = Number(sum?.safe || 0);

  return `
    <div class="sum-row">
      <button class="sum-card sum-today" data-sum="today">
        <div class="sum-num">${today}</div>
        <div class="sum-lbl">Expiring<br/>Today</div>
      </button>
      <button class="sum-card sum-tom" data-sum="tomorrow">
        <div class="sum-num">${tomorrow}</div>
        <div class="sum-lbl">Expiring<br/>Tomorrow</div>
      </button>
      <button class="sum-card sum-safe" data-sum="safe">
        <div class="sum-num">${safe}</div>
        <div class="sum-lbl">All Safe</div>
      </button>
    </div>
  `;
}

/* ---------- Render: Home (mockup style) ---------- */
async function renderHome() {
  updateSessionLine();
  updateTopRightBadge();

  // Build tiles from DB categories (store-specific)
  const tiles = (state.categories || []).map((c) => {
    const name = c.name;
    const tone = CAT_TONE[name] || "tone-green";
    const icon = CAT_ICON[name] || "";
    return `
      <button class="cat-tile ${tone}" data-cat="${escapeHtml(name)}" type="button">
        <div class="cat-ico">
          ${icon ? `<img src="${escapeHtml(icon)}" alt="" />` : ""}
        </div>
        <div class="cat-name">${escapeHtml(name)}</div>
      </button>
    `;
  });

  let summaryHTML = "";
  try {
    summaryHTML = await renderSummaryRow();
  } catch {
    summaryHTML = `
      <div class="sum-row">
        <div class="muted">Summary unavailable</div>
      </div>
    `;
  }

  main.innerHTML = `
    <section class="home-mock">
      ${summaryHTML}

      <div class="home-title">Tap a Category to Manage Items</div>

      <div class="cat-grid">
        ${tiles.join("")}
      </div>
    </section>
  `;

  // Summary click -> NEW page
  $$(".sum-card", main).forEach((b) => {
    b.addEventListener("click", () => {
      const f = b.getAttribute("data-sum");
      setView({ page: "summary_list", filter: f }, true);
    });
  });

  // Category click
  $$("[data-cat]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "Sauce") setView({ page: "sauce_menu", category: "Sauce" }, true);
      else setView({ page: "category", category: cat }, true);
    });
  });
}

/* ---------- Sauce menu ---------- */
function renderSauceMenu() {
  updateSessionLine();
  updateTopRightBadge();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="list">
      ${SAUCE_SUBS.map((s) => {
        return `
          <button class="list-row" data-sauce="${escapeHtml(s)}" type="button">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(s)}</div>
              <div class="list-row-sub">Tap to view items</div>
            </div>
            <div class="chev">›</div>
          </button>
        `;
      }).join("")}
    </section>
  `;

  $("#backBtn").addEventListener("click", goBack);
  $$("[data-sauce]", main).forEach((b) => {
    b.addEventListener("click", () => {
      const sub = b.getAttribute("data-sauce");
      setView({ page: "category", category: "Sauce", sauceSub: sub }, true);
    });
  });
}

/* ---------- Items for list ---------- */
function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;

  let list = state.items.filter((it) => String(it.category || "").trim() === String(category || "").trim());
  if (category === "Sauce") list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

/* ---------- Category page (existing list modal log) ---------- */
function renderCategoryList() {
  updateSessionLine();
  updateTopRightBadge();

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

  $("#btnSaveLog", modalBodyEl).addEventListener("click", async () => {
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

/* ---------- Summary list page (NEW page) ---------- */
async function renderSummaryList() {
  updateSessionLine();
  updateTopRightBadge();

  const filter = state.view.filter; // today | tomorrow | safe
  const store = state.session.store;

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">${
        filter === "today" ? "Expiring Today" : filter === "tomorrow" ? "Expiring Tomorrow" : "All Safe"
      }</div>
    </div>
    <div class="card">
      <div id="sumList" class="muted">Loading...</div>
    </div>
  `;

  $("#backBtn").addEventListener("click", goBack);

  const wrap = $("#sumList");
  try {
    const rows = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);

    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isoToday = todayISODate();
    const isoTomorrow = addDaysISODate(isoToday, 1);

    const filtered = (rows || []).filter((r) => {
      const d = String(r.expiry_value || "").slice(0, 10);
      if (filter === "today") return d === isoToday;
      if (filter === "tomorrow") return d === isoTomorrow;
      // safe = NOT today & NOT tomorrow
      return d !== isoToday && d !== isoTomorrow;
    });

    if (!filtered.length) {
      wrap.innerHTML = `<div class="muted">No items in this list.</div>`;
      return;
    }

    wrap.innerHTML = filtered
      .map(
        (r) => `
        <div class="alert-row">
          <div>
            <div class="alert-name">${escapeHtml(r.name)}</div>
            <div class="alert-extra">${escapeHtml(r.category)}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
          </div>
          <div style="font-weight:1000;color:var(--green-dark)">${escapeHtml(r.expiry_value)}</div>
        </div>
      `
      )
      .join("");
  } catch (e) {
    wrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
}

/* ---------- Alerts (keep as full list) ---------- */
async function renderAlerts() {
  updateSessionLine();
  updateTopRightBadge();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>
    <div class="card">
      <div class="muted">Latest expiry per item (this store).</div>
      <div id="alertsWrap" class="muted" style="margin-top:12px;">Loading...</div>
    </div>
  `;

  $("#backBtn").addEventListener("click", goBack);

  const wrap = $("#alertsWrap");
  try {
    const rows = await apiGet(`/api/expiry?store=${encodeURIComponent(state.session.store)}`);
    if (!rows || !rows.length) {
      wrap.innerHTML = `<div class="muted">No logged expiry yet.</div>`;
      return;
    }

    wrap.innerHTML = rows
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
      .join("");
  } catch (e) {
    wrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
}

/* ---------- Manager login modal (store-specific) ---------- */
function openManagerLogin() {
  openModal(
    "Manager Access",
    `
    <div class="field">
      <label class="label">Store</label>
      <div class="input" style="display:flex;align-items:center;justify-content:space-between;">
        <span>${escapeHtml(state.session.store || "")}</span>
        <span class="muted">locked</span>
      </div>
      <div class="helper">Manager token is store-specific.</div>
    </div>

    <div class="field">
      <label class="label">Enter PIN</label>
      <input id="pinInp" class="input" inputmode="numeric" placeholder="PIN" />
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
      const out = await apiPost("/api/manager/login", { pin, store: state.session.store });
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

/* ---------- Manager page (includes categories CRUD) ---------- */
async function renderManager() {
  updateSessionLine();
  updateTopRightBadge();

  if (!isManagerMode()) {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted">Login required.</div>
        <button id="btnGoLogin" type="button"
          style="margin-top:12px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
          Enter PIN
        </button>
      </div>
    `;
    $("#btnGoLogin").addEventListener("click", openManagerLogin);
    return;
  }

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Manager (${escapeHtml(state.session.store)})</div>
    </div>

    <div class="card">
      <div class="card-title">Categories (Store-separated)</div>
      <div class="muted">Add/Edit/Delete categories for this store only.</div>

      <div style="display:flex;gap:10px;margin-top:10px;">
        <input id="catName" class="input" placeholder="New category name" />
        <input id="catSort" class="input" inputmode="numeric" value="100" style="max-width:110px;" />
      </div>

      <button id="btnAddCat" type="button"
        style="margin-top:10px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
        Add Category
      </button>

      <div id="catErr" class="error hidden"></div>
      <div id="catList" style="margin-top:12px;">Loading…</div>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div class="muted">Item CRUD is still available, store-separated.</div>
      <div id="mgrItems" class="muted" style="margin-top:10px;">Loading…</div>
    </div>
  `;

  $("#backBtn").addEventListener("click", goBack);

  // Categories load
  const catList = $("#catList");
  const catErr = $("#catErr");
  const nameEl = $("#catName");
  const sortEl = $("#catSort");

  async function loadCats() {
    const rows = await apiManager("GET", "/api/manager/categories");
    catList.innerHTML = rows
      .map((c) => {
        const deleted = !!c.deleted_at;
        return `
          <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;opacity:${deleted ? 0.5 : 1}">
            <div style="font-weight:1000;font-size:16px;">${escapeHtml(c.name)}</div>
            <div class="muted">sort: ${escapeHtml(c.sort_order)} ${deleted ? "• deleted" : ""}</div>

            <div style="display:flex;gap:10px;margin-top:10px;">
              <input class="input cat-name" data-id="${c.id}" value="${escapeHtml(c.name)}" />
              <input class="input cat-sort" data-id="${c.id}" inputmode="numeric" value="${escapeHtml(c.sort_order)}" style="max-width:110px;" />
            </div>

            <div style="display:flex;gap:10px;margin-top:10px;">
              <button class="cat-save" data-id="${c.id}" type="button"
                style="flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
                Save
              </button>
              <button class="cat-del" data-id="${c.id}" type="button"
                style="flex:1;border:1px solid rgba(0,0,0,0.12);background:#fff;border-radius:999px;padding:12px 14px;font-weight:1000;color:#c62828;cursor:pointer;">
                Delete
              </button>
            </div>

            <div class="error hidden cat-row-err" data-id="${c.id}"></div>
          </div>
        `;
      })
      .join("");

    $$(".cat-save", catList).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.cat-row-err[data-id="${id}"]`, catList);
        err.classList.add("hidden");

        const n = $(`.cat-name[data-id="${id}"]`, catList).value.trim();
        const s = Number($(`.cat-sort[data-id="${id}"]`, catList).value);

        if (!n) {
          err.textContent = "Name required.";
          err.classList.remove("hidden");
          return;
        }
        if (!Number.isFinite(s)) {
          err.textContent = "Sort must be a number.";
          err.classList.remove("hidden");
          return;
        }

        try {
          await apiManager("PATCH", `/api/manager/categories/${id}`, { name: n, sort_order: s, is_active: true });
          toast("Saved ✅");
          await loadCats();
          await loadCategoriesAndItems();
        } catch (e) {
          err.textContent = e.message || "Save failed.";
          err.classList.remove("hidden");
        }
      });
    });

    $$(".cat-del", catList).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.cat-row-err[data-id="${id}"]`, catList);
        err.classList.add("hidden");

        if (!confirm("Soft delete this category? (Can be re-added later)")) return;

        try {
          await apiManager("DELETE", `/api/manager/categories/${id}`);
          toast("Deleted ✅");
          await loadCats();
          await loadCategoriesAndItems();
        } catch (e) {
          err.textContent = e.message || "Delete failed.";
          err.classList.remove("hidden");
        }
      });
    });
  }

  $("#btnAddCat").addEventListener("click", async () => {
    catErr.classList.add("hidden");
    const n = nameEl.value.trim();
    const s = Number(sortEl.value);

    if (!n) {
      catErr.textContent = "Category name required.";
      catErr.classList.remove("hidden");
      return;
    }
    if (!Number.isFinite(s)) {
      catErr.textContent = "Sort must be a number.";
      catErr.classList.remove("hidden");
      return;
    }

    try {
      await apiManager("POST", "/api/manager/categories", { name: n, sort_order: s });
      nameEl.value = "";
      toast("Category added ✅");
      await loadCats();
      await loadCategoriesAndItems();
    } catch (e) {
      catErr.textContent = e.message || "Add failed.";
      catErr.classList.remove("hidden");
    }
  });

  await loadCats();

  // Items section: keep it minimal here
  const itemsWrap = $("#mgrItems");
  try {
    const rows = await apiManager("GET", "/api/manager/items");
    itemsWrap.innerHTML = `<div class="muted">${rows.length} items (store: ${escapeHtml(state.session.store)})</div>`;
  } catch (e) {
    itemsWrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
}

/* ---------- Minimal CSS injection for the new home layout ---------- */
function injectMiniCSS() {
  if ($("#mockCss")) return;
  const s = document.createElement("style");
  s.id = "mockCss";
  s.textContent = `
    .home-mock { padding: 12px 0 24px; }
    .home-title { font-weight:1000; font-size:18px; padding: 12px 14px 10px; }

    .sum-row { display:flex; gap:10px; padding: 12px 14px; }
    .sum-card { flex:1; border:0; border-radius:14px; padding:12px; color:#1b1b1b; cursor:pointer; box-shadow: 0 10px 18px rgba(0,0,0,0.08); }
    .sum-num { font-weight:1000; font-size:22px; line-height:1; }
    .sum-lbl { margin-top:6px; font-weight:800; font-size:12px; opacity:0.95; }
    .sum-today { background: #ffdddd; }
    .sum-tom { background: #ffe8cc; }
    .sum-safe { background: #ddffdf; }

    .cat-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; padding: 0 14px 16px; }
    .cat-tile { border:0; border-radius:16px; padding:14px; color:#fff; display:flex; align-items:center; gap:12px; cursor:pointer; min-height:78px; box-shadow: 0 12px 22px rgba(0,0,0,0.10); }
    .cat-ico { width:52px; height:52px; border-radius:14px; background: rgba(255,255,255,0.18); display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .cat-ico img { width:44px; height:44px; object-fit:contain; }
    .cat-name { font-weight:1000; font-size:16px; text-align:left; }

    .tone-green { background: linear-gradient(135deg, #1aa44a, #0f7c36); }
    .tone-blue { background: linear-gradient(135deg, #2a8df6, #1565c0); }
    .tone-cyan { background: linear-gradient(135deg, #14b8c6, #0b7c87); }
    .tone-veg { background: linear-gradient(135deg, #2b9b3f, #1f7a2f); }
    .tone-backroom { background: linear-gradient(135deg, #ffd89a, #e9a84d); color:#1b1b1b; }
    .tone-orange { background: linear-gradient(135deg, #ffb74d, #f57c00); }
    .tone-red { background: linear-gradient(135deg, #ef5350, #c62828); }
    .tone-teal { background: linear-gradient(135deg, #26a69a, #00796b); }
    .tone-purple { background: linear-gradient(135deg, #7e57c2, #5e35b1); }

    .drawer-wrap.hidden { display:none; }
    .drawer-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.35); z-index:1000; }
    .drawer { position:fixed; top:0; left:0; height:100%; width:78%; max-width:320px; background:#fff; z-index:1001; padding: 12px; box-shadow: 12px 0 30px rgba(0,0,0,0.20); border-top-right-radius:18px; border-bottom-right-radius:18px; }
    .drawer-head { display:flex; align-items:center; justify-content:space-between; padding: 6px 6px 10px; }
    .drawer-items { display:flex; flex-direction:column; gap:10px; padding: 6px; }
    .drawer-item { border:0; border-radius:14px; padding:12px 12px; font-weight:900; background: #f3f5f7; cursor:pointer; text-align:left; }
  `;
  document.head.appendChild(s);
}

/* ---------- Render router ---------- */
async function render() {
  if (!main) return;

  injectMiniCSS();
  ensureDrawer();
  bindModal();

  updateSessionLine();
  updateTopRightBadge();

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  if (!hasSession && state.view.page !== "session") state.view = { page: "session" };

  const page = state.view.page;

  if (page === "session") return renderSession();
  if (page === "home") return renderHome();
  if (page === "sauce_menu") return renderSauceMenu();
  if (page === "category") return renderCategoryList();
  if (page === "alerts") return renderAlerts();
  if (page === "summary_list") return renderSummaryList();
  if (page === "manager") return renderManager();

  state.view = { page: "home" };
  return renderHome();
}

/* ---------- Boot ---------- */
async function boot() {
  ensureToast();
  bindModal();
  ensureDrawer();

  loadSession();
  setManagerToken(getManagerToken());

  if (state.session.store && state.session.shift && state.session.staff) {
    try {
      await loadCategoriesAndItems();
      state.view = { page: "home" };
    } catch {
      state.view = { page: "session" };
    }
  } else {
    state.view = { page: "session" };
  }

  render();
}

boot().catch((e) => {
  console.error(e);
  if (main) main.innerHTML = `<div class="card"><div class="h1">Error</div><div class="error">${escapeHtml(e?.message || e)}</div></div>`;
});
