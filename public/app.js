/* ======================================================
   PreCheck — app.js (FULL)
   Stable build — all requested features
   ====================================================== */

/* ------------------ Helpers ------------------ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => {
  const x = new Date(d + "T00:00");
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
const fadeIn = (el, i = 0) => {
  el.style.animation = `fadeUp .4s ease ${i * 0.06}s both`;
};

/* ------------------ State ------------------ */
const state = {
  session: JSON.parse(localStorage.getItem("session") || "{}"),
  view: { page: "session" },
  items: [],
  expiryRows: [],
  managerToken: localStorage.getItem("managerToken"),
};

/* ------------------ Session Reset @ Midnight ------------------ */
(function midnightReset() {
  const last = localStorage.getItem("lastDate");
  const now = todayISO();
  if (last && last !== now) {
    localStorage.removeItem("session");
    state.session = {};
  }
  localStorage.setItem("lastDate", now);
})();

/* ------------------ API ------------------ */
async function api(url, opt = {}) {
  const r = await fetch(url, opt);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Error");
  return j;
}

/* ------------------ Drawer ------------------ */
function bindDrawer() {
  $("#btnMenu").onclick = () => $("#drawerBackdrop").classList.remove("hidden");
  $("#btnDrawerClose").onclick = closeDrawer;
  $("#drawerBackdrop").onclick = e => {
    if (e.target.id === "drawerBackdrop") closeDrawer();
  };
  $("#drawerHome").onclick = () => go("home");
  $("#drawerAlerts").onclick = () => go("alertsSummary");
  $("#drawerManager").onclick = () => go("manager");
  $("#drawerLogout").onclick = logout;
  $("#drawerWISR").onclick = () => alert("WISR Count – coming soon");
}
function closeDrawer() {
  $("#drawerBackdrop").classList.add("hidden");
}

/* ------------------ Navigation ------------------ */
function go(page, extra = {}) {
  closeDrawer();
  state.view = { page, ...extra };
  render();
}

/* ------------------ Role Pill ------------------ */
function renderRole() {
  const pill = $("#rolePill");
  if (state.managerToken) {
    pill.textContent = "Manager 👑";
    pill.className = "role-pill role-mgr";
  } else {
    pill.textContent = "Staff 🧢";
    pill.className = "role-pill role-staff";
  }
}

/* ------------------ Session Popup ------------------ */
function showExpiryPopup() {
  openModal(
    "PLEASE check the expiry date",
    `
    <ul class="popup-list">
      <li>Mix Green</li>
      <li>Mac & Cheese</li>
      <li>Lettuce</li>
      <li>Chicken Bacon (C)</li>
      <li>Liquid Egg</li>
      <li>Flatbread (Thawing)</li>
      <li>Avocado</li>
    </ul>
    <button class="btn-yellow" onclick="closeModal()">OK</button>
    `
  );
}

/* ------------------ Home ------------------ */
async function renderHome() {
  const main = $("#main");
  const { today, tomorrow, safe } = summaryCount();
  main.innerHTML = `
    <div class="summary-row">
      <div class="sum red" onclick="go('alerts','today')">${today}<span>Expiring Today</span></div>
      <div class="sum amber" onclick="go('alerts','tomorrow')">${tomorrow}<span>Tomorrow</span></div>
      <div class="sum green" onclick="go('alerts','safe')">${safe}<span>All Safe</span></div>
    </div>
    <div class="tile-grid" id="catGrid"></div>
  `;
  const grid = $("#catGrid");
  CATEGORIES.forEach((c, i) => {
    const t = document.createElement("div");
    t.className = `tile ${c.color}`;
    t.innerHTML = `<img src="${c.icon}"><div>${c.name}</div>`;
    t.onclick = () => go("category", { category: c.name });
    grid.appendChild(t);
    fadeIn(t, i);
  });
}

/* ------------------ Category ------------------ */
function renderCategory() {
  const { category } = state.view;
  const list = state.items.filter(i => i.category === category);
  $("#main").innerHTML = `
    <button class="btn-yellow back" onclick="go('home')">← Back</button>
    <h2>${category}</h2>
    ${list.map(i => `
      <div class="item">
        <div>${i.name}</div>
        <input type="number" placeholder="Qty">
        <input type="date">
      </div>
    `).join("")}
    <button class="btn-yellow">Save</button>
  `;
}

/* ------------------ Alerts ------------------ */
function renderAlerts() {
  const type = state.view.filter;
  const rows = filterAlerts(type);
  $("#main").innerHTML = `
    <button class="btn-yellow back" onclick="go('home')">← Back</button>
    <h2>${type.toUpperCase()}</h2>
    ${rows.map(r => `
      <div class="alert-row">
        <b>${r.name}</b>
        <span>${r.quantity || "-"}</span>
        <span>${r.expiry}</span>
      </div>
    `).join("")}
  `;
}

/* ------------------ Alerts Summary ------------------ */
function renderAlertsSummary() {
  const { today, tomorrow, safe } = summaryCount();
  $("#main").innerHTML = `
    <div class="summary-big">
      <div class="sum red">${today}</div>
      <div class="sum amber">${tomorrow}</div>
      <div class="sum green">${safe}</div>
    </div>
  `;
}

/* ------------------ Manager ------------------ */
function renderManager() {
  $("#main").innerHTML = `
    <div class="mgr-grid">
      <div class="mgr-tile green">Add Item</div>
      <div class="mgr-tile blue">Edit Items</div>
      <div class="mgr-tile purple">Categories</div>
      <div class="mgr-tile orange">Download Log</div>
    </div>
  `;
}

/* ------------------ Render Router ------------------ */
function render() {
  renderRole();
  if (!state.session.store) {
    renderSession();
    return;
  }
  if (!state.popupShown) {
    showExpiryPopup();
    state.popupShown = true;
  }
  switch (state.view.page) {
    case "home": return renderHome();
    case "category": return renderCategory();
    case "alerts": return renderAlerts();
    case "alertsSummary": return renderAlertsSummary();
    case "manager": return renderManager();
    default: renderHome();
  }
}

/* ------------------ Boot ------------------ */
async function boot() {
  bindDrawer();
  state.items = await api(`/api/items?store=${state.session.store || "PDD"}`);
  state.expiryRows = await api(`/api/expiry?store=${state.session.store || "PDD"}`);
  render();
}
boot();
