// server.js (ESM) — PreCheck
import express from "express";
import path from "path";
import crypto from "crypto";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

const app = express();
app.use(express.json());

// -------------------- Paths (ESM) --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Cache stock_logs columns so inserts won't fail when schema changes
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

// -------------------- Manager Token (stateless HMAC) --------------------
function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
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

    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const obj = JSON.parse(json);

    if (obj.exp && Date.now() > obj.exp) return null;
    if (!obj.store) return null;

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

// -------------------- Items (STAFF) --------------------
// GET /api/items?store=PDD
app.get("/api/items", async (req, res) => {
  try {
    const store = String(req.query.store || "").trim();
    if (!store) return res.status(400).json({ error: "missing_store" });

    const r = await query(
      `SELECT id, name, category, sub_category, shelf_life_days
       FROM public.items
       WHERE store = $1
         AND is_active = true
         AND deleted_at IS NULL
       ORDER BY category ASC, sub_category ASC NULLS FIRST, name ASC`,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "items_failed" });
  }
});

// -------------------- Logs --------------------
// POST /api/log (insert only columns that exist)
app.post("/api/log", async (req, res) => {
  try {
    const cols = await getStockLogsCols();
    const body = req.body || {};

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

// -------------------- Expiry --------------------
// GET /api/expiry?store=PDD
app.get("/api/expiry", async (req, res) => {
  try {
    const store = String(req.query.store || "").trim();
    if (!store) return res.status(400).json({ error: "missing_store" });

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
      WHERE i.store = $1
        AND i.is_active = true
        AND i.deleted_at IS NULL
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

// -------------------- Manager APIs (PER-STORE + SOFT DELETE) --------------------
app.get("/api/manager/ping", (req, res) => res.json({ ok: true }));

// POST /api/manager/login  { pin: "8686", store: "PDD" }
app.post("/api/manager/login", (req, res) => {
  const pin = String((req.body && req.body.pin) || "").trim();
  const store = String((req.body && req.body.store) || "").trim();
  const expected = String(process.env.MANAGER_PIN || "").trim();

  if (!expected) return res.status(500).json({ error: "MANAGER_PIN_not_set" });
  if (!store) return res.status(400).json({ error: "missing_store" });
  if (pin !== expected) return res.status(401).json({ error: "invalid_pin" });

  const token = signToken({
    role: "manager",
    store,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  });

  res.json({ ok: true, token });
});

// GET /api/manager/items
app.get("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = String(req.manager.store);

    const r = await query(
      `SELECT id, name, category, sub_category, shelf_life_days
       FROM public.items
       WHERE store = $1
         AND is_active = true
         AND deleted_at IS NULL
       ORDER BY category ASC, sub_category ASC NULLS FIRST, name ASC`,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_items_failed" });
  }
});

// POST /api/manager/items  (create item for manager's store)
app.post("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = String(req.manager.store);
    const { name, category, sub_category, shelf_life_days } = req.body || {};

    const n = String(name || "").trim();
    const c = String(category || "").trim();
    const sc = sub_category == null ? null : String(sub_category || "").trim() || null;
    const sl = Number(shelf_life_days);

    if (!n) return res.status(400).json({ error: "missing_name" });
    if (!c) return res.status(400).json({ error: "missing_category" });
    if (!Number.isFinite(sl) || sl < 0) return res.status(400).json({ error: "invalid_shelf_life_days" });

    const r = await query(
      `INSERT INTO public.items (name, category, sub_category, shelf_life_days, store, is_active, deleted_at)
       VALUES ($1,$2,$3,$4,$5,true,NULL)
       RETURNING id, name, category, sub_category, shelf_life_days`,
      [n, c, sc, sl, store]
    );

    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_create_failed" });
  }
});

// PATCH /api/manager/items/:id  (update item but only inside manager store)
app.patch("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const store = String(req.manager.store);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    const { name, category, sub_category, shelf_life_days } = req.body || {};

    const r = await query(
      `
      UPDATE public.items
      SET name = COALESCE($2, name),
          category = COALESCE($3, category),
          sub_category = $4,
          shelf_life_days = COALESCE($5, shelf_life_days)
      WHERE id = $1
        AND store = $6
        AND is_active = true
        AND deleted_at IS NULL
      RETURNING id, name, category, sub_category, shelf_life_days
      `,
      [
        id,
        name == null ? null : String(name).trim(),
        category == null ? null : String(category).trim(),
        sub_category == null ? null : String(sub_category || "").trim() || null,
        shelf_life_days == null ? null : Number(shelf_life_days),
        store,
      ]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_update_failed" });
  }
});

// DELETE /api/manager/items/:id  (SOFT DELETE)
app.delete("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const store = String(req.manager.store);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    const r = await query(
      `
      UPDATE public.items
      SET is_active = false,
          deleted_at = NOW()
      WHERE id = $1
        AND store = $2
        AND deleted_at IS NULL
      RETURNING id
      `,
      [id, store]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_delete_failed" });
  }
});

// -------------------- Static hosting --------------------
app.use(express.static(path.join(__dirname, "public")));

// Always return index.html for SPA routes (keep last)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("PreCheck running on port", PORT));
