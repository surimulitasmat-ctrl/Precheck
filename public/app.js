// ===============================
// PreCheck - app.js (ERROR-SAFE)
// ===============================

const $ = (id) => document.getElementById(id);

// ---------- Safe bind helper ----------
function bind(id, event, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener(event, fn);
}

// ---------- Helpers ----------
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
    year: "numeric"
  });
}

// ---------- Expiry modes ----------
const MODE = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
  EOD: "EOD",
  HOURLY: "HOURLY",
  HOURLY_FIXED: "HOURLY_FIXED"
};

// ---------- State ----------
let allItems = [];
let currentItem = null;
let session = { store:"", shift:"", staff:"" };

// ---------- Mode rules ----------
function resolveExpiryMode(item, store) {
  if (item.name === "Beef Taco (H)" && store === "SKH") return MODE.HOURLY;
  if (item.name === "Chicken Bacon") return MODE.EOD;
  if (Number(item.shelf_life_days) > 7) return MODE.MANUAL;
  if (item.category === "Vegetables") return MODE.AUTO;
  if (item.name === "Cajun Spice Open Inner") return MODE.AUTO;

  const MANUAL = [
    "Canola Oil","Salt","Pepper","Cookies","Olive Oil","Milo","Tea Bag",
    "Salt Open Inner","Pepper Open Inner","Olive Open Bottle",
    "Parmesan Oregano","Shallot","Honey Oat",
    "Parmesan Open Inner","Shallot Open Inner","Honey Oat Open Inner",
    "Cajun Spice Packet"
  ];
  if (MANUAL.includes(item.name)) return MODE.MANUAL;

  return MODE.AUTO;
}

function resolveShelfLife(item) {
  if (item.category === "Vegetables") {
    return item.name === "Mix Green Packet" ? 1 : 2;
  }
  if (item.name === "Cajun Spice Open Inner") return 5;
  return Number(item.shelf_life_days || 0);
}

// ---------- UI ----------
function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}
function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}
function hideAll() {
  ["home","categoryView","itemForm","alertsView"].forEach(hide);
}

// ---------- Expiry UI ----------
function buildExpiryUI(item) {
  const wrap = $("expiry")?.parentElement;
  if (!wrap) return;

  wrap.innerHTML = `<label>Expiry</label><div id="expiryWrap"></div><div class="mini" id="expiryHelp"></div>`;
  const holder = $("expiryWrap");

  const mode = resolveExpiryMode(item, session.store);
  const help = $("expiryHelp");

  if (mode === MODE.AUTO) {
    const sel = document.createElement("select");
    sel.id = "expiry";
    sel.innerHTML = `<option value="">Select expiry date</option>`;
    const n = resolveShelfLife(item);
    for (let i=0;i<=n;i++) {
      const d = startOfToday();
      d.setDate(d.getDate()+i);
      const opt = document.createElement("option");
      opt.value = isoDate(d);
      opt.textContent = formatFullDate(d);
      sel.appendChild(opt);
    }
    holder.appendChild(sel);
    help.textContent = `Select expiry date (Today + ${n} day${n!==1?"s":""})`;
    return;
  }

  if (mode === MODE.MANUAL) {
    holder.innerHTML = `<input id="expiry" type="datetime-local">`;
    help.textContent = "Select expiry date & time";
    return;
  }

  if (mode === MODE.EOD) {
    holder.innerHTML = `<div class="mini">End of Day (23:59)</div><input id="expiry" type="hidden" value="${isoDate(startOfToday())}T23:59">`;
    help.textContent = "Expiry set automatically";
    return;
  }

  if (mode === MODE.HOURLY) {
    const sel = document.createElement("select");
    sel.id = "expiry";
    for (let h=0;h<24;h++) {
      for (let m of [0,30]) {
        const t = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
      }
    }
    holder.appendChild(sel);
    help.textContent = "Select expiry time (past allowed)";
  }
}

// ---------- Save ----------
async function saveLog() {
  if (!currentItem) return;

  const qty = $("qty")?.value;
  const exp = $("expiry")?.value;

  if (!qty) return alert("Enter quantity");

  const mode = resolveExpiryMode(currentItem, session.store);
  if (mode === MODE.AUTO && !exp) return alert("Select expiry date");

  let expiry = exp;
  if (mode === MODE.HOURLY) expiry = isoDate(startOfToday())+"T"+exp;

  await fetch("/api/log", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      store: session.store,
      staff: session.staff,
      item_id: currentItem.id,
      quantity: qty,
      expiry
    })
  });

  hide("itemForm");
  show("home");
}

// ---------- Session ----------
function startSession() {
  session.store = $("sessionStore").value;
  session.shift = $("sessionShift").value;
  session.staff = $("sessionStaff").value.trim();
  if (!session.store || !session.shift || !session.staff) return;

  $("store").value = session.store;
  $("staff").value = session.staff;
  $("sessionInfo").textContent = `${session.store} • ${session.shift} • ${session.staff}`;

  hide("sessionScreen");
  show("appShell");
  show("home");
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  // load items
  const res = await fetch("/api/items");
  allItems = await res.json();

  bind("btnStartSession","click", startSession);
  bind("btnSave","click", saveLog);
  bind("btnBack","click", ()=>show("home"));
  bind("btnCloseItem","click", ()=>show("home"));
});
