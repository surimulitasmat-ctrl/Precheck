// server.js (CommonJS)
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// -------------------- DB --------------------
if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Cache stock_logs columns so inserts won't fail when your schema changes
let STOCK_LOGS_COLS = null;
async function getStockLogsCols() {
  if (STOCK_LOGS_COLS) return STOCK_LOGS_COLS;
  const r = await query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_logs'
    `,
    []
  );
  STOCK_LOGS_COLS = new Set(r.rows.map((x) => x.column_name));
  return STOCK_LOGS_COLS;
}

// -------------------- Manager Token (simple stateless HMAC) --------------------
function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function signToken(payloadObj) {
  const secret = process.env.MANAGER_TOKEN_SECRET || "dev_secret_change_me";
  const payload = base64url(JSON.stringify(payloadObj));
  const sig = base64url(crypto.createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  try {
    const secret = process.env.MANAGER_TOKEN_SECRET || "dev_secret_change_me";
    const [payload, sig] = (token || "").split(".");
    if (!payload || !sig) return null;
    const expected = base64url(crypto.createHmac("sha256", secret).update(payload).digest());
    if (expected !== sig) return null;
    const obj = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}
function requireManager(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const obj = verifyToken(token);
  if (!obj) return res.status(401).json({ error: "unauthorized" });
  req.manager = obj;
  next();
}

// -------------------- Health --------------------
app.get("/health", (req, res) => res.send("ok"));

// -------------------- Your existing APIs --------------------

// GET /api/items
app.get("/api/items", async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, category, sub_category, shelf_life_days
       FROM public.items
       ORDER BY category ASC, sub_category ASC NULLS FIRST, name ASC`,
      []
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "items_failed" });
  }
});

// POST /api/log  (insert only columns that exist in your stock_logs table)
app.post("/api/log", async (req, res) => {
  try {
    const cols = await getStockLogsCols();

    // Payload from frontend (we accept extra fields, but only insert what exists)
    const body = req.body || {};

    // Map common fields
    const row = {
      item_id: body.item_id ?? body.itemId ?? null,
      item_name: body.item_name ?? body.itemName ?? null,
      category: body.category ?? null,
      sub_category: body.sub_category ?? body.subCategory ?? null,
      store: body.store ?? null,
      staff: body.staff ?? null,
      shift: body.shift ?? null,
      qty: body.qty ?? body.quantity ?? null,
      quantity: body.quantity ?? body.qty ?? null,
      expiry_at: body.expiry_at ?? body.expiryAt ?? null,
      expiry: body.expiry ?? null,
      created_at: body.created_at ?? null,
    };

    // Build insert lists only for existing columns
    const insertCols = [];
    const insertVals = [];
    const params = [];

    Object.entries(row).forEach(([k, v]) => {
      if (v === undefined) return;
      if (!cols.has(k)) return;
      insertCols.push(k);
      params.push(v);
      insertVals.push(`$${params.length}`);
    });

    if (!insertCols.length) {
      return res.status(400).json({ error: "no_valid_columns_to_insert" });
    }

    const sql = `INSERT INTO public.stock_logs (${insertCols.join(",")})
                 VALUES (${insertVals.join(",")})
                 RETURNING *`;
    const r = await query(sql, params);
    res.json({ ok: true, row: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "log_failed", detail: String(e.message || e) });
  }
});

// GET /api/expiry?store=PDD
// NOTE: this is a minimal example; if you already have your own, keep yours.
// This version returns items expiring today/tomorrow based on latest log per item.
app.get("/api/expiry", async (req, res) => {
  try {
    const store = (req.query.store || "").toString();
    if (!store) return res.status(400).json({ error: "missing_store" });

    // latest expiry per item for store
    const r = await query(
      `
      WITH latest AS (
        SELECT DISTINCT ON (item_id)
          item_id, expiry_at, expiry, created_at, store
        FROM public.stock_logs
        WHERE store = $1
        ORDER BY item_id, created_at DESC NULLS LAST
      )
      SELECT i.id, i.name, i.category, i.sub_category,
             COALESCE(l.expiry_at::text, l.expiry::text) AS expiry_value
      FROM public.items i
      JOIN latest l ON l.item_id = i.id
      ORDER BY i.category, i.sub_category NULLS FIRST, i.name
      `,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "expiry_failed" });
  }
});

// -------------------- Manager APIs --------------------

// POST /api/manager/login  { pin: "8686" }
app.post("/api/manager/login", (req, res) => {
  const pin = String((req.body && req.body.pin) || "");
  const expected = String(process.env.MANAGER_PIN || "");
  if (!expected) return res.status(500).json({ error: "MANAGER_PIN_not_set" });

  if (pin !== expected) return res.status(401).json({ error: "invalid_pin" });

  const token = signToken({
    role: "manager",
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  });

  res.json({ ok: true, token });
});

// Example manager edit endpoints (optional for later UI)
// GET manager items
app.get("/api/manager/items", requireManager, async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, category, sub_category, shelf_life_days
       FROM public.items
       ORDER BY category ASC, sub_category ASC NULLS FIRST, name ASC`,
      []
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_items_failed" });
  }
});

// PATCH manager item
app.patch("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, category, sub_category, shelf_life_days } = req.body || {};

    const r = await query(
      `
      UPDATE public.items
      SET name = COALESCE($2, name),
          category = COALESCE($3, category),
          sub_category = $4,
          shelf_life_days = COALESCE($5, shelf_life_days)
      WHERE id = $1
      RETURNING *
      `,
      [id, name ?? null, category ?? null, sub_category ?? null, shelf_life_days ?? null]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_update_failed" });
  }
});

// -------------------- Static hosting --------------------
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("PreCheck running on port", PORT));
