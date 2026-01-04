// ---------- Elements ----------
const sessionScreenEl = document.getElementById("sessionScreen");
const appShellEl = document.getElementById("appShell");

const sessionStoreEl = document.getElementById("sessionStore");
const sessionShiftEl = document.getElementById("sessionShift");
const sessionStaffEl = document.getElementById("sessionStaff");
const btnStartSession = document.getElementById("btnStartSession");
const sessionMsgEl = document.getElementById("sessionMsg");

const storeEl = document.getElementById("store");
const staffEl = document.getElementById("staff");
const sessionInfoEl = document.getElementById("sessionInfo");

const homeEl = document.getElementById("home");
const categoryGridEl = document.getElementById("categoryGrid");

const categoryViewEl = document.getElementById("categoryView");
const catTitleEl = document.getElementById("catTitle");
const itemListEl = document.getElementById("itemList");
const btnBack = document.getElementById("btnBack");

const itemFormEl = document.getElementById("itemForm");
const itemTitleEl = document.getElementById("itemTitle");
const itemMetaEl = document.getElementById("itemMeta");
const qtyEl = document.getElementById("qty");
const expiryEl = document.getElementById("expiry");
const btnSave = document.getElementById("btnSave");
const btnCloseItem = document.getElementById("btnCloseItem");
const saveMsgEl = document.getElementById("saveMsg");

const btnAlerts = document.getElementById("btnAlerts");
const alertsViewEl = document.getElementById("alertsView");
const btnCloseAlerts = document.getElementById("btnCloseAlerts");
const expiryListEl = document.getElementById("expiryList");
const lowStockListEl = document.getElementById("lowStockList");

// ---------- State ----------
let allItems = [];
let categories = [];
let currentCategory = null;
let currentItem = null;

let session = {
  store: "",
  shift: "",
  staff: ""
};

// ---------- Date helpers ----------
function pad2(n) { return String(n).padStart(2, "0"); }

// value for DB/API: YYYY-MM-DD
function toISODateOnly(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

// label: "04 January 2026"
function toFullLabel(d) {
  const x = new Date(d);
  return x.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

// make today + next N days (inclusive)
function buildExpiryOptions(days) {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  for (let i = 0; i <= days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push({ value: toISODateOnly(d), label: toFullLabel(d) });
  }
  return out;
}

// ---------- Session ----------
function loadSessionFromStorage() {
  try {
    const raw = sessionStorage.getItem("precheck_session");
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s.store || !s.shift || !s.staff) return false;
    session = s;
    return true;
  } catch {
    return false;
  }
}

function saveSessionToStorage() {
  sessionStorage.setItem("precheck_session", JSON.stringify(session));
}

function showSessionScreen() {
  sessionScreenEl.classList.remove("hidden");
  appShellEl.classList.add("hidden");
}

function showAppShell() {
  sessionScreenEl.classList.add("hidden");
  appShellEl.classList.remove("hidden");
}

function startSession() {
  const store = sessionStoreEl.value;
  const shift = sessionShiftEl.value;
  const staff = sessionStaffEl.value.trim();

  if (!store || !shift || !staff) {
    sessionMsgEl.textContent = "Please select store + shift and enter staff.";
    return;
  }

  session = { store, shift, staff };
  saveSessionToStorage();

  // set main UI fields
  storeEl.value = store;
  staffEl.value = staff;
  sessionInfoEl.textContent = `Store: ${store} • Shift: ${shift}`;

  sessionMsgEl.textContent = "";
  showAppShell();
  showHome();

  // load
  loadItems().then(loadAlerts);
}

// ---------- Navigation ----------
function showHome() {
  homeEl.classList.remove("hidden");
  categoryViewEl.classList.add("hidden");
  itemFormEl.classList.add("hidden");
  alertsViewEl.classList.add("hidden");
}

function showCategory(cat) {
  currentCategory = cat;
  catTitleEl.textContent = cat;

  homeEl.classList.add("hidden");
  categoryViewEl.classList.remove("hidden");
  itemFormEl.classList.add("hidden");
  alertsViewEl.classList.add("hidden");

  renderItemList(cat);
}

function showAlerts() {
  homeEl.classList.add("hidden");
  categoryViewEl.classList.add("hidden");
  itemFormEl.classList.add("hidden");
  alertsViewEl.classList.remove("hidden");

  loadAlerts();
}

// ---------- Require staff ----------
function requireStaff() {
  const s = staffEl.value.trim();
  if (!s) {
    alert("Please enter staff ID & name");
    staffEl.focus();
    return null;
  }
  return s;
}

// ---------- Item form ----------
function showItemForm(item) {
  currentItem = item;

  itemTitleEl.textContent = item.name;
  itemMetaEl.textContent = item.category;

  qtyEl.value = "";
  saveMsgEl.textContent = "";

  // KEY FIX:
  // if shelf_life_days is 3 => show 4 options (today + next 3 days)
  // if shelf_life_days is 0 => show default 7 days (today + next 7 days) so user still can pick
  const shelf = Number(item.shelf_life_days || 0);
  const daysToShow = shelf > 0 ? shelf : 7;

  const options = buildExpiryOptions(daysToShow);
  expiryEl.innerHTML = "";
  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.value;   // YYYY-MM-DD
    opt.textContent = o.label; // "04 January 2026"
    expiryEl.appendChild(opt);
  });

  // default select "today"
  expiryEl.value = options[0].value;

  itemFormEl.classList.remove("hidden");
}

function hideItemForm() {
  itemFormEl.classList.add("hidden");
}

// ---------- Render ----------
function renderCategoryTiles() {
  categoryGridEl.innerHTML = "";

  categories.forEach(cat => {
    const count = allItems.filter(x => x.category === cat).length;

    const btn = document.createElement("button");
    btn.className = "tile";
    btn.innerHTML = `
      <div class="title">${cat}</div>
      <div class="sub">${count} items</div>
    `;
    btn.onclick = () => showCategory(cat);
    categoryGridEl.appendChild(btn);
  });
}

function renderItemList(cat) {
  itemListEl.innerHTML = "";

  allItems
    .filter(x => x.category === cat)
    .forEach(it => {
      const li = document.createElement("li");
      li.textContent = it.name;
      li.onclick = () => showItemForm(it);
      itemListEl.appendChild(li);
    });
}

function renderExpiryList(list) {
  expiryListEl.innerHTML = "";

  if (!list.length) {
    expiryListEl.innerHTML = "<li>No expiring items ✅</li>";
    return;
  }

  list.forEach(x => {
    const li = document.createElement("li");
    const d = new Date(x.expiry);
    const nice = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    li.textContent = `${x.name} — Qty ${x.quantity} — Exp ${nice}`;
    expiryListEl.appendChild(li);
  });
}

function renderLowStock(list) {
  lowStockListEl.innerHTML = "";

  if (!list.length) {
    lowStockListEl.innerHTML = "<li>No low stock items ✅</li>";
    return;
  }

  list.forEach(x => {
    const li = document.createElement("li");
    li.textContent = `${x.name} — Qty ${x.quantity} (${x.category})`;
    lowStockListEl.appendChild(li);
  });
}

// ---------- API ----------
async function loadItems() {
  const res = await fetch("/api/items");
  allItems = await res.json();

  categories = [...new Set(allItems.map(x => x.category))];
  renderCategoryTiles();
}

async function loadAlerts() {
  const store = storeEl.value;

  // This expects your server to return logs with: name, quantity, expiry, category
  const res = await fetch(`/api/expiry?store=${encodeURIComponent(store)}`);
  const data = await res.json();

  renderExpiryList(data);

  const lowStock = data.filter(x =>
    Number(x.quantity) <= 2 &&
    String(x.category || "").toLowerCase() !== "sauces" &&
    String(x.category || "").toLowerCase() !== "sauce"
  );

  renderLowStock(lowStock);
}

async function saveLog() {
  const staff = requireStaff();
  if (!staff || !currentItem) return;

  const store = storeEl.value;
  const quantity = qtyEl.value;
  const expiry = expiryEl.value; // YYYY-MM-DD from dropdown

  if (!quantity) {
    alert("Enter quantity");
    return;
  }

  saveMsgEl.textContent = "Saving...";

  const res = await fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store,
      staff,
      item_id: currentItem.id,
      quantity,
      expiry
    })
  });

  saveMsgEl.textContent = res.ok ? "Saved ✅" : "Error ❌";
  hideItemForm();
  loadAlerts();
}

// ---------- Events ----------
btnBack.onclick = showHome;
btnCloseItem.onclick = hideItemForm;

btnAlerts.onclick = showAlerts;
btnCloseAlerts.onclick = showHome;

btnSave.onclick = saveLog;

storeEl.onchange = () => {
  // keep alerts updated when store changes
  loadAlerts();
};

btnStartSession.onclick = startSession;

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  // restore session if exists
  if (loadSessionFromStorage()) {
    // apply session to main UI
    storeEl.value = session.store;
    staffEl.value = session.staff;
    sessionInfoEl.textContent = `Store: ${session.store} • Shift: ${session.shift}`;

    showAppShell();
    showHome();
    loadItems().then(loadAlerts);
  } else {
    showSessionScreen();
  }
});
