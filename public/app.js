// =========================
// app.js — STEP 2 (NO MODULE)
// =========================

// =========================
// Expiry Mode Definitions
// =========================

const EXPIRY_MODES = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
  EOD: "EOD",
  HOURLY: "HOURLY",
};

// =========================
// Expiry Helpers
// =========================

function toSameDayTime(baseDate, hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;

  const parts = hhmm.split(":");
  if (parts.length !== 2) return null;

  const h = Number(parts[0]);
  const m = Number(parts[1]);

  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function addHours(date, hours) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return null;
  return new Date(date.getTime() + h * 60 * 60 * 1000);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalDateTimeInputValue(date) {
  const d = new Date(date);
  return (
    d.getFullYear() +
    "-" +
    pad2(d.getMonth() + 1) +
    "-" +
    pad2(d.getDate()) +
    "T" +
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes())
  );
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatReadable(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

// =========================
// Expiry Calculator
// =========================

function computeExpiryAt({
  mode,
  now = new Date(),
  expiryHours,
  eodTime,
  manualExpiry,
}) {
  const m = (mode || "").toUpperCase();

  if (m === EXPIRY_MODES.MANUAL) {
    if (!(manualExpiry instanceof Date)) {
      return { expiryAt: null, error: "Manual expiry required" };
    }
    return { expiryAt: manualExpiry, error: null };
  }

  if (m === EXPIRY_MODES.EOD) {
    const eod = toSameDayTime(now, eodTime);
    if (!eod) return { expiryAt: null, error: "Invalid EOD time" };
    return { expiryAt: eod, error: null };
  }

  if (m === EXPIRY_MODES.AUTO || m === EXPIRY_MODES.HOURLY) {
    const expiry = addHours(now, expiryHours);
    if (!expiry) {
      return { expiryAt: null, error: "Expiry hours required" };
    }
    return { expiryAt: expiry, error: null };
  }

  return { expiryAt: null, error: "Unknown expiry mode" };
}

// =========================
// BASIC UI (NO REACT)
// =========================

const root = document.getElementById("app");

let mode = EXPIRY_MODES.AUTO;
let expiryHours = "4";
let eodTime = "23:59";
let manualExpiry = toLocalDateTimeInputValue(new Date());

function render() {
  const result = computeExpiryAt({
    mode,
    expiryHours,
    eodTime,
    manualExpiry: parseDateTimeLocal(manualExpiry),
  });

  root.innerHTML = `
    <h2>PreCheck – STEP 2</h2>

    <label>Expiry Mode</label>
    <select id="mode">
      ${Object.values(EXPIRY_MODES)
        .map(
          (m) => `<option value="${m}" ${m === mode ? "selected" : ""}>${m}</option>`
        )
        .join("")}
    </select>

    ${
      mode === "AUTO" || mode === "HOURLY"
        ? `<br><label>Expiry Hours</label>
           <input id="hours" type="number" value="${expiryHours}">`
        : ""
    }

    ${
      mode === "EOD"
        ? `<br><label>EOD Time</label>
           <input id="eod" type="time" value="${eodTime}">`
        : ""
    }

    ${
      mode === "MANUAL"
        ? `<br><label>Manual Expiry</label>
           <input id="manual" type="datetime-local" value="${manualExpiry}">`
        : ""
    }

    <hr>
    <b>Result:</b><br>
    ${
      result.error
        ? `<span style="color:red">${result.error}</span>`
        : formatReadable(result.expiryAt)
    }
  `;

  document.getElementById("mode").onchange = (e) => {
    mode = e.target.value;
    render();
  };

  if (document.getElementById("hours"))
    document.getElementById("hours").oninput = (e) => {
      expiryHours = e.target.value;
      render();
    };

  if (document.getElementById("eod"))
    document.getElementById("eod").oninput = (e) => {
      eodTime = e.target.value;
      render();
    };

  if (document.getElementById("manual"))
    document.getElementById("manual").oninput = (e) => {
      manualExpiry = e.target.value;
      render();
    };
}

render();
