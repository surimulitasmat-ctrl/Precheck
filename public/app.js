// =========================
// app.js — STEP 2 (Expiry UI)
// =========================

import React, { useEffect, useMemo, useState } from "react";

// =========================
// Expiry Mode Definitions
// =========================

export const EXPIRY_MODES = {
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

  const [h, m] = hhmm.split(":").map(Number);
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
  // HTML datetime-local expects: YYYY-MM-DDTHH:MM
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function parseDateTimeLocal(value) {
  // value like "2026-01-06T14:30"
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

export function computeExpiryAt({
  mode,
  now = new Date(),
  expiryHours,
  eodTime,
  manualExpiry,
}) {
  const m = (mode || "").toUpperCase();

  if (m === EXPIRY_MODES.MANUAL) {
    if (!(manualExpiry instanceof Date) || isNaN(manualExpiry.getTime())) {
      return { expiryAt: null, error: "Manual expiry date/time is required" };
    }
    return { expiryAt: manualExpiry, error: null };
  }

  if (m === EXPIRY_MODES.EOD) {
    const eod = toSameDayTime(now, eodTime);
    if (!eod) return { expiryAt: null, error: "Invalid EOD time (use HH:MM)" };
    return { expiryAt: eod, error: null };
  }

  if (m === EXPIRY_MODES.AUTO || m === EXPIRY_MODES.HOURLY) {
    const expiry = addHours(now, expiryHours);
    if (!expiry) {
      return { expiryAt: null, error: "Expiry hours is required (number)" };
    }
    return { expiryAt: expiry, error: null };
  }

  return { expiryAt: null, error: "Unknown expiry mode" };
}

// =========================
// Helper Text (fallback)
// =========================

export function getHelperText(mode) {
  switch ((mode || "").toUpperCase()) {
    case EXPIRY_MODES.MANUAL:
      return "Select expiry date and time manually";
    case EXPIRY_MODES.EOD:
      return "Expires at end of day";
    case EXPIRY_MODES.HOURLY:
      return "Hourly item – expiry is calculated automatically";
    case EXPIRY_MODES.AUTO:
      return "Expiry is calculated automatically";
    default:
      return "";
  }
}

// =========================
// App (STEP 2 UI)
// =========================

export default function App() {
  // For now we use a simple demo item state.
  // In later steps, we will connect to your FINAL item list + stores.
  const [mode, setMode] = useState(EXPIRY_MODES.AUTO);

  // Inputs used by different modes
  const [expiryHours, setExpiryHours] = useState("4"); // AUTO/HOURLY
  const [eodTime, setEodTime] = useState("23:59"); // EOD
  const [manualExpiryValue, setManualExpiryValue] = useState(() =>
    toLocalDateTimeInputValue(new Date())
  ); // MANUAL (datetime-local string)

  // When mode changes, keep sensible defaults (beginner-friendly)
  useEffect(() => {
    if (mode === EXPIRY_MODES.AUTO && !expiryHours) setExpiryHours("4");
    if (mode === EXPIRY_MODES.HOURLY && !expiryHours) setExpiryHours("1");
    if (mode === EXPIRY_MODES.EOD && !eodTime) setEodTime("23:59");
    if (mode === EXPIRY_MODES.MANUAL && !manualExpiryValue) {
      setManualExpiryValue(toLocalDateTimeInputValue(new Date()));
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const manualExpiryDate = useMemo(
    () => parseDateTimeLocal(manualExpiryValue),
    [manualExpiryValue]
  );

  const helperText = useMemo(() => getHelperText(mode), [mode]);

  const result = useMemo(() => {
    return computeExpiryAt({
      mode,
      now: new Date(),
      expiryHours,
      eodTime,
      manualExpiry: manualExpiryDate,
    });
  }, [mode, expiryHours, eodTime, manualExpiryDate]);

  // Simple UI styles
  const card = {
    maxWidth: 520,
    margin: "24px auto",
    padding: 16,
    border: "1px solid #ddd",
    borderRadius: 12,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  };

  const row = { marginTop: 12 };
  const label = { display: "block", fontWeight: 600, marginBottom: 6 };
  const input = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ccc",
    fontSize: 14,
  };

  const small = { marginTop: 6, fontSize: 13, opacity: 0.8 };

  return (
    <div style={card}>
      <h2 style={{ margin: 0 }}>PreCheck</h2>
      <p style={{ marginTop: 6, marginBottom: 0, opacity: 0.75 }}>
        STEP 2: Expiry Mode UI + Helper Text
      </p>

      <div style={row}>
        <label style={label}>Expiry Mode</label>
        <select style={input} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value={EXPIRY_MODES.AUTO}>AUTO</option>
          <option value={EXPIRY_MODES.MANUAL}>MANUAL</option>
          <option value={EXPIRY_MODES.EOD}>EOD</option>
          <option value={EXPIRY_MODES.HOURLY}>HOURLY</option>
        </select>
        <div style={small}>{helperText}</div>
      </div>

      {(mode === EXPIRY_MODES.AUTO || mode === EXPIRY_MODES.HOURLY) && (
        <div style={row}>
          <label style={label}>Expiry Hours</label>
          <input
            style={input}
            type="number"
            min="0"
            step="1"
            value={expiryHours}
            onChange={(e) => setExpiryHours(e.target.value)}
            placeholder="Example: 4"
          />
          <div style={small}>
            Used for {mode}. Expiry = now + hours.
          </div>
        </div>
      )}

      {mode === EXPIRY_MODES.EOD && (
        <div style={row}>
          <label style={label}>End of Day Time (HH:MM)</label>
          <input
            style={input}
            type="time"
            value={eodTime}
            onChange={(e) => setEodTime(e.target.value)}
          />
          <div style={small}>Expiry will be today at this time.</div>
        </div>
      )}

      {mode === EXPIRY_MODES.MANUAL && (
        <div style={row}>
          <label style={label}>Manual Expiry Date/Time</label>
          <input
            style={input}
            type="datetime-local"
            value={manualExpiryValue}
            onChange={(e) => setManualExpiryValue(e.target.value)}
          />
          <div style={small}>Staff selects expiry themselves.</div>
        </div>
      )}

      <div style={{ ...row, paddingTop: 12, borderTop: "1px solid #eee" }}>
        <label style={label}>Computed Expiry Result</label>

        {result.error ? (
          <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #f3c0c0" }}>
            <b style={{ color: "#b00020" }}>Error:</b> {result.error}
          </div>
        ) : (
          <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cfcfcf" }}>
            <div style={{ fontSize: 14 }}>
              <b>Expiry At:</b> {formatReadable(result.expiryAt)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
