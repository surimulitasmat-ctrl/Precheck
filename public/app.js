/* =========================
   PreCheck — app.js (WORKING)
   Drawer + Hamburger FIXED
   Matches index.html exactly
   ========================= */

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- STATE ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  view: { page: "session" },
  manager: { token: localStorage.getItem("managerToken") || "" },
};

/* ---------- HELPERS ---------- */
function isManagerMode() {
  return !!state.manager.token;
}
function setManagerToken(t) {
  if (t) localStorage.setItem("managerToken", t);
  else localStorage.removeItem("managerToken");
  state.manager.token = t || "";
}
function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session"));
    if (s) state.session = s;
  } catch {}
}

/* ---------- ROLE BADGE ---------- */
function updateRoleBadge() {
  const pill = $("#rolePill");
  if (!pill) return;

  const isMgr = isManagerMode();
  pill.classList.remove("hidden");
  pill.innerHTML = isMgr
    ? `<span style="color:#b71c1c;font-weight:900">👑 Manager</span>`
    : `<span style="color:#0d47a1;font-weight:900">🧢 Staff</span>`;

  pill.onclick = () => {
    if (isMgr) {
      state.view = { page: "manager" };
      render();
    } else {
      openManagerLogin();
    }
  };
}

/* ---------- DRAWER (HTML-BASED) ---------- */
function bindDrawer() {
  const btnMenu = $("#btnMenu");
  const backdrop = $("#drawerBackdrop");
  const btnClose = $("#btnDrawerClose");

  const home = $("#drawerHome");
  const alerts = $("#drawerAlerts");
  const manager = $("#drawerManager");
  const logout = $("#drawerLogout");

  if (!btnMenu || !backdrop) return;

  const open = () => backdrop.classList.remove("hidden");
  const close = () => backdrop.classList.add("hidden");

  // Prevent double binding
  if (btnMenu.dataset.bound === "1") return;
  btnMenu.dataset.bound = "1";

  btnMenu.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    open();
  });

  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  if (home) home.onclick = () => { close(); state.view = { page: "home" }; render(); };
  if (alerts) alerts.onclick = () => { close(); state.view = { page: "alerts" }; render(); };
  if (manager) manager.onclick = () => {
    close();
    if (isManagerMode()) {
      state.view = { page: "manager" };
      render();
    } else {
      openManagerLogin();
    }
  };
  if (logout) logout.onclick = () => { close(); doLogout(); };
}

/* ---------- MANAGER LOGIN ---------- */
function openManagerLogin() {
  const pin = prompt("Enter Manager PIN");
  if (!pin) return;

  // DEMO PIN = 1234 (replace with API later)
  if (pin === "1234") {
    setManagerToken("ok");
    alert("Manager mode enabled");
    updateRoleBadge();
    state.view = { page: "manager" };
    render();
  } else {
    alert("Wrong PIN");
  }
}

/* ---------- LOGOUT ---------- */
function doLogout() {
  if (isManagerMode()) {
    if (!confirm("Exit manager mode?")) return;
    setManagerToken("");
    updateRoleBadge();
    state.view = { page: "home" };
    render();
    return;
  }

  if (!confirm("Logout staff session?")) return;
  state.session = { store: "", shift: "", staff: "" };
  saveSession();
  state.view = { page: "session" };
  render();
}

/* ---------- RENDER ---------- */
function render() {
  const main = $("#main");
  if (!main) return;

  updateRoleBadge();

  if (state.view.page === "session") {
    main.innerHTML = `
      <div class="card">
        <h2>Start Session</h2>
        <input id="staffName" class="input" placeholder="Staff name" />
        <button id="startBtn" class="btn-yellow">Start</button>
      </div>
    `;
    $("#startBtn").onclick = () => {
      const name = $("#staffName").value.trim();
      if (!name) return alert("Enter name");
      state.session.staff = name;
      saveSession();
      state.view = { page: "home" };
      render();
    };
    return;
  }

  if (state.view.page === "home") {
    main.innerHTML = `<div class="card"><h2>Home</h2><p>Categories here</p></div>`;
    return;
  }

  if (state.view.page === "alerts") {
    main.innerHTML = `<div class="card"><h2>Alerts</h2></div>`;
    return;
  }

  if (state.view.page === "manager") {
    main.innerHTML = `
      <div class="card">
        <h2>Manager Panel</h2>
        <p>Add / Edit / Delete items here</p>
      </div>
    `;
    return;
  }
}

/* ---------- BOOT ---------- */
function boot() {
  loadSession();
  bindDrawer();
  updateRoleBadge();

  if (state.session.staff) {
    state.view = { page: "home" };
  } else {
    state.view = { page: "session" };
  }

  render();
}

boot();
