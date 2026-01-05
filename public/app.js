// =========================
// app.js — STEP 1 FOUNDATION
// =========================

import React from "react";

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
// Helper Text (fallback)
// =========================

export function getHelperText(mode) {
  switch ((mode || "").toUpperCase()) {
    case EXPIRY_MODES.MANUAL:
      return "Select expiry date and time manually";
    case EXPIRY_MODES.EOD:
      return "Expires at end of day";
    case EXPIRY_MODES.HOURLY:
      return "Hourly item – auto expires";
    case EXPIRY_MODES.AUTO:
      return "Expiry calculated automatically";
    default:
      return "";
  }
}

// =========================
// App (temporary placeholder)
// =========================

export default function App() {
  return (
    <div style={{ padding: 20 }}>
      <h2>PreCheck App</h2>
      <p>STEP 1 loaded: Expiry logic ready</p>
    </div>
  );
}
