// ===============================
// PreCheck - app.js (NO onclick null errors)
// Uses /api/items (no dummy)
// ===============================

const $ = (id) => document.getElementById(id);
const on = (id, event, fn) => {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
};

const MODE = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
  EOD: "EOD",
  HOURLY: "HOURLY",
  HOURLY_FIXED: "HOURLY_FIXED",
};

const HOURLY_FIXED_OPTIONS = [
  { label: "11:00 AM", value: "11:00" },
  { label: "3:00 PM",  value: "15:00" },
  { label: "7:00 PM",  value: "19:00" },
  { label: "11:00 PM", value: "23:00" },
];

function startOfToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0,10);
}

function formatFullDate(d) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function timeOptionsEvery30() {
  const out = [];
  for (let h=0; h<24; h++) {
    for (let m of [0,30]) {
      out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    }
  }
  return out;
}

const MANUAL_ITEMS = new Set([
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

let allItems = [];
let currentItem = null;

let session = {
  store: "",
  shift: "",
  staff: "",
};

// ---------- Expiry mode rules ----------
function resolveExpiryMode(item, store) {
  if (item.name === "Beef Taco (H)" && store === "SKH") return MODE.HOURLY;
  if (item.name === "Chicken Bacon") return MODE.EOD;
  if (Number(item.shelf_life_days) > 7) return MODE.MANUAL;
  if (HOURLY_FIXED_ITEMS.has(item.name)) return MODE.HOURLY_FIXED;
  if (item.category === "Vegetables") return MODE.AUTO;
  if (item.name === "Cajun Spice Open Inner") return MODE.AUTO;
  if (MANUAL_ITEMS.has(item.name)) return MODE.MANUAL;
  return MODE.AUTO;
}

function resolveShelfLifeDays(item) {
  if (item.category === "Vegetables") return item.name === "Mix Green Packet" ? 1 : 2;
  if (item.name === "Cajun Spice Open Inner") return 5;
  return Number(item.shelf_life_days || 0);
}

// ---------- Screen helpers ----------
function hideAll() {
  ["home","categoryView","itemForm","alertsView"].forEach(id => {
    const el = $(id);
    if (el) el.classList.add("hidden");
  });
}

function showHome() {
  hideAll();
  $("home")?.classList.remove("hidden");
}

// ---------- Render categories ----------
function visibleItemsForStore(items, store) {
  return items.filter(it => {
    if (it.name === "Beef Taco (H)") return store === "SKH";
    return true;
  });
}

function renderCategories() {
  const grid = $("categoryGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const store = $("store")?.value || session.store || "PDD";
  const items = visibleItemsForStore(allItems, store);

  const cats = [...new Set(items.map(x => x.category))].sort((a,b)=>a.localeCompare(b));

  cats.forEach(cat => {
    const count = items.filter(x => x.category === cat).length;
    const btn = document.createElement("button");
    btn.className = "tile";
    btn.innerHTML = `<div class="title">${cat}</div><div class="sub">${count} items</div>`;
    btn.addEventListener("click", () => openCategory(cat));
    grid.appendChild(btn);
  });
}

function openCategory(cat) {
  hideAll();
  $("categoryView")?.classList.remove("hidden");
  $("catTitle").textContent = cat;
  $("catSub").textContent = cat === "Sauce" ? "Choose area" : "Tap item to update";

  if (cat === "Sauce") {
    renderSauceSubMenu();
  } else {
    renderItemList(cat, null);
  }
}

function renderSauceSubMenu() {
  const list = $("itemList");
  list.innerHTML = "";

  ["Sandwich Unit","Standby","Open Inner"].forEach(sub => {
    const li = document.createElement("li");
    li.textContent = sub;
    li.addEventListener("click", () => renderItemList("Sauce", sub));
    list.appendChild(li);
  });
}

function renderItemList(category, sauceSub) {
  const list = $("itemList");
  list.innerHTML = "";

  const store = $("store")?.value || session.store || "PDD";
  const items = visibleItemsForStore(allItems, store)
    .filter(x => x.category === category)
    .filter(x => category !== "Sauce" ? true : String(x.sub_category||"") === String(sauceSub||""))
    .sort((a,b)=>a.name.localeCompare(b.name));

  $("catSub").textContent = category === "Sauce" ? sauceSub : "Tap item to update";

  items.forEach(it => {
    const li = document.createElement("li");
    li.textContent = it.name;
    li.addEventListener("click", () => openItem(it));
    list.appendChild(li);
  });
}

// ---------- Item form ----------
function rebuildExpiryField(item) {
  const expiryField = $("expiry")?.parentElement;
  if (!expiryField) return;

  const mode = resolveExpiryMode(item, $("store").value);

  expiryField.innerHTML = `
    <label>Expiry</label>
    <div id="expiryWrap"></div>
    <div class="mini" id="expiryHelper" style="margin-top:6px;"></div>
  `;

  const wrap = $("expiryWrap");
  const helper = $("expiryHelper");

  if (mode === MODE.AUTO) {
    const sel = document.createElement("select");
    sel.id = "expiry";
    sel.innerHTML = `<option value="">Select expiry date</option>`;

    const n = resolveShelfLifeDays(item);
    const base = startOfToday();

    for (let i=0;i<=n;i++) {
      const d = new Date(base);
      d.setDate(d.getDate()+i);
      const opt = document.createElement("option");
      opt.value = isoDate(d);
      opt.textContent = formatFullDate(d);
      sel.appendChild(opt);
    }

    wrap.appendChild(sel);
    helper.textContent = `Select expiry date (Today + next ${n} day${n===1?"":"s"})`;
    return;
  }

  if (mode === MODE.MANUAL) {
    wrap.innerHTML = `<input id="expiry" type="datetime-local" />`;
    helper.textContent = "Select expiry date/time manually";
    return;
  }

  if (mode === MODE.EOD) {
    const v = isoDate(startOfToday()) + "T23:59";
    wrap.innerHTML = `<div class="mini">End of Day (23:59)</div><input id="expiry" type="hidden" value="${v}">`;
    helper.textContent = "Expiry set automatically to End of Day";
    return;
  }

  if (mode === MODE.HOURLY) {
    const sel = document.createElement("select");
    sel.id = "expiry";
    timeOptionsEvery30().forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;      // time only
      opt.textContent = t;
      sel.appendChild(opt);
    });
    sel.value = "11:00";
    wrap.appendChild(sel);
    helper.textContent = "Select expiry time (past time allowed)";
    return;
  }

  if (mode === MODE.HOURLY_FIXED) {
    const sel = document.createElement("select");
    sel.id = "expiry";
    HOURLY_FIXED_OPTIONS.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.value;     // time only
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    sel.value = "11:00";
    wrap.appendChild(sel);
    helper.textContent = "Select expiry time slot (past time allowed)";
    return;
  }
}

function openItem(item) {
  currentItem = item;

  $("itemTitle").textContent = item.name;
  $("itemMeta").textContent = item.category + (item.sub_category ? ` • ${item.sub_category}` : "");

  $("qty").value = "";
  $("saveMsg").textContent = "";

  rebuildExpiryField(item);

  hideAll();
  $("itemForm")?.classList.remove("hidden");
}

// ---------- Alerts ----------
async function loadAlerts() {
  const store = $("store").value;
  const res = await fetch(`/api/expiry?store=${encodeURIComponent(store)}`);
  const data = await res.json();

  const expiryList = $("expiryList");
  const lowStock = $("lowStockList");

  expiryList.innerHTML = "";
  if (!data.length) expiryList.innerHTML = "<li>No expiring items ✅</li>";
  else {
    data.forEach(x => {
      const li = document.createElement("li");
      li.textContent = `${x.name} — Qty ${x.quantity} — Exp ${x.expiry}`;
      expiryList.appendChild(li);
    });
  }

  lowStock.innerHTML = "";
  const low = data.filter(x =>
    Number(x.quantity) <= 2 &&
    String(x.category||"").toLowerCase() !== "sauce" &&
    String(x.category||"").toLowerCase() !== "sauces"
  );

  if (!low.length) lowStock.innerHTML = "<li>No low stock items ✅</li>";
  else {
    low.forEach(x => {
      const li = document.createElement("li");
      li.textContent = `${x.name} — Qty ${x.quantity} (${x.category})`;
      lowStock.appendChild(li);
    });
  }
}

// ---------- Save ----------
async function saveLog() {
  if (!currentItem) return;

  const store = $("store").value;
  const staff = $("staff").value.trim();
  const qty = $("qty").value;
  const expRaw = $("expiry")?.value;

  if (!staff) return alert("Please enter staff ID & name");
  if (!qty) return alert("Enter quantity");

  const mode = resolveExpiryMode(currentItem, store);

  if (mode === MODE.AUTO && !expRaw) {
    return alert("Please select expiry date");
  }

  let expiry = expRaw;

  // HOURLY + HOURLY_FIXED store time as datetime today + time
  if (mode === MODE.HOURLY || mode === MODE.HOURLY_FIXED) {
    expiry = isoDate(startOfToday()) + "T" + (expRaw || "00:00");
  }

  $("saveMsg").textContent = "Saving...";

  const res = await fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      store,
      staff,
      item_id: currentItem.id,
      quantity: qty,
      expiry
    })
  });

  $("saveMsg").textContent = res.ok ? "Saved ✅" : "Error ❌";

  $("itemForm")?.classList.add("hidden");
  await loadAlerts();
  showHome();
}

// ---------- Session ----------
function startSession() {
  const st = $("sessionStore").value;
  const sh = $("sessionShift").value;
  const sf = $("sessionStaff").value.trim();

  if (!st || !sh || !sf) {
    $("sessionMsg").textContent = "Please choose store, shift, and enter staff.";
    return;
  }

  session = { store: st, shift: sh, staff: sf };

  $("store").value = st;
  $("staff").value = sf;
  $("sessionInfo").textContent = `${st} • ${sh} • ${sf}`;

  $("sessionScreen")?.classList.add("hidden");
  $("appShell")?.classList.remove("hidden");

  renderCategories();
  showHome();
  loadAlerts();
}

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", async () => {
  // IMPORTANT: /api/items must return your real items (no dummy)
  const res = await fetch("/api/items");
  const data = await res.json();

  allItems = (data || []).map(x => ({
    id: x.id,
    name: x.name,
    category: x.category,
    sub_category: x.sub_category || "",
    shelf_life_days: x.shelf_life_days ?? 0,
  }));

  // Bind UI (NO inline onclick needed)
  on("btnStartSession", "click", startSession);
  on("btnBack", "click", showHome);
  on("btnCloseItem", "click", showHome);
  on("btnSave", "click", saveLog);

  on("btnAlerts", "click", async () => {
    await loadAlerts();
    hideAll();
    $("alertsView")?.classList.remove("hidden");
  });

  on("btnCloseAlerts", "click", showHome);

  on("store", "change", () => {
    session.store = $("store").value;
    $("sessionInfo").textContent = `${session.store} • ${session.shift} • ${session.staff}`;
    renderCategories();
    loadAlerts();
    showHome();
  });

  // Start at session screen
  $("sessionScreen")?.classList.remove("hidden");
  $("appShell")?.classList.add("hidden");
});
