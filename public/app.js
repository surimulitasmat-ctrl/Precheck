document.addEventListener("DOMContentLoaded", () => {
  // ---------- Elements ----------
  const topBarEl = document.getElementById("topBar");

  // session
  const sessionScreenEl = document.getElementById("sessionScreen");
  const sessionStoreEl = document.getElementById("sessionStore");
  const sessionShiftEl = document.getElementById("sessionShift");
  const sessionStaffEl = document.getElementById("sessionStaff");
  const btnStartSession = document.getElementById("btnStartSession");
  const sessionMsgEl = document.getElementById("sessionMsg");

  // main home
  const homeScreenEl = document.getElementById("homeScreen");
  const storeEl = document.getElementById("store");
  const staffEl = document.getElementById("staff");
  const sessionInfoEl = document.getElementById("sessionInfo");
  const btnOpenAlerts = document.getElementById("btnOpenAlerts");

  // categories
  const homeEl = document.getElementById("home");
  const categoryGridEl = document.getElementById("categoryGrid");

  // category view
  const categoryViewEl = document.getElementById("categoryView");
  const catTitleEl = document.getElementById("catTitle");
  const catSubEl = document.getElementById("catSub");
  const itemListEl = document.getElementById("itemList");
  const btnBack = document.getElementById("btnBack");

  // item form
  const itemFormEl = document.getElementById("itemForm");
  const itemTitleEl = document.getElementById("itemTitle");
  const itemMetaEl = document.getElementById("itemMeta");
  const qtyEl = document.getElementById("qty");
  const expiryEl = document.getElementById("expiry");
  const btnSave = document.getElementById("btnSave");
  const btnCloseItem = document.getElementById("btnCloseItem");
  const saveMsgEl = document.getElementById("saveMsg");

  // alerts page
  const alertsScreenEl = document.getElementById("alertsScreen");
  const btnBackFromAlerts = document.getElementById("btnBackFromAlerts");
  const expiryListEl = document.getElementById("expiryList");
  const lowStockListEl = document.getElementById("lowStockList");

  // ---------- State ----------
  let allItems = [];
  let categories = [];
  let currentCategory = null;
  let currentItem = null;

  // ---------- Session helpers ----------
  function todayKeyLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function resetIfNewDay() {
    const key = todayKeyLocal();
    const last = localStorage.getItem("precheck_session_day");
    if (last !== key) {
      // new day -> clear session
      localStorage.removeItem("precheck_store");
      localStorage.removeItem("precheck_shift");
      localStorage.removeItem("precheck_staff");
      localStorage.removeItem("precheck_popup_done");
      localStorage.setItem("precheck_session_day", key);
    }
  }

  function getSession() {
    return {
      store: localStorage.getItem("precheck_store") || "",
      shift: localStorage.getItem("precheck_shift") || "",
      staff: localStorage.getItem("precheck_staff") || "",
    };
  }

  function setSession({ store, shift, staff }) {
    localStorage.setItem("precheck_store", store);
    localStorage.setItem("precheck_shift", shift);
    localStorage.setItem("precheck_staff", staff);
  }

  // ---------- UI show/hide ----------
  function hideAllScreens() {
    sessionScreenEl.classList.add("hidden");
    homeScreenEl.classList.add("hidden");
    homeEl.classList.add("hidden");
    categoryViewEl.classList.add("hidden");
    itemFormEl.classList.add("hidden");
    alertsScreenEl.classList.add("hidden");
  }

  function showSessionScreen() {
    hideAllScreens();
    sessionScreenEl.classList.remove("hidden");
    topBarEl.textContent = "PreCheck";
  }

  function showHome() {
    hideAllScreens();
    homeScreenEl.classList.remove("hidden");
    homeEl.classList.remove("hidden");
    topBarEl.textContent = "PreCheck";
  }

  function showCategory(cat) {
    currentCategory = cat;
    catTitleEl.textContent = cat;
    catSubEl.textContent = "Tap item to update";

    hideAllScreens();
    homeScreenEl.classList.remove("hidden");
    categoryViewEl.classList.remove("hidden");
    topBarEl.textContent = cat;

    renderItemList(cat);
  }

  function showItemForm(item) {
    currentItem = item;
    itemTitleEl.textContent = item.name;
    itemMetaEl.textContent = item.category;

    qtyEl.value = "";
    saveMsgEl.textContent = "";

    buildExpiryDropdown(item);

    hideAllScreens();
    homeScreenEl.classList.remove("hidden");
    itemFormEl.classList.remove("hidden");
    topBarEl.textContent = item.name;
  }

  function showAlerts() {
    hideAllScreens();
    homeScreenEl.classList.remove("hidden");
    alertsScreenEl.classList.remove("hidden");
    topBarEl.textContent = "Alerts";
  }

  // ---------- Date helpers ----------
  function formatFullDate(dateObj) {
    return dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  function isoDateLocal(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function buildExpiryDropdown(item) {
    expiryEl.innerHTML = "";

    // item.shelf_life_days must come from /api/items
    const shelfDays = Number(item.shelf_life_days || 0);
    const today = new Date();

    for (let i = 0; i <= shelfDays; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      const opt = document.createElement("option");
      opt.value = isoDateLocal(d);         // stored to DB
      opt.textContent = formatFullDate(d); // shown to staff
      expiryEl.appendChild(opt);
    }
  }

  // ---------- Render ----------
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

    const list = allItems.filter((x) => x.category === cat);
    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "No items in this category";
      li.style.cursor = "default";
      itemListEl.appendChild(li);
      return;
    }

    list.forEach((it) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${it.name}</span>
        <span class="pill">Update</span>
      `;
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

    list.forEach((x) => {
      const li = document.createElement("li");

      const d = new Date(x.expiry);
      const niceDate = formatFullDate(d);

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

    list.forEach((x) => {
      const li = document.createElement("li");
      li.textContent = `${x.name} — Qty ${x.quantity} (${x.category})`;
      lowStockListEl.appendChild(li);
    });
  }

  // ---------- API ----------
  async function loadItems() {
    const res = await fetch("/api/items");
    allItems = await res.json();

    categories = [...new Set(allItems.map((x) => x.category))];
    renderCategoryTiles();
  }

  async function loadAlerts() {
    const store = storeEl.value;
    const res = await fetch(`/api/expiry?store=${encodeURIComponent(store)}`);
    const data = await res.json();

    // expiry list (today/expired)
    renderExpiryList(data);

    // low stock (<= 2) excluding sauce/sauces
    const lowStock = data.filter((x) => {
      const qty = Number(x.quantity);
      const cat = String(x.category || "").toLowerCase();
      const isSauce = cat === "sauce" || cat === "sauces";
      return qty <= 2 && !isSauce;
    });

    renderLowStock(lowStock);
  }

  async function saveLog() {
    const session = getSession();
    if (!session.staff) {
      alert("Session missing. Please start session again.");
      showSessionScreen();
      return;
    }
    if (!currentItem) return;

    const quantity = qtyEl.value;
    const expiry = expiryEl.value;

    if (!quantity) {
      alert("Enter quantity");
      return;
    }
    if (!expiry) {
      alert("Select expiry date");
      return;
    }

    saveMsgEl.textContent = "Saving...";

    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store: session.store,
        staff: session.staff,
        shift: session.shift,
        item_id: currentItem.id,
        quantity,
        expiry,
      }),
    });

    saveMsgEl.textContent = res.ok ? "Saved ✅" : "Error ❌";
    if (res.ok) {
      // go back to category page for faster workflow
      showCategory(currentCategory);
      await loadAlerts();
    }
  }

  // ---------- Popups ----------
  function showCheckPopupOncePerSession() {
    const done = localStorage.getItem("precheck_popup_done");
    if (done) return;

    // both morning + afternoon (as requested)
    const msg =
      "PLEASE Check expired date:\n" +
      "- chicken bacon\n" +
      "- avocado\n" +
      "- lettuce\n" +
      "- flatbread";

    alert(msg);
    localStorage.setItem("precheck_popup_done", "1");
  }

  // ---------- Events ----------
  btnStartSession.onclick = async () => {
    const store = sessionStoreEl.value;
    const shift = sessionShiftEl.value;
    const staff = sessionStaffEl.value.trim();

    if (!store || !shift || !staff) {
      sessionMsgEl.textContent = "Please select store + shift and enter staff.";
      return;
    }

    setSession({ store, shift, staff });

    // sync into main UI
    storeEl.value = store;
    staffEl.value = staff;
    sessionInfoEl.textContent = `Store: ${store} • Shift: ${shift}`;

    showHome();
    await loadItems();
    await loadAlerts();
    showCheckPopupOncePerSession();
  };

  btnBack.onclick = () => showHome();
  btnCloseItem.onclick = () => showCategory(currentCategory);

  btnSave.onclick = saveLog;

  btnOpenAlerts.onclick = async () => {
    showAlerts();
    await loadAlerts();
  };

  btnBackFromAlerts.onclick = () => showHome();

  // ---------- Init ----------
  resetIfNewDay();

  const session = getSession();
  if (!session.store || !session.shift || !session.staff) {
    showSessionScreen();
  } else {
    // restore session
    storeEl.value = session.store;
    staffEl.value = session.staff;
    sessionInfoEl.textContent = `Store: ${session.store} • Shift: ${session.shift}`;

    showHome();

    loadItems()
      .then(loadAlerts)
      .then(() => showCheckPopupOncePerSession())
      .catch(() => {
        // if something fails, still show UI
      });
  }
});
