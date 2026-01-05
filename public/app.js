// ===============================
// PreCheck - PHASE 1 (RULE-CORRECT)
// ===============================

const $ = id => document.getElementById(id);

// ---------- CONSTANTS ----------
const FIXED_HOURLY_TIMES = [
  "11:00",
  "15:00",
  "19:00",
  "23:00"
];

// ---------- STATE ----------
let allItems = [];
let currentItem = null;

// ---------- DATE HELPERS ----------
function todayISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

function formatDate(d) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

// ---------- EXPIRY MODE RESOLUTION ----------
function resolveExpiryMode(item, store) {

  // Beef Taco (H) — SKH only, HOURLY
  if (item.name === "Beef Taco (H)" && store === "SKH") {
    return "HOURLY";
  }

  // Chicken Bacon — EOD
  if (item.name === "Chicken Bacon") {
    return "EOD";
  }

  // Shelf life > 7 → MANUAL
  if (Number(item.shelf_life_days) > 7) {
    return "MANUAL";
  }

  // Vegetables → AUTO
  if (item.category === "Vegetables") {
    return "AUTO";
  }

  // Cajun Spice Open Inner → AUTO 5 days
  if (item.name === "Cajun Spice Open Inner") {
    return "AUTO";
  }

  // Explicit MANUAL items
  const MANUAL_ITEMS = [
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
    "Tea Bag"
  ];

  if (MANUAL_ITEMS.includes(item.name)) {
    return "MANUAL";
  }

  // Default
  return "AUTO";
}

// ---------- LOAD ITEMS (PHASE 1: EMBEDDED OR EXISTING SOURCE) ----------
async function loadItems() {
  // PHASE 1 assumes you already load items earlier in your file
  // If you already have allItems populated, do nothing
  if (allItems.length) return;
}

// ---------- RENDER ITEM LIST ----------
function renderItems(category) {
  const ul = $("itemList");
  ul.innerHTML = "";

  const store = $("store").value;

  allItems
    .filter(i => i.category === category)
    .filter(i => {
      if (i.name === "Beef Taco (H)") return store === "SKH";
      return true;
    })
    .forEach(item => {
      const li = document.createElement("li");
      li.textContent = item.name;
      li.onclick = () => openItem(item);
      ul.appendChild(li);
    });
}

// ---------- OPEN ITEM ----------
function openItem(item) {
  currentItem = item;

  $("itemTitle").textContent = item.name;
  $("itemMeta").textContent = item.category;
  $("qty").value = "";
  $("saveMsg").textContent = "";

  const expiryContainer = $("expiry").parentElement;
  expiryContainer.innerHTML = `
    <label>Expiry</label>
    <div id="expiryWrap"></div>
  `;

  const mode = resolveExpiryMode(item, $("store").value);
  buildExpiryInput(item, mode);
  $("itemForm").classList.remove("hidden");
}

// ---------- BUILD EXPIRY INPUT ----------
function buildExpiryInput(item, mode) {
  const wrap = $("expiryWrap");

  // ---------- AUTO ----------
  if (mode === "AUTO") {
    const select = document.createElement("select");
    select.id = "expiry";
    select.innerHTML = `<option value="">Select expiry date</option>`;

    let shelf = Number(item.shelf_life_days || 0);

    // Vegetable overrides
    if (item.category === "Vegetables") {
      shelf = item.name === "Mix Green Packet" ? 1 : 2;
    }

    // Cajun override
    if (item.name === "Cajun Spice Open Inner") {
      shelf = 5;
    }

    for (let i = 0; i <= shelf; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);

      const opt = document.createElement("option");
      opt.value = d.toISOString().slice(0,10);
      opt.textContent = formatDate(d);
      select.appendChild(opt);
    }

    wrap.appendChild(select);
    return;
  }

  // ---------- MANUAL ----------
  if (mode === "MANUAL") {
    const input = document.createElement("input");
    input.type = "datetime-local";
    input.id = "expiry";
    wrap.appendChild(input);
    return;
  }

  // ---------- EOD ----------
  if (mode === "EOD") {
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.id = "expiry";
    hidden.value = todayISO() + "T23:59";

    const label = document.createElement("div");
    label.textContent = "Expires End of Day";
    label.className = "mini";

    wrap.appendChild(label);
    wrap.appendChild(hidden);
    return;
  }

  // ---------- HOURLY / HOURLY_FIXED ----------
  if (mode === "HOURLY" || mode === "HOURLY_FIXED") {
    const select = document.createElement("select");
    select.id = "expiry";

    FIXED_HOURLY_TIMES.forEach(t => {
      const opt = document.createElement("option");
      opt.value = todayISO() + "T" + t;
      opt.textContent = t;
      select.appendChild(opt);
    });

    wrap.appendChild(select);
    return;
  }
}

// ---------- SAVE ----------
async function saveItem() {
  const qty = $("qty").value;
  const expiry = $("expiry")?.value;
  const store = $("store").value;

  if (!qty) {
    alert("Enter quantity");
    return;
  }

  const mode = resolveExpiryMode(currentItem, store);

  if (mode === "AUTO" && !expiry) {
    alert("Please select expiry date");
    return;
  }

  await fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store,
      staff: $("staff").value,
      item_id: currentItem.id,
      quantity: qty,
      expiry
    })
  });

  $("itemForm").classList.add("hidden");
}

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", async () => {
  await loadItems();
  $("btnSave").onclick = saveItem;
});
