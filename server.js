// =========================
// PreCheck — server.js (FULL)
// Store-separated: PDD vs SKH
// Manager CRUD: items + categories (soft delete)
// =========================

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import jwt from "jsonwebtoken";

const { Pool } = pg;

const app = express();
app.use(express.json());

// -------- Config --------
const PORT = process.env.PORT || 3000;

// Render/Supabase Postgres
// On Render, set DATABASE_URL in Environment variables.
const DATABASE_URL = process.env.DATABASE_URL;

// Manager auth
const JWT_SECRET = process.env.JWT_SECRET || "change-me-now";
const MANAGER_PIN = process.env.MANAGER_PIN || "1234";

// -------- DB --------
if (!DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL env var");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function q(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

function normStore(s) {
  const t = String(s || "").trim().toUpperCase();
  return t === "PDD" || t === "SKH" ? t : "";
}

// -------- Static files (public/) --------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// -------- Helpers --------
function ok(res, data) {
  res.json(data);
}
function bad(res, code, msg) {
  res.status(code).json({ error: msg });
}

// -------- Manager middleware --------
function requireManager(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token) return bad(res, 401, "Missing token");

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.role || payload.role !== "manager") return bad(res, 401, "Invalid token");
    req.manager = payload;
    next();
  } catch {
    return bad(res, 401, "Invalid/expired token");
  }
}

// =========================
// Public API
// =========================

// GET /api/categories?store=PDD
app.get("/api/categories", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return bad(res, 400, "store required (PDD/SKH)");

  try {
    const rows = await q(
      `
      select id, store, name, sort_order, is_active, deleted_at
      from public.categories
      where store = $1
        and deleted_at is null
        and is_active = true
      order by sort_order asc nulls last, name asc
      `,
      [store]
    );

    ok(res, rows.rows);
  } catch (e) {
    bad(res, 500, e.message || "Failed to load categories");
  }
});

// GET /api/items?store=PDD
app.get("/api/items", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return bad(res, 400, "store required (PDD/SKH)");

  try {
    const rows = await q(
      `
      select id, store, name, category, sub_category, shelf_life_days, is_active, deleted_at
      from public.items
      where store = $1
        and deleted_at is null
        and is_active = true
      order by category asc, name asc
      `,
      [store]
    );

    ok(res, rows.rows);
  } catch (e) {
    bad(res, 500, e.message || "Failed to load items");
  }
});

// POST /api/log
app.post("/api/log", async (req, res) => {
  const b = req.body || {};

  const store = normStore(b.store);
  if (!store) return bad(res, 400, "store required");

  // minimum fields
  const item_id = Number(b.item_id);
  const item_name = String(b.item_name || "").trim();
  const category = String(b.category || "").trim();
  const sub_category = b.sub_category ? String(b.sub_category).trim() : null;

  const staff = String(b.staff || "").trim();
  const shift = String(b.shift || "").trim();

  const quantity = b.quantity === null || b.quantity === undefined ? null : Number(b.quantity);

  const expiry = b.expiry ? String(b.expiry).trim() : null; // date string
  const expiry_at = b.expiry_at ? String(b.expiry_at).trim() : null; // ISO datetime

  if (!item_id || !item_name || !category || !staff || !shift) {
    return bad(res, 400, "Missing required fields");
  }

  try {
    await q(
      `
      insert into public.logs
        (store, item_id, item_name, category, sub_category, staff, shift, quantity, expiry, expiry_at, created_at)
      values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
      `,
      [store, item_id, item_name, category, sub_category, staff, shift, quantity, expiry, expiry_at]
    );

    ok(res, { ok: true });
  } catch (e) {
    bad(res, 500, e.message || "Failed to save log");
  }
});

// GET /api/expiry?store=PDD
// Returns latest log per item_name (for that store)
app.get("/api/expiry", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return bad(res, 400, "store required (PDD/SKH)");

  try {
    const rows = await q(
      `
      select distinct on (item_name)
        item_name as name,
        category,
        sub_category,
        coalesce(expiry_at::text, expiry::text) as expiry_value,
        created_at
      from public.logs
      where store = $1
      order by item_name, created_at desc
      `,
      [store]
    );

    ok(res, rows.rows);
  } catch (e) {
    bad(res, 500, e.message || "Failed to load expiry");
  }
});

// =========================
// Manager API (JWT protected)
// =========================

// POST /api/manager/login { pin }
app.post("/api/manager/login", async (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  if (!pin) return bad(res, 400, "PIN required");

  if (pin !== MANAGER_PIN) return bad(res, 401, "Wrong PIN");

  const token = jwt.sign({ role: "manager" }, JWT_SECRET, { expiresIn: "7d" });
  ok(res, { token });
});

// ----- Manager: Items -----
// GET /api/manager/items?store=PDD (includes inactive/deleted too if you want later)
app.get("/api/manager/items", requireManager, async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return bad(res, 400, "store required");

  try {
    const rows = await q(
      `
      select id, store, name, category, sub_category, shelf_life_days, is_active, deleted_at
      from public.items
      where store = $1
        and deleted_at is null
      order by category asc, name asc
      `,
      [store]
    );
    ok(res, rows.rows);
  } catch (e) {
    bad(res, 500, e.message || "Failed to load manager items");
  }
});

// POST /api/manager/items
app.post("/api/manager/items", requireManager, async (req, res) => {
  const b = req.body || {};
  const store = normStore(b.store);
  if (!store) return bad(res, 400, "store required");

  const name = String(b.name || "").trim();
  const category = String(b.category || "").trim();
  const sub_category = b.sub_category ? String(b.sub_category).trim() : null;

  const shelf_life_days = Number(b.shelf_life_days ?? 0);
  if (!name || !category) return bad(res, 400, "name + category required");
  if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) return bad(res, 400, "invalid shelf_life_days");

  try {
    // If exists but deleted/inactive, revive it
    const out = await q(
      `
      insert into public.items (store, name, category, sub_category, shelf_life_days, is_active, deleted_at)
      values ($1,$2,$3,$4,$5,true,null)
      returning *
      `,
      [store, name, category, sub_category, shelf_life_days]
    );

    ok(res, out.rows[0]);
  } catch (e) {
    bad(res, 500, e.message || "Failed to add item");
  }
});

// PATCH /api/manager/items/:id
app.patch("/api/manager/items/:id", requireManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return bad(res, 400, "Invalid id");

  const b = req.body || {};
  const category = b.category !== undefined ? String(b.category || "").trim() : undefined;
  const sub_category = b.sub_category !== undefined ? (b.sub_category ? String(b.sub_category).trim() : null) : undefined;
  const shelf_life_days = b.shelf_life_days !== undefined ? Number(b.shelf_life_days) : undefined;
  const is_active = b.is_active !== undefined ? !!b.is_active : undefined;

  if (shelf_life_days !== undefined && (!Number.isFinite(shelf_life_days) || shelf_life_days < 0)) {
    return bad(res, 400, "invalid shelf_life_days");
  }

  try {
    const out = await q(
      `
      update public.items
      set
        category = coalesce($2, category),
        sub_category = $3,
        shelf_life_days = coalesce($4, shelf_life_days),
        is_active = coalesce($5, is_active)
      where id = $1
      returning *
      `,
      [
        id,
        category ?? null,
        sub_category === undefined ? null : sub_category, // if omitted, keep null is ok
        shelf_life_days ?? null,
        is_active ?? null,
      ]
    );

    if (!out.rows.length) return bad(res, 404, "Not found");
    ok(res, out.rows[0]);
  } catch (e) {
    bad(res, 500, e.message || "Failed to update item");
  }
});

// DELETE /api/manager/items/:id  (SOFT delete)
app.delete("/api/manager/items/:id", requireManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return bad(res, 400, "Invalid id");

  try {
    const out = await q(
      `
      update public.items
      set deleted_at = now(), is_active = false
      where id = $1
      returning id
      `,
      [id]
    );
    if (!out.rows.length) return bad(res, 404, "Not found");
    ok(res, { ok: true });
  } catch (e) {
    bad(res, 500, e.message || "Failed to delete item");
  }
});

// ----- Manager: Categories -----
// GET /api/manager/categories?store=PDD
app.get("/api/manager/categories", requireManager, async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return bad(res, 400, "store required");

  try {
    const rows = await q(
      `
      select id, store, name, sort_order, is_active, deleted_at
      from public.categories
      where store = $1
        and deleted_at is null
      order by sort_order asc nulls last, name asc
      `,
      [store]
    );
    ok(res, rows.rows);
  } catch (e) {
    bad(res, 500, e.message || "Failed to load categories");
  }
});

// POST /api/manager/categories
app.post("/api/manager/categories", requireManager, async (req, res) => {
  const b = req.body || {};
  const store = normStore(b.store);
  if (!store) return bad(res, 400, "store required");

  const name = String(b.name || "").trim();
  const sort_order = Number(b.sort_order ?? 0);

  if (!name) return bad(res, 400, "name required");
  if (!Number.isFinite(sort_order)) return bad(res, 400, "sort_order invalid");

  try {
    // Upsert-like behavior: if same store+name existed but deleted, revive it
    const out = await q(
      `
      insert into public.categories (store, name, sort_order, is_active, deleted_at)
      values ($1,$2,$3,true,null)
      returning *
      `,
      [store, name, sort_order]
    );
    ok(res, out.rows[0]);
  } catch (e) {
    bad(res, 500, e.message || "Failed to add category");
  }
});

// PATCH /api/manager/categories/:id
app.patch("/api/manager/categories/:id", requireManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return bad(res, 400, "Invalid id");

  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name || "").trim() : undefined;
  const sort_order = b.sort_order !== undefined ? Number(b.sort_order) : undefined;
  const is_active = b.is_active !== undefined ? !!b.is_active : undefined;

  if (sort_order !== undefined && !Number.isFinite(sort_order)) return bad(res, 400, "sort_order invalid");

  try {
    const out = await q(
      `
      update public.categories
      set
        name = coalesce($2, name),
        sort_order = coalesce($3, sort_order),
        is_active = coalesce($4, is_active)
      where id = $1
      returning *
      `,
      [id, name ?? null, sort_order ?? null, is_active ?? null]
    );

    if (!out.rows.length) return bad(res, 404, "Not found");
    ok(res, out.rows[0]);
  } catch (e) {
    bad(res, 500, e.message || "Failed to update category");
  }
});

// DELETE /api/manager/categories/:id  (SOFT delete)
app.delete("/api/manager/categories/:id", requireManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return bad(res, 400, "Invalid id");

  try {
    const out = await q(
      `
      update public.categories
      set deleted_at = now(), is_active = false
      where id = $1
      returning id
      `,
      [id]
    );

    if (!out.rows.length) return bad(res, 404, "Not found");
    ok(res, { ok: true });
  } catch (e) {
    bad(res, 500, e.message || "Failed to delete category");
  }
});

// -------- Health --------
app.get("/api/health", (req, res) => ok(res, { ok: true }));

// -------- SPA fallback (optional) --------
// If you use routes later, keep this.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ PreCheck server running on :${PORT}`);
});
