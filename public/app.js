(() => {
  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);

  function pad2(n) { return String(n).padStart(2, "0"); }

  // Format like "24 May 2026"
  function formatDateLong(d) {
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function toYMD(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function clampStr(x) {
    return String(x ?? "").trim();
  }

  function normCategory(cat) {
    const c = clampStr(cat).toLowerCase();
    if (c === "sauce" || c === "sauces") return "Sauce";
    // keep title case for others
    return clampStr(cat);
  }

  function isSauceCategory(cat) {
    return normCategory(cat) === "Sauce";
  }

  // -----------------------------
  // Elements
  // -----------------------------
  const sessionScreen = $("sessionScreen");
  const appShell = $("appShell");

  const sessionStoreEl = $("sessionStore");
  const sessionShiftEl = $("sessionShift");
  const sessionStaffEl = $("sessionStaff");
  const btnStartSession = $("btnStartSession");
  const sessionMsgEl = $("sessionMsg");

  const storeEl = $("store");
  const staffEl = $("staff");
  const sessionInfoEl = $("sessionInfo");
  const btnAlerts = $("btnAlerts");

  const homeEl = $("home");
  const categoryGridEl = $("categoryGrid");

  const sauceSubViewEl = $("sauceSubView");
  const sauceSubGridEl = $("sauceSubGrid");
  const btnBackFromSauce = $("btnBackFromSauce");

  const categoryViewEl = $("categoryView");
  const catTitleEl = $("catTitle");
  const itemListEl = $("itemList");
  const btnBack = $("btnBack");

  const itemFormEl = $("itemForm");
  const itemTitleEl = $("itemTitle");
  const itemMetaEl = $("itemMeta");
  const qtyEl = $("qty");
  const btnCloseItem = $("btnCloseItem");
  const btnSave = $("btnSave");
  const saveMsgEl = $("saveMsg");

  const expiryFieldEl = $("expiryField");
  const expiryLabelEl = $("expiryLabel");
  const expirySelectEl = $("expirySelect");
  const expiryManualEl = $("expiryManual");
  const expiryEodEl = $("expiryEod");
  const helperTextEl = $("helperText");

  const alertsViewEl = $("alertsView");
  const btnCloseAlerts = $("btnCloseAlerts");
  const expiryListEl = $("expiryList");
  const lowStockListEl = $("lowStockList");

  // -----------------------------
  // State
  // -----------------------------
  let allItems = [];
  let currentCategory = null;
  let currentSauceSub = null;
  let currentItem = null;

  // session (saved)
  let currentStore = "";
  let currentShift = "";
  let currentStaff = "";

  // -----------------------------
  // Your FINAL rules (auto-calculated)
  // -----------------------------

  // Items that MUST be MANUAL even if shelf_life_days is small/0
  const FORCE_MANUAL_BY_NAME = new Set([
    "Canola Oil",
    "Salt Open Inner",
    "Pepper Open Inner",
    "Olive Open Bottle",
    "Cajun Spice Packet",
    "Cajun Spice Open Inner",
    "Parmesan Oregano",
    "Shallot",
    "Honey Oat",
    "Parmesan Open Inner",
    "Shallot Open Inner",
    "Honey Oat Open Inner",
    "Salt",
    "Pepper",
    "Cookies",
    "Olive Oil",
    "Milo",
    "Tea Bag",
    "Tuna Packet",
    "Milk",
    "Corn",
    "Ceddar Cheese",
    "Jalapeños Cheese",
  ].map(x => x.toLowerCase()));

  // Items that are EOD
  const FORCE_EOD_BY_NAME = new Set([
    "Chicken Bacon"
  ].map(x => x.toLowerCase()));

  // Items that are HOURLY_FIXED (11am/3pm/7pm/11pm)
  const FORCE_HOURLY_FIXED_BY_NAME = new Set([
    "Bread",
    "Tomato Soup (H)",
    "Mushroom Soup (H)"
  ].map(x => x.toLowerCase()));

  // SKH-only HOURLY item
  const BEEF_TACO_NAME = "Beef Taco (H)";

  const HOURLY_FIXED_TIMES = [
    { label: "11:00 AM", value: "11:00" },
    { label: "3:00 PM",  value: "15:00" },
    { label: "7:00 PM",  value: "19:00" },
    { label: "11:00 PM", value: "23:00" },
  ];

  function computeExpiryMode(item) {
    const name = clampStr(item.name);
    const nameKey = name.toLowerCase();
    const category = normCategory(item.category);

    // SKH-only Beef Taco (H)
    if (name === BEEF_TACO_NAME) return "HOURLY";

    // Unopened chiller always manual
    if (clampStr(category).toLowerCase() === "unopened chiller") return "MANUAL";

    // EOD overrides
    if (FORCE_EOD_BY_NAME.has(nameKey)) return "EOD";

    // Hourly fixed overrides
    if (FORCE_HOURLY_FIXED_BY_NAME.has(nameKey)) return "HOURLY_FIXED";

    // Forced manual by name list
    if (FORCE_MANUAL_BY_NAME.has(nameKey)) return "MANUAL";

    // Shelf life rule
    const days = Number(item.shelf_life_days ?? 0);
    if (Number.isFinite(days) && days > 7) return "MANUAL";

    // Default
    return "AUTO";
  }

  // Sauce 2-level navigation
  function getSauceSubcategory(item) {
    const sc = clampStr(item.sub_category);
    if (!sc) return "Sandwich Unit";
    return sc;
  }

  // -----------------------------
  // Screens
  // -----------------------------
  function hideAllScreens() {
    homeEl.classList.add("hidden");
    sauceSubViewEl.classList.add("hidden");
    categoryViewEl.classList.add("hidden");
    itemFormEl.classList.add("hidden");
    alertsViewEl.classList.add("hidden");
  }

  function showSessionScreen() {
    sessionScreen.classList.remove("hidden");
    appShell.classList.add("hidden");
  }

  function showAppShell() {
    sessionScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
  }

  function showHome() {
    hideAllScreens();
    homeEl.classList.remove("hidden");
    currentCategory = null;
    currentSauceSub = null;
  }

  function showSauceSubcategories() {
    hideAllScreens();
    sauceSubViewEl.classList.remove("hidden");

    const items = visibleItemsForStore();
    const sauceItems = items.filter(x => isSauceCategory(x.category));
    const subs = [...new Set(sauceItems.map(getSauceSubcategory))];

    sauceSubGridEl.innerHTML = "";
    subs.forEach(sub => {
      const btn = document.createElement("button");
      btn.className = "tile";
      const count = sauceItems.filter(x => getSauceSubcategory(x) === sub).length;
      btn.innerHTML = `<div class="title">${sub}</div><div class="sub">${count} items</div>`;
      btn.onclick = () => showCategory("Sauce", sub);
      sauceSubGridEl.appendChild(btn);
    });
  }

  function showCategory(cat, sauceSub = null) {
    currentCategory = cat;
    currentSauceSub = sauceSub;

    hideAllScreens();
    categoryViewEl.classList.remove("hidden");

    if (cat === "Sauce" && sauceSub) {
      catTitleEl.textContent = `Sauce • ${sauceSub}`;
    } else {
      catTitleEl.textContent = cat;
    }

    renderItemList();
  }

  function showItemForm(item) {
    currentItem = item;
    const mode = computeExpiryMode(item);

    itemTitleEl.textContent = item.name;
    itemMetaEl.textContent = `${normCategory(item.category)}${item.sub_category ? " • " + item.sub_category : ""}`;

    qtyEl.value = "";
    saveMsgEl.textContent = "";

    // reset expiry UI
    expirySelectEl.innerHTML = "";
    expirySelectEl.classList.add("hidden");
    expiryManualEl.classList.add("hidden");
    expiryEodEl.classList.add("hidden");
    helperTextEl.textContent = "";

    if (mode === "AUTO") {
      expiryLabelEl.textContent = "Expiry Date";
      expirySelectEl.classList.remove("hidden");

      const days = Number(item.shelf_life_days ?? 0);
      const n = Number.isFinite(days) ? Math.max(0, days) : 0;

      // Dropdown MUST include today + next N days => N+1 options
      const today = new Date();
      for (let i = 0; i <= n; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);

        const opt = document.createElement("option");
        opt.value = toYMD(d);                // store Y-M-D
        opt.textContent = formatDateLong(d); // show "24 May 2026"
        expirySelectEl.appendChild(opt);
      }

      // Block save if not selected: we force a placeholder option
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select expiry date";
      placeholder.selected = true;
      placeholder.disabled = true;
      expirySelectEl.insertBefore(placeholder, expirySelectEl.firstChild);

      helperTextEl.textContent = "Select the correct expiry date from the list (includes today).";
    }

    if (mode === "MANUAL") {
      expiryLabelEl.textContent = "Expiry Date/Time";
      expiryManualEl.classList.remove("hidden");
      expiryManualEl.value = "";
      helperTextEl.textContent = "Select any date/time (manual).";
    }

    if (mode === "EOD") {
      expiryLabelEl.textContent = "Expiry";
      expiryEodEl.classList.remove("hidden");
      helperTextEl.textContent = "No selection needed. Expiry will be end of day (23:59).";
    }

    if (mode === "HOURLY") {
      expiryLabelEl.textContent = "Expiry Time";
      expirySelectEl.classList.remove("hidden");

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select expiry time";
      placeholder.selected = true;
      placeholder.disabled = true;
      expirySelectEl.appendChild(placeholder);

      // Hourly dropdown (00:00 to 23:00). Past times allowed.
      for (let h = 0; h < 24; h++) {
        const v = `${pad2(h)}:00`;
        const label = new Date(2000, 0, 1, h, 0).toLocaleTimeString("en-GB", {
          hour: "numeric",
          minute: "2-digit"
        });
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = label;
        expirySelectEl.appendChild(opt);
      }

      helperTextEl.textContent = "Select an expiry time (past time is allowed).";
    }

    if (mode === "HOURLY_FIXED") {
      expiryLabelEl.textContent = "Expiry Time";
      expirySelectEl.classList.remove("hidden");

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select expiry time";
      placeholder.selected = true;
      placeholder.disabled = true;
      expirySelectEl.appendChild(placeholder);

      HOURLY_FIXED_TIMES.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.value;
        opt.textContent = t.label;
        expirySelectEl.appendChild(opt);
      });

      helperTextEl.textContent = "Select one fixed expiry time (past time is allowed).";
    }

    hideAllScreens();
    itemFormEl.classList.remove("hidden");
  }

  function hideItemForm() {
    itemFormEl.classList.add("hidden");
  }

  function showAlerts() {
    hideAllScreens();
    alertsViewEl.classList.remove("hidden");
  }

  // -----------------------------
  // Data + Rendering
  // -----------------------------
  function visibleItemsForStore() {
    const store = clampStr(currentStore || storeEl.value);

    return allItems
      .filter(it => {
        // SKH-only rule for Beef Taco (H)
        if (clampStr(it.name) === BEEF_TACO_NAME) return store === "SKH";
        return true;
      })
      .map(it => ({
        ...it,
        category: normCategory(it.category),
      }));
  }

  function renderCategoryTiles() {
    const items = visibleItemsForStore();

    // Build categories from DB, but merge Sauce/Sauces -> Sauce
    const cats = [...new Set(items.map(x => normCategory(x.category)))];

    categoryGridEl.innerHTML = "";

    // keep a nice order if possible
    const preferredOrder = [
      "Prepared items",
      "Unopened chiller",
      "Thawing",
      "Vegetables",
      "Backroom",
      "Back counter",
      "Front counter",
      "Back counter chiller",
      "Sauce",
    ];

    const sortedCats = preferredOrder.filter(c => cats.includes(c)).concat(
      cats.filter(c => !preferredOrder.includes(c))
    );

    sortedCats.forEach(cat => {
      const count = items.filter(x => normCategory(x.category) === cat && (!isSauceCategory(cat) || true)).length;

      const btn = document.createElement("button");
      btn.className = "tile";

      btn.innerHTML = `
        <div class="title">${cat}</div>
        <div class="sub">${count} items</div>
      `;

      btn.onclick = () => {
        if (cat === "Sauce") {
          showSauceSubcategories();
        } else {
          showCategory(cat);
        }
      };

      categoryGridEl.appendChild(btn);
    });
  }

  function renderItemList() {
    const items = visibleItemsForStore();

    itemListEl.innerHTML = "";

    let list = items.filter(x => normCategory(x.category) === currentCategory);

    // Sauce sub category filter
    if (currentCategory === "Sauce" && currentSauceSub) {
      list = list.filter(x => getSauceSubcategory(x) === currentSauceSub);
    }

    // Sort by name
    list.sort((a, b) => clampStr(a.name).localeCompare(clampStr(b.name)));

    list.forEach(it => {
      const li = document.createElement("li");
      li.textContent = it.name; // staff sees ONLY sauce name (no standby/open inner in name)
      li.onclick = () => showItemForm(it);
      itemListEl.appendChild(li);
    });

    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "No items in this category.";
      itemListEl.appendChild(li);
    }
  }

  // -----------------------------
  // Alerts (expiry + low stock)
  // -----------------------------
  async function loadAlertsData() {
    const store = clampStr(currentStore || storeEl.value);

    // Expiry list
    try {
      const res = await fetch(`/api/expiry?store=${encodeURIComponent(store)}`);
      const data = await res.json();

      expiryListEl.innerHTML = "";
      if (!Array.isArray(data) || !data.length) {
        expiryListEl.innerHTML = "<li>No expiring items ✅</li>";
      } else {
        data.forEach(x => {
          const li = document.createElement("li");
          const d = x.expiry ? new Date(x.expiry) : null;
          const nice = d && !isNaN(d) ? formatDateLong(d) : "(no expiry)";
          li.textContent = `${x.name} — Qty ${x.quantity ?? ""} — Exp ${nice}`;
          expiryListEl.appendChild(li);
        });
      }
    } catch (e) {
      expiryListEl.innerHTML = "<li>Could not load expiry list.</li>";
    }

    // Low stock (try endpoint; fallback message)
    lowStockListEl.innerHTML = "<li>Loading...</li>";
    try {
      const res = await fetch(`/api/low_stock?store=${encodeURIComponent(store)}`);
      if (!res.ok) throw new Error("no endpoint");
      const low = await res.json();

      lowStockListEl.innerHTML = "";
      const filtered = (Array.isArray(low) ? low : []).filter(x => {
        const c = String(x.category || "").toLowerCase();
        return c !== "sauce" && c !== "sauces";
      });

      if (!filtered.length) {
        lowStockListEl.innerHTML = "<li>No low stock items ✅</li>";
      } else {
        filtered.forEach(x => {
          const li = document.createElement("li");
          li.textContent = `${x.name} — Qty ${x.quantity} (${x.category})`;
          lowStockListEl.appendChild(li);
        });
      }
    } catch (e) {
      lowStockListEl.innerHTML = "<li>Low stock endpoint not enabled yet.</li>";
    }
  }

  // -----------------------------
  // API
  // -----------------------------
  async function loadItems() {
    const res = await fetch("/api/items");
    const data = await res.json();

    // Expect real DB rows with: id,name,category,shelf_life_days,sub_category
    allItems = Array.isArray(data) ? data : [];

    renderCategoryTiles();
  }

  function getExpiryPayloadForSave(item) {
    const mode = computeExpiryMode(item);

    if (mode === "AUTO") {
      const v = clampStr(expirySelectEl.value);
      if (!v) return { error: "Please select expiry date." };

      // store end-of-day for selected date
      const [y, m, d] = v.split("-").map(Number);
      const dt = new Date(y, (m - 1), d, 23, 59, 0, 0);
      return { expiry_iso: dt.toISOString() };
    }

    if (mode === "MANUAL") {
      const v = clampStr(expiryManualEl.value);
      if (!v) return { error: "Please select expiry date/time." };

      // datetime-local gives "YYYY-MM-DDTHH:mm"
      const dt = new Date(v);
      if (isNaN(dt)) return { error: "Invalid date/time." };
      return { expiry_iso: dt.toISOString() };
    }

    if (mode === "EOD") {
      const now = new Date();
      let dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0);
      // if already past today 23:59, set next day 23:59
      if (now > dt) {
        dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 0, 0);
      }
      return { expiry_iso: dt.toISOString() };
    }

    if (mode === "HOURLY" || mode === "HOURLY_FIXED") {
      const v = clampStr(expirySelectEl.value);
      if (!v) return { error: "Please select expiry time." };

      const [hh, mm] = v.split(":").map(Number);
      const now = new Date();
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm || 0, 0, 0);
      // past time is ALLOWED (no blocking)
      return { expiry_iso: dt.toISOString() };
    }

    return { error: "Unknown expiry mode." };
  }

  async function saveLog() {
    if (!currentItem) return;

    const staff = clampStr(staffEl.value);
    if (!staff) {
      alert("Please enter staff ID & name");
      staffEl.focus();
      return;
    }

    const store = clampStr(storeEl.value);
    const shift = clampStr(currentShift);
    const quantityRaw = clampStr(qtyEl.value);

    // qty optional, blank allowed, 0 allowed
    const quantity = quantityRaw === "" ? null : Number(quantityRaw);

    const expiryRes = getExpiryPayloadForSave(currentItem);
    if (expiryRes.error) {
      alert(expiryRes.error);
      return;
    }

    // confirmation popup (simple + effective)
    const ok = confirm("Please confirm you checked correctly.\n\nTap OK to Save.");
    if (!ok) return;

    saveMsgEl.textContent = "Saving...";

    const body = {
      store,
      staff,
      shift,
      item_id: currentItem.id,
      quantity,
      expiry: expiryRes.expiry_iso
    };

    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      saveMsgEl.textContent = "Saved ✅";
      hideItemForm();
      // refresh alerts (optional)
      loadAlertsData();
      // go back to list
      if (currentCategory) showCategory(currentCategory, currentSauceSub);
      else showHome();
    } else {
      saveMsgEl.textContent = "Error ❌";
      const t = await res.text().catch(() => "");
      console.error("Save error:", t);
    }
  }

  // -----------------------------
  // Session
  // -----------------------------
  function startSession() {
    const store = clampStr(sessionStoreEl.value);
    const shift = clampStr(sessionShiftEl.value);
    const staff = clampStr(sessionStaffEl.value);

    if (!store || !shift || !staff) {
      sessionMsgEl.textContent = "Please select store + shift and enter staff.";
      return;
    }

    currentStore = store;
    currentShift = shift;
    currentStaff = staff;

    // set into main UI
    storeEl.value = store;
    staffEl.value = staff;
    sessionInfoEl.textContent = `Store: ${store} • Shift: ${shift}`;

    showAppShell();
    showHome();
    renderCategoryTiles();
    loadAlertsData();
  }

  // -----------------------------
  // Events
  // -----------------------------
  btnStartSession.onclick = startSession;

  btnBack.onclick = showHome;
  btnBackFromSauce.onclick = showHome;

  btnCloseItem.onclick = () => {
    hideItemForm();
    if (currentCategory) showCategory(currentCategory, currentSauceSub);
    else showHome();
  };

  btnSave.onclick = saveLog;

  btnAlerts.onclick = () => {
    showAlerts();
    loadAlertsData();
  };

  btnCloseAlerts.onclick = () => {
    showHome();
  };

  storeEl.onchange = () => {
    currentStore = clampStr(storeEl.value);
    sessionInfoEl.textContent = `Store: ${currentStore} • Shift: ${currentShift}`;
    renderCategoryTiles();

    // if in sauce/category view, refresh list
    if (!homeEl.classList.contains("hidden")) return;

    if (!alertsViewEl.classList.contains("hidden")) {
      loadAlertsData();
      return;
    }

    // If viewing a category, keep you there
    if (currentCategory === "Sauce") {
      if (currentSauceSub) showCategory("Sauce", currentSauceSub);
      else showSauceSubcategories();
    } else if (currentCategory) {
      showCategory(currentCategory);
    } else {
      showHome();
    }
  };

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    showSessionScreen();
    await loadItems();
  }

  init();
})();
