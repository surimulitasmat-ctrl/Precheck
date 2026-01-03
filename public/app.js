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
  function renderLowStock(list) {
  const lowStockEl = document.getElementById("lowStockList");
  lowStockEl.innerHTML = "";

  if (!list.length) {
    lowStockEl.innerHTML = "<li>No low stock items ✅</li>";
    return;
  }

  list.forEach(x => {
    const li = document.createElement("li");
    li.textContent = `${x.name} — Qty ${x.quantity} (${x.category})`;

    lowStockEl.appendChild(li);
  });
}

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

  // 1) expiry list (already working)
  renderExpiryList(data);

  // 2) low stock list (<=2), exclude Sauces
  const lowStock = data.filter(x =>
    Number(x.quantity) <= 2 &&
    String(x.category || "").toLowerCase() !== "sauces" &&
    String(x.category || "").toLowerCase() !== "sauce"
  );

  renderLowStock(lowStock);
}

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

// ---------- Init ----------
showHome();
loadItems().then(loadExpiry);
