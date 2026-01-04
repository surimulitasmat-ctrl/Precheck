// PreCheck - app.js (matches the provided index.html)
// ----------------------------------------------------

// ---------- Small helpers ----------
function $(id) {
  const el = document.getElementById(id);
  return el;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatFullDate(d) {
  // e.g. "04 January 2026"
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}
function isoDateOnly(d) {
  // "YYYY-MM-DD"
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}
function todayLocalDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------- Elements ----------
const sessionScreenEl = $("sessionScreen");
const sessionStoreEl = $("sessionStore");
const sessionShiftEl = $("sessionShift");
const sessionStaffEl = $("sessionStaff");
const btnStartSession = $("btnStartSession");
const sessionMsgEl = $("sessionMsg");

const appShellEl = $("appShell");
const storeEl = $("store");
const staffEl = $("staff");
const sessionInfoEl = $("sessionInfo");
const btnAlerts = $("btnAlerts");

const homeEl = $("home");
const categoryGridEl = $("categoryGrid");

const categoryViewEl = $("categoryView");
const catTitleEl = $("catTitle");
const itemListEl = $("itemList");
const btnBack = $("btnBack");

const itemFormEl = $("itemForm");
const itemTitleEl = $("itemTitle");
const itemMetaEl = $("itemMeta");
const qtyEl = $("qty");
const expiryEl = $("expiry"); // SELECT
const btnSave = $("btnSave");
const btnCloseItem = $("btnCloseItem");
const saveMsgEl = $("saveMsg");

const alertsViewEl = $("alertsView");
const btnCloseAlerts = $("btnCloseAlerts");
const expiryListEl = $("expiryList");
const lowStockListEl = $("lowStockList");

// ---------- State ----------
let allItems = [];
let categories = [];
let currentCategory = null;
let currentItem = null;

let session = {
  store: "",
  shift: "",
  staff: "",
  dateKey: "" // yyyy-mm-dd
};

// ---------- Screens ----------
function hideAllMainScreens() {
  homeEl.classList.add("hidden");
  categoryViewEl.classList.add("hidden");
  itemFormEl.classList.add("hidden");
  alertsViewEl.classList.add("hidden");
}

function showSessionScreen() {
  // show session, hide app
  sessionScreenEl.classList.remove("hidden");
  appShellEl.classList.add("hidden");
  sessionMsgEl.textContent = "";
}

function showAppShell() {
  sessionScreenEl.classList.add("hidden");
  appShellEl.classList.remove("hidden");
}

function showHome() {
  hideAllMainScreens();
  homeEl.classList.remove("hidden");
}

function showCategory(cat) {
  currentCategory = cat;
  hideAllMainScreens();
  categoryViewEl.classList.remove("hidden");
  catTitleEl.textContent = cat;
  renderItemList(cat);
}

function showItemForm(item) {
  currentItem = item;
  hideAllMainScreens();
  itemFormEl.classList.remove("hidden");

  itemTitleEl.textContent = item.name;
  itemMetaEl.textContent = item.category;

  qtyEl.value = "";
  saveMsgEl.textContent = "";

  // Build expiry dropdown options based on shelf_life_days
  buildExpiryOptions(item);
}

function showAlerts() {
  hideAllMainScreens();
  alertsViewEl.classList.remove("hidden");
}

// ---------- Session logic ----------
function getTodayKey() {
  const d = todayLocalDateOnly();
  return isoDateOnly(d);
}

function saveSessionToLocal() {
  localStorage.setItem("precheck_session", JSON.stringify(session));
}

function loadSessionFromLocal() {
  try {
    const raw = localStorage.getItem("precheck_session");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem("precheck_session");
  session = { store: "", shift: "", staff: "", dateKey: "" };
}

function ensureSessionValidOrReset() {
  const saved = loadSessionFromLocal();
  const todayKey = getTodayKey();

  // reset after midnight (date changed)
  if (!saved || saved.dateKey !== todayKey) {
    clearSession();
    showSessionScreen();
    return false;
  }

  session = saved;

  // apply to UI
  storeEl.value = session.store;
  staffEl.value = session.staff;
  sessionInfoEl.textContent = `Store: ${session.store} • Shift: ${session.shift}`;
  showAppShell();
  showHome();
  return true;
}

function sessionPopup() {
  // popup for BOTH shifts (as requested)
  alert(
    "PLEASE Check expired date:\n" +
      "- chicken bacon\n" +
      "- avocado\n" +
      "- lettuce\n" +
      "- flatbread"
  );
}

// ---------- Rendering ----------
function renderCategoryTiles() {
  categoryGridEl.innerHTML = "";

  categories.forEach((cat) => {
    const count = allItems.filter((x) => x.category === cat).length;

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
    .filter((x) => x.category === cat)
    .forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.name;
      li.onclick = () => showItemForm(it);
      itemListEl.appendChild(li);
    });
}

function renderExpiryList(list) {
  expiryListEl.innerHTML = "";

  if (!Array.isArray(list) || list.length === 0) {
    expiryListEl.innerHTML = "<li>No expiring items ✅</li>";
    return;
  }

  list.forEach((x) => {
    const li = document.createElement("li");
    const d = new Date(x.expiry);
    li.textContent = `${x.name} — Qty ${x.quantity} — Exp ${formatFullDate(d)}`;
    expiryListEl.appendChild(li);
  });
}

function renderLowStockList(list) {
  lowStockListEl.innerHTML = "";

  if (!Array.isArray(list) || list.length === 0) {
    lowStockListEl.innerHTML = "<li>No low stock items ✅</li>";
    return;
  }

  list.forEach((x) => {
    const li = document.createElement("li");
    li.textContent = `${x.name} — Qty ${x.quantity} (${x.category})`;
    lowStockListEl.appendChild(li);
  });
}

// ---------- Expiry dropdown ----------
function buildExpiryOptions(item) {
  expiryEl.innerHTML = "";

  const days = Math.max(0, Number(item.shelf_life_days || 0));

  // option: today + next N days (N = shelf_life_days)
  const base = todayLocalDateOnly();

  for (let i = 0; i <= days; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);

    const opt = document.createElement("option");
    opt.value = isoDateOnly(d);          // send to API as YYYY-MM-DD
    opt.textContent = formatFullDate(d); // show as "04 January 2026"
    expiryEl.appendChild(opt);
  }

  // default selection = today
  expiryEl.value = isoDateOnly(base);
}

// ---------- API ----------
async function loadItems() {
  const res = await fetch("/api/items");
  if (!res.ok) throw new Error("Failed to load items");
  allItems = await res.json();

  // build categories from items
  categories = [...new Set(allItems.map((x) => x.category))];

  // sort categories (optional)
  categories.sort((a, b) => a.localeCompare(b));

  renderCategoryTiles();
}

async function loadAlerts() {
  const store = storeEl.value;

  // 1) expiry list (from your backend)
  const res = await fetch(`/api/expiry?store=${encodeURIComponent(store)}`);
  const data = await res.json();
  renderExpiryList(data);

  // 2) low stock (best effort):
  // If you have /api/lowstock it will use it. If not, it will just show "No low stock".
  try {
    const r2 = await fetch(`/api/lowstock?store=${encodeURIComponent(store)}`);
    if (!r2.ok) throw new Error("no lowstock endpoint");
    const low = await r2.json();

    // exclude sauces (both "Sauce" and "Sauces")
    const filtered = low.filter(
      (x) =>
        Number(x.quantity) <= 2 &&
        !["sauce", "sauces"].includes(String(x.category || "").toLowerCase())
    );
    renderLowStockList(filtered);
  } catch {
    renderLowStockList([]);
  }
}

async function saveLog() {
  const staff = staffEl.value.trim();
  if (!staff) {
    alert("Please enter staff ID & name");
    staffEl.focus();
    return;
  }
  if (!currentItem) return;

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
  showHome();
  await loadAlerts();
}

// ---------- Events ----------
btnStartSession.onclick = async () => {
  const store = sessionStoreEl.value;
  const shift = sessionShiftEl.value;
  const staff = sessionStaffEl.value.trim();

  if (!store || !shift || !staff) {
    sessionMsgEl.textContent = "Please select store, shift, and enter staff.";
    return;
  }

  session = {
    store,
    shift,
    staff,
    dateKey: getTodayKey()
  };
  saveSessionToLocal();

  // apply to app UI
  storeEl.value = store;
  staffEl.value = staff;
  sessionInfoEl.textContent = `Store: ${store} • Shift: ${shift}`;

  showAppShell();
  showHome();

  // popup once each session start
  sessionPopup();

  // load alerts for selected store
  await loadAlerts();
};

btnBack.onclick = () => showHome();
btnCloseItem.onclick = () => showHome();
btnSave.onclick = () => saveLog();

btnAlerts.onclick = async () => {
  showAlerts();
  await loadAlerts();
};
btnCloseAlerts.onclick = () => showHome();

storeEl.onchange = async () => {
  // store changed -> refresh alerts
  session.store = storeEl.value;
  session.dateKey = getTodayKey();
  saveSessionToLocal();
  sessionInfoEl.textContent = `Store: ${session.store} • Shift: ${session.shift}`;
  await loadAlerts();
};

staffEl.onchange = () => {
  // update staff in session
  session.staff = staffEl.value.trim();
  session.dateKey = getTodayKey();
  saveSessionToLocal();
};

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  // if session expired (midnight), return to session screen
  const ok = ensureSessionValidOrReset();

  // Always load items (for tiles/list)
  try {
    await loadItems();
  } catch (e) {
    console.error(e);
    alert("Failed to load items. Check /api/items.");
    return;
  }

  if (ok) {
    // already in session -> refresh alerts for store
    await loadAlerts();
  }
});
