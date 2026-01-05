// ===============================
// PreCheck - app.js (FINAL RULES)
// Data source: /api/items (no dummy)
// ===============================

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatFullDate(d) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function buildTimeOptionsEvery30Min() {
  // 00:00, 00:30, ... 23:30 (48 options)
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      opts.push(`${pad2(h)}:${pad2(m)}`);
    }
  }
  return opts;
}

// ---------- Expiry Modes ----------
const MODE = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
  EOD: "EOD",
  HOURLY: "HOURLY",
  HOURLY_FIXED: "HOURLY_FIXED",
};

// ---------- Session State ----------
let session = {
  store: "PDD",
  shift: "Morning",
  staff: "",
};

// ---------- App State ----------
let allItems = [];
let categories = [];
let currentCategory = null;
let currentSauceSub = null;
let currentItem = null;

// ---------- UI Elements ----------
const sessionScreen = $("sessionScreen");
const appShell = $("appShell");

const sessionStore = $("sessionStore");
const sessionShift = $("sessionShift");
const sessionStaff = $("sessionStaff");
const sessionMsg = $("sessionMsg");
const btnStartSession = $("btnStartSession");

const storeEl = $("store");
const staffEl = $("staff");
const sessionInfoEl = $("sessionInfo");

const homeEl = $("home");
const categoryGridEl = $("categoryGrid");

const categoryViewEl = $("categoryView");
const catTitleEl = $("catTitle");
const catSubEl = $("catSub");
const itemListEl = $("itemList");
const btnBack = $("btnBack");

const itemFormEl = $("itemForm");
const itemTitleEl = $("itemTitle");
const itemMetaEl = $("itemMeta");
const qtyEl = $("qty");
const btnSave = $("btnSave");
const btnCloseItem = $("btnCloseItem");
const saveMsgEl = $("saveMsg");

const btnAlerts = $("btnAlerts");
const alertsViewEl = $("alertsView");
const btnCloseAlerts = $("btnCloseAlerts");
const expiryListEl = $("expiryList");
const lowStockListEl = $("lowStockList");

// ---------- Business Rules ----------
const MANUAL_ITEMS = new Set([
  // Backroom manual
  "Canola Oil",
  "Salt Open Inner",
  "Pepper Open Inner",
  "Olive Open Bottle",
  "Parmesan Oregano",
  "Shallot",
  "Honey Oat",
  "Parmesan Open Inner",
  "Shallot Open Inner",
  "Honey Oat Open Inner",
  "Cajun Spice Packet",
  "Cajun Spice Open Inner", // you defined as AUTO 5 days later; this list still ok because we override below

  // Front Counter manual
  "Salt",
  "Pepper",
  "Cookies",
  "Olive Oil",
  "Milo",
  "Tea Bag",
]);

const HOURLY_FIXED_ITEMS = new Set([
  "Bread",
  "Tomato Soup (H)",
  "Mushroom Soup (H)",
]);

const HOURLY_FIXED_OPTIONS = [
  { label: "11:00 AM", value: "11:00" },
  { label: "3:00 PM", value: "15:00" },
  { label: "7:00 PM", value: "19:00" },
  { label: "11:00 PM", value: "23:00" },
];

const HOURLY_ANYTIME_OPTIONS = buildTimeOptionsEvery30Min();

// ---------- Mode Resolver (YOUR FINAL DEFINITIONS) ----------
function resolveExpiryMode(item, store) {
  // Beef Taco (H): HOURLY, SKH only (and hidden from PDD)
  if (item.name === "Beef Taco (H)" && store === "SKH") return MODE.HOURLY;

  // Chicken Bacon: EOD
  if (item.name === "Chicken Bacon") return MODE.EOD;

  // Shelf life > 7: MANUAL (override everything)
  if (Number(item.shelf_life_days) > 7) return MODE.MANUAL;

  // Hourly fixed list
  if (HOURLY_FIXED_ITEMS.has(item.name)) return MODE.HOURLY_FIXED;

  // Vegetables default: AUTO
  if (item.category === "Vegetables") return MODE.AUTO;

  // Cajun Spice Open Inner: AUTO 5 days (override manual list)
  if (item.name === "Cajun Spice Open Inner") return MODE.AUTO;

  // Manual list
  if (MANUAL_ITEMS.has(item.name)) return MODE.MANUAL;

  // Default
  return MODE.AUTO;
}

// ---------- Shelf Life Resolver (for AUTO only) ----------
function resolveShelfLifeDays(item) {
  // Vegetables rules
  if (item.category === "Vegetables") {
    if (item.name === "Mix Green Packet") return 1;
    return 2;
  }

  // Cajun Spice Open Inner override
  if (item.name === "Cajun Spice Open Inner") return 5;

  // Use database shelf life
  return Number(item.shelf_life_days || 0);
}

// ---------- Small helper text (NO BIG MODE LABELS) ----------
function helperTextFor(item, mode) {
  if (mode === MODE.AUTO) {
    const n = resolveShelfLifeDays(item);
    return `Select expiry date (Today + next ${n} day${n === 1 ? "" : "s"})`;
  }
  if (mode === MODE.MANUAL) return "Select expiry date/time manually";
  if (mode === MODE.EOD) return "Expiry is set to End of Day (23:59)";
  if (mode === MODE.HOURLY) return "Select expiry time (any time, past time allowed)";
  if (mode === MODE.HOURLY_FIXED) return "Select expiry time slot (past time allowed)";
  return "";
}

// ---------- Screens ----------
function hideAllScreens() {
  homeEl.classList.add("hidden");
  categoryViewEl.classList.add("hidden");
  itemFormEl.classList.add("hidden");
  alertsViewEl.classList.add("hidden");
}

function showHome() {
  hideAllScreens();
  homeEl.classList.remove("hidden");
}

function showCategory(cat) {
  currentCategory = cat;
  currentSauceSub = null;

  hideAllScreens();
  categoryViewEl.classList.remove("hidden");

  catTitleEl.textContent = cat;

  // Sauce special: show sub-categories first
  if (cat === "Sauce") {
    catSubEl.textContent = "Choose area";
    renderSauceSubMenu();
  } else {
    catSubEl.textContent = "Tap item to update";
    renderItemList(cat);
  }
}

function showSauceSub(sub) {
  currentSauceSub = sub;
  catTitleEl.textContent = "Sauce";
  catSubEl.textContent = sub;
  renderItemList("Sauce", sub);
}

function showItemForm(item) {
  currentItem = item;

  itemTitleEl.textContent = item.name;
  itemMetaEl.textContent = item.category + (item.sub_category ? ` • ${item.sub_category}` : "");

  qtyEl.value = "";
  saveMsgEl.textContent = "";

  // Build expiry input based on mode
  buildExpiryUI(item);

  hideAllScreens();
  itemFormEl.classList.remove("hidden");
}

// ---------- Render ----------
function visibleItemsForCurrentStore(items) {
  const store = storeEl.value;

  return items.filter((it) => {
    // Hide Beef Taco (H) for PDD
    if (it.name === "Beef Taco (H)") return store === "SKH";
    return true;
  });
}

function renderCategoryTiles() {
  categoryGridEl.innerHTML = "";

  const store = storeEl.value;
  const items = visibleItemsForCurrentStore(allItems);

  const cats = [...new Set(items.map((x) => x.category))].sort((a, b) => a.localeCompare(b));
  categories = cats;

  cats.forEach((cat) => {
    const count = items.filter((x) => x.category === cat).length;

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

function renderSauceSubMenu() {
  itemListEl.innerHTML = "";

  const subs = ["Sandwich Unit", "Standby", "Open Inner"];

  subs.forEach((sub) => {
    const li = document.createElement("li");
    li.textContent = sub;
    li.onclick = () => showSauceSub(sub);
    itemListEl.appendChild(li);
  });
}

function renderItemList(cat, sauceSub = null) {
  itemListEl.innerHTML = "";

  const store = storeEl.value;

  visibleItemsForCurrentStore(allItems)
    .filter((x) => x.category === cat)
    .filter((x) => {
      if (cat !== "Sauce") return true;
      return sauceSub ? String(x.sub_category || "") === sauceSub : true;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.name;
      li.onclick = () => showItemForm(it);
      itemListEl.appendChild(li);
    });
}

// ---------- Expiry UI Builder ----------
function setExpiryField(html) {
  // We expect index.html has <select id="expiry"></select>
  // We replace its container to support input/select smoothly.
  const old = $("expiry");
  const parent = old?.parentElement;
  if (!parent) return;

  parent.innerHTML = `
    <label>Expiry</label>
    ${html}
    <div class="mini" id="expiryHelper" style="margin-top:6px;"></div>
  `;
}

function buildExpiryUI(item) {
  const mode = resolveExpiryMode(item, storeEl.value);
  const helper = helperTextFor(item, mode);

  // AUTO = date dropdown
  if (mode === MODE.AUTO) {
    setExpiryField(`<select id="expiry"><option value="">Select expiry date</option></select>`);
    const sel = $("expiry");

    const shelf = resolveShelfLifeDays(item);
    const base = startOfToday();

    for (let i = 0; i <= shelf; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);

      const opt = document.createElement("option");
      opt.value = isoDate(d);
      opt.textContent = formatFullDate(d);
      sel.appendChild(opt);
    }

    $("expiryHelper").textContent = helper;
    return;
  }

  // MANUAL = datetime picker
  if (mode === MODE.MANUAL) {
    setExpiryField(`<input id="expiry" type="datetime-local" />`);
    $("expiryHelper").textContent = helper;
    return;
  }

  // EOD = hidden expiry, no selection
  if (mode === MODE.EOD) {
    const v = isoDate(startOfToday()) + "T23:59";
    setExpiryField(`
      <div class="mini">End of Day (23:59)</div>
      <input id="expiry" type="hidden" value="${v}" />
    `);
    $("expiryHelper").textContent = helper;
    return;
  }

  // HOURLY = time dropdown (any time)
  if (mode === MODE.HOURLY) {
    setExpiryField(`<select id="expiry"></select>`);
    const sel = $("expiry");
    // Any time allowed, past allowed; no validation.
    HOURLY_ANYTIME_OPTIONS.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t; // time only
      opt.textContent = t;
      sel.appendChild(opt);
    });
    // default time
    sel.value = "11:00";
    $("expiryHelper").textContent = helper;
    return;
  }

  // HOURLY_FIXED = 4 fixed slots
  if (mode === MODE.HOURLY_FIXED) {
    setExpiryField(`<select id="expiry"></select>`);
    const sel = $("expiry");

    HOURLY_FIXED_OPTIONS.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.value; // time only
      opt.textContent = o.label;
      sel.appendChild(opt);
    });

    sel.value = "11:00";
    $("expiryHelper").textContent = helper;
    return;
  }
}

// ---------- Alerts ----------
async function loadAlerts() {
  const store = storeEl.value;

  const res = await fetch(`/api/expiry?store=${encodeURIComponent(store)}`);
  const data = await res.json();

  // Expiry list
  expiryListEl.innerHTML = "";
  if (!data.length) {
    expiryListEl.innerHTML = "<li>No expiring items ✅</li>";
  } else {
    data.forEach((x) => {
      const li = document.createElement("li");
      const d = new Date(x.expiry);
      const nice = isNaN(d.getTime()) ? String(x.expiry) : formatFullDate(d);
      li.textContent = `${x.name} — Qty ${x.quantity} — Exp ${nice}`;
      expiryListEl.appendChild(li);
    });
  }

  // Low stock list (<=2), excluding Sauces category
  lowStockListEl.innerHTML = "";
  const low = data.filter(
    (x) =>
      Number(x.quantity) <= 2 &&
      String(x.category || "").toLowerCase() !== "sauces" &&
      String(x.category || "").toLowerCase() !== "sauce"
  );

  if (!low.length) {
    lowStockListEl.innerHTML = "<li>No low stock items ✅</li>";
  } else {
    low.forEach((x) => {
      const li = document.createElement("li");
      li.textContent = `${x.name} — Qty ${x.quantity} (${x.category})`;
      lowStockListEl.appendChild(li);
    });
  }
}

// ---------- Save ----------
async function saveLog() {
  if (!currentItem) return;

  const store = storeEl.value;
  const staff = staffEl.value.trim();
  const qty = qtyEl.value;

  if (!staff) {
    alert("Please enter staff ID & name");
    staffEl.focus();
    return;
  }

  if (qty === "" || qty === null) {
    alert("Enter quantity");
    qtyEl.focus();
    return;
  }

  const mode = resolveExpiryMode(currentItem, store);

  let expiryVal = $("expiry")?.value;

  // AUTO: must choose a date, save blocked if empty
  if (mode === MODE.AUTO && !expiryVal) {
    alert("Please select expiry date");
    return;
  }

  // HOURLY / HOURLY_FIXED store time as datetime today + time
  if (mode === MODE.HOURLY || mode === MODE.HOURLY_FIXED) {
    const t = expiryVal || "00:00";
    expiryVal = isoDate(startOfToday()) + "T" + t;
  }

  // EOD already has hidden value
  // MANUAL already has datetime-local string

  saveMsgEl.textContent = "Saving...";

  const res = await fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store,
      staff,
      item_id: currentItem.id,
      quantity: qty,
      expiry: expiryVal,
    }),
  });

  saveMsgEl.textContent = res.ok ? "Saved ✅" : "Error ❌";

  // Close form and refresh alerts
  itemFormEl.classList.add("hidden");
  await loadAlerts();
  showHome();
}

// ---------- Start Session ----------
function startSession() {
  const sStore = sessionStore.value;
  const sShift = sessionShift.value;
  const sStaff = sessionStaff.value.trim();

  if (!sStore || !sShift || !sStaff) {
    sessionMsg.textContent = "Please choose store, shift, and enter staff.";
    return;
  }

  session = { store: sStore, shift: sShift, staff: sStaff };

  // Sync header inputs
  storeEl.value = sStore;
  staffEl.value = sStaff;

  sessionInfoEl.textContent = `${session.store} • ${session.shift} • ${session.staff}`;

  // Switch screens
  sessionScreen.classList.add("hidden");
  appShell.classList.remove("hidden");

  // Render
  renderCategoryTiles();
  showHome();
  loadAlerts();
}

// ---------- Init ----------
async function init() {
  // Load from DB (no dummy)
  const res = await fetch("/api/items");
  allItems = await res.json();

  // If your backend doesn’t return sub_category, normalize it
  allItems = allItems.map((x) => ({
    id: x.id,
    name: x.name,
    category: x.category,
    sub_category: x.sub_category || x.subCategory || "",
    shelf_life_days: x.shelf_life_days ?? x.shelfLifeDays ?? 0,
  }));

  // Wire events
  btnStartSession.onclick = startSession;

  btnBack.onclick = showHome;

  btnCloseItem.onclick = () => {
    itemFormEl.classList.add("hidden");
    showHome();
  };

  btnSave.onclick = saveLog;

  btnAlerts.onclick = async () => {
    await loadAlerts();
    hideAllScreens();
    alertsViewEl.classList.remove("hidden");
  };

  btnCloseAlerts.onclick = () => showHome();

  storeEl.onchange = () => {
    session.store = storeEl.value;
    sessionInfoEl.textContent = `${session.store} • ${session.shift} • ${session.staff}`;
    renderCategoryTiles();
    loadAlerts();
    showHome();
  };

  // Start screen visible
  sessionScreen.classList.remove("hidden");
  appShell.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", init);
