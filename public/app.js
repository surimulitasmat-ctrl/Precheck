// ---------- Elements ----------
const storeEl = document.getElementById("store");
const staffEl = document.getElementById("staff");

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
const sessionScreenEl = document.getElementById("sessionScreen");
const sessionStoreEl = document.getElementById("sessionStore");
const sessionShiftEl = document.getElementById("sessionShift");
const btnStartSession = document.getElementById("btnStartSession");
const sessionMsgEl = document.getElementById("sessionMsg");
const topBarEl = document.getElementById("topBar");

// ---------- State ----------
let allItems = [];
let categories = [];
let currentCategory = null;
let currentItem = null;

// ---------- Helpers ----------
function requireStaff() {
  const s = staffEl.value.trim();
  if (!s) {
    alert("Please enter staff ID & name");
    staffEl.focus();
    return null;
  }
  return s;
}

function showHome() {
  homeEl.classList.remove("hidden");
  categoryViewEl.classList.add("hidden");
  itemFormEl.classList.add("hidden");
}

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
function showSessionScreen() {
  if (sessionScreenEl) sessionScreenEl.classList.remove("hidden");
  if (topBarEl) topBarEl.classList.add("hidden");
  if (homeEl) homeEl.classList.add("hidden");
}


function startSession() {
  const store = sessionStoreEl.value;
  const shift = sessionShiftEl.value;

  if (!store || !shift) {
    sessionMsgEl.textContent = "Please select store and shift";
    return;
  }

  // set store in main UI
  storeEl.value = store;

  // show reminder popup (for BOTH shifts)
  alert(
    "PLEASE CHECK EXPIRED DATE:\n" +
    "- Chicken bacon\n" +
    "- Avocado\n" +
    "- Lettuce\n" +
    "- Flatbread"
  );

  // hide session screen, show app
  sessionScreenEl.classList.add("hidden");
  topBarEl.classList.remove("hidden");
  showHome();

  loadExpiry();
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
  if (!expiryListEl) return;

  expiryListEl.innerHTML = "";

  if (!list || !list.length) {
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
  if (!lowStockListEl) return;

  lowStockListEl.innerHTML = "";

  if (!list || !list.length) {
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

async function loadExpiry() {
  const store = storeEl.value;
  const res = await fetch(`/api/expiry?store=${encodeURIComponent(store)}`);
  const data = await res.json();

  // 1) expiry list
  renderExpiryList(data);

  // 2) low stock list (<=2), exclude Sauces + Sauce
  const lowStock = (data || []).filter(x =>
    Number(x.quantity) <= 2 &&
    !["sauces", "sauce"].includes(String(x.category || "").toLowerCase())
  );

  renderLowStock(lowStock);
}

async function saveLog() {
  const staff = requireStaff();
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
  loadExpiry();
}

// ---------- Events ----------
btnBack.onclick = showHome;
btnCloseItem.onclick = hideItemForm;
btnSave.onclick = saveLog;
storeEl.onchange = loadExpiry;
if (sessionStoreEl && sessionShiftEl && btnStartSession) {
  sessionStoreEl.onchange = sessionShiftEl.onchange = () => {
    btnStartSession.disabled = !(
      sessionStoreEl.value && sessionShiftEl.value
    );
  };

  btnStartSession.onclick = startSession;
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  showSessionScreen();
  loadItems();
});
