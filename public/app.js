// -------------------- Elements --------------------
const storeEl = document.getElementById("store");
const staffEl = document.getElementById("staff");

const topBarEl = document.getElementById("topBar");

const sessionScreenEl = document.getElementById("sessionScreen");
const sessionStoreEl = document.getElementById("sessionStore");
const sessionShiftEl = document.getElementById("sessionShift");
const sessionStaffEl = document.getElementById("sessionStaff");
const btnStartSession = document.getElementById("btnStartSession");
const sessionMsgEl = document.getElementById("sessionMsg");

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

const expiryListEl = document.getElementById("expiryList");
const lowStockListEl = document.getElementById("lowStockList");

const shiftPopupEl = document.getElementById("shiftPopup");
const btnClosePopup = document.getElementById("btnClosePopup");

// -------------------- State --------------------
let allItems = [];
let categories = [];
let currentCategory = null;
let currentItem = null;

// -------------------- Date helpers --------------------
function todayKey() {
  // local date yyyy-mm-dd
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// -------------------- Session logic (reset after midnight) --------------------
function clearSessionIfNewDay() {
  const t = todayKey();
  const savedDay = localStorage.getItem("precheck_day");
  if (savedDay !== t) {
    localStorage.removeItem("precheck_store");
    localStorage.removeItem("precheck_shift");
    localStorage.removeItem("precheck_staff");
    localStorage.removeItem("precheck_popupShown");
    localStorage.setItem("precheck_day", t);
  }
}

function showSessionScreen() {
  sessionScreenEl.classList.remove("hidden");
  homeEl.classList.add("hidden");
  categoryViewEl.classList.add("hidden");
  itemFormEl.classList.add("hidden");
  topBarEl.classList.remove("hidden");
}

function showHome() {
  sessionScreenEl.classList.add("hidden");
  homeEl.classList.remove("hidden");
  categoryViewEl.classList.add("hidden");
  itemFormEl.classList.add("hidden");
}

function startSession() {
  const store = sessionStoreEl.value;
  const shift = sessionShiftEl.value;
  const staff = sessionStaffEl.value.trim();

  if (!store || !shift || !staff) {
    sessionMsgEl.textContent = "Please select store, shift, and staff.";
    return;
  }

  // Save session
  localStorage.setItem("precheck_store", store);
  localStorage.setItem("precheck_shift", shift);
  localStorage.setItem("precheck_staff", staff);

  // Apply to main UI fields
  storeEl.value = store;
  staffEl.value = staff;

  // Show Home and load alerts
  showHome();
  loadExpiry().then(() => maybeShowShiftPopup());
}

function loadSessionOrAsk() {
  clearSessionIfNewDay();

  const store = localStorage.getItem("precheck_store");
  const shift = localStorage.getItem("precheck_shift");
  const staff = localStorage.getItem("precheck_staff");

  if (!store || !shift || !staff) {
    showSessionScreen();
    return;
  }

  // Apply saved session
  storeEl.value = store;
  staffEl.value = staff;

  showHome();
  loadExpiry().then(() => maybeShowShiftPopup());
}

// -------------------- Popup logic (both Morning & Afternoon) --------------------
function maybeShowShiftPopup() {
  // show once per day per session
  const shown = localStorage.getItem("precheck_popupShown");
  if (shown === "1") return;

  // show popup for BOTH shifts (as you requested)
  shiftPopupEl.classList.remove("hidden");
  localStorage.setItem("precheck_popupShown", "1");
}

btnClosePopup.onclick = () => {
  shiftPopupEl.classList.add("hidden");
};

// -------------------- Navigation --------------------
function showCategory(cat) {
  currentCategory = cat;
  catTitleEl.textContent = cat;

  homeEl.classList.add("hidden");
  categoryViewEl.classList.remove("hidden");
  itemFormEl.classList.add("hidden");

  renderItemList(cat);
}

function showItemForm(item) {
  currentItem = item;
  itemTitleEl.textContent = item.name;
  itemMetaEl.textContent = item.category;

  qtyEl.value = "";
  expiryEl.value = "";
  saveMsgEl.textContent = "";

  itemFormEl.classList.remove("hidden");
}

function hideItemForm() {
  itemFormEl.classList.add("hidden");
}

// -------------------- Render --------------------
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
    const niceDate = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    li.textContent = `${x.name} — Qty ${x.quantity} — Exp ${niceDate}`;
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

// -------------------- API --------------------
async function loadItems() {
  const res = await fetch("/api/items");
  allItems = await res.json();

  categories = [...new Set(allItems.map(x => x.category))];
  renderCategoryTiles();
}

async function loadExpiry() {
  const store = storeEl.value;
  const res = await fetch(`/api/expiry?store=${encodeURIComponent(store)}`);
  const data = await res.json();

  // expiry list
  renderExpiryList(data);

  // low stock: quantity <= 2, exclude Sauces/Sauce
  const lowStock = data.filter(x =>
    Number(x.quantity) <= 2 &&
    String(x.category || "").toLowerCase() !== "sauces" &&
    String(x.category || "").toLowerCase() !== "sauce"
  );

  renderLowStock(lowStock);
}

async function saveLog() {
  const staff = staffEl.value.trim();
  if (!staff || !currentItem) return;

  const store = storeEl.value;
  const quantity = qtyEl.value;
  const expiry = expiryEl.value;

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
  await loadExpiry();
}

// -------------------- Events --------------------
btnBack.onclick = showHome;
btnCloseItem.onclick = hideItemForm;
btnSave.onclick = saveLog;

storeEl.onchange = () => loadExpiry();

btnStartSession.onclick = startSession;

// -------------------- Init --------------------
document.addEventListener("DOMContentLoaded", async () => {
  // ensure day key exists
  if (!localStorage.getItem("precheck_day")) {
    localStorage.setItem("precheck_day", todayKey());
  }

  await loadItems();
  loadSessionOrAsk();
});
