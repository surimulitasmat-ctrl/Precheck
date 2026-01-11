// =========================
// PreCheck — server.js (FULL)
// Store-separated: PDD vs SKH
// Manager CRUD: items + categories (soft delete)
// Summary: Today / Tomorrow / Safe
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
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-now";
const MANAGER_PIN = process.env.MANAGER_PIN || "1234";

if (!DATABASE_URL) console.error("❌ Missing DATABASE_URL env var");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function q(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

function normStore(s) {
  const t = String(s || "").trim().toUpperCase();
  return t === "PDD" || t === "SKH" ? t : "";
}

function authManager(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.manager = payload; // { role:'manager', store:'PDD'|'SKH' }
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// -------- Static files --------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// -------- Health --------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// =========================
// STAFF APIs (store-aware)
// =========================

// Get categories per store
app.get("/api/categories", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return res.status(400).json({ error: "store required (PDD/SKH)" });

  const rows = await q(
    `
    select id, store, name, sort_order
    from public.categories
    where store = $1
      and is_active = true
      and deleted_at is null
    order by sort_order asc, name asc
    `,
    [store]
  );

  res.json(rows.rows);
});

// Get items per store (and only active/not deleted)
app.get("/api/items", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return res.status(400).json({ error: "store required (PDD/SKH)" });

  const rows = await q(
    `
    select id, store, name, category, sub_category, shelf_life_days
    from public.items
    where store = $1
      and is_active = true
      and (deleted_at is null)
    order by category asc, coalesce(sub_category,'') asc, name asc
    `,
    [store]
  );

  res.json(rows.rows);
});

// Log item
app.post("/api/log", async (req, res) => {
  const b = req.body || {};
  const store = normStore(b.store);
  if (!store) return res.status(400).json({ error: "store required" });
  if (!b.item_id) return res.status(400).json({ error: "item_id required" });

  // Ensure logs table exists? (assumes you already have)
  // We'll insert into public.logs
  await q(
    `
    insert into public.logs
      (store, item_id, item_name, category, sub_category, staff, shift, quantity, expiry, expiry_at, created_at)
    values
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
    `,
    [
      store,
      b.item_id,
      b.item_name || null,
      b.category || null,
      b.sub_category || null,
      b.staff || null,
      b.shift || null,
      b.quantity ?? null,
      b.expiry ?? null,
      b.expiry_at ?? null,
    ]
  );

  res.json({ ok: true });
});

// Alerts base data (latest expiry per item for a store)
app.get("/api/expiry", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return res.status(400).json({ error: "store required" });

  const rows = await q(
    `
    with latest as (
      select
        l.*,
        row_number() over (partition by l.item_id order by l.created_at desc) as rn
      from public.logs l
      where l.store = $1
    )
    select
      item_id,
      item_name as name,
      category,
      sub_category,
      coalesce(expiry, to_char(expiry_at::date, 'YYYY-MM-DD')) as expiry_value,
      coalesce(expiry::date, expiry_at::date) as expiry_date
    from latest
    where rn = 1
      and coalesce(expiry::date, expiry_at::date) is not null
    order by expiry_date asc, name asc
    `,
    [store]
  );

  res.json(rows.rows);
});

// Summary counts: today / tomorrow / safe
app.get("/api/summary", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return res.status(400).json({ error: "store required" });

  const rows = await q(
    `
    with latest as (
      select
        l.*,
        row_number() over (partition by l.item_id order by l.created_at desc) as rn
      from public.logs l
      where l.store = $1
    ),
    last_exp as (
      select
        item_id,
        coalesce(expiry::date, expiry_at::date) as d
      from latest
      where rn = 1
        and coalesce(expiry::date, expiry_at::date) is not null
    )
    select
      sum(case when d = current_date then 1 else 0 end) as today,
      sum(case when d = current_date + 1 then 1 else 0 end) as tomorrow,
      sum(case when d <> current_date and d <> current_date + 1 then 1 else 0 end) as safe
    from last_exp
    `,
    [store]
  );

  res.json(rows.rows[0] || { today: 0, tomorrow: 0, safe: 0 });
});

// =========================
// MANAGER AUTH (store-specific)
// =========================

app.post("/api/manager/login", async (req, res) => {
  const { pin, store } = req.body || {};
  const st = normStore(store);
  if (!st) return res.status(400).json({ error: "store required (PDD/SKH)" });

  if (String(pin || "") !== String(MANAGER_PIN)) {
    return res.status(401).json({ error: "Invalid PIN" });
  }

  const token = jwt.sign({ role: "manager", store: st }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

// =========================
// MANAGER: CATEGORIES (store separated)
// =========================

app.get("/api/manager/categories", authManager, async (req, res) => {
  const store = req.manager.store;

  const rows = await q(
    `
    select id, store, name, sort_order, is_active, deleted_at
    from public.categories
    where store = $1
    order by sort_order asc, name asc
    `,
    [store]
  );

  res.json(rows.rows);
});

app.post("/api/manager/categories", authManager, async (req, res) => {
  const store = req.manager.store;
  const name = String(req.body?.name || "").trim();
  const sort_order = Number(req.body?.sort_order ?? 100);

  if (!name) return res.status(400).json({ error: "name required" });
  if (!Number.isFinite(sort_order)) return res.status(400).json({ error: "sort_order invalid" });

  await q(
    `
    insert into public.categories (store, name, sort_order, is_active, deleted_at)
    values ($1,$2,$3,true,null)
    on conflict (store, name) do update
    set sort_order = excluded.sort_order,
        is_active = true,
        deleted_at = null,
        updated_at = now()
    `,
    [store, name, sort_order]
  );

  res.json({ ok: true });
});

app.patch("/api/manager/categories/:id", authManager, async (req, res) => {
  const store = req.manager.store;
  const id = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  const sort_order = Number(req.body?.sort_order ?? 100);
  const is_active = req.body?.is_active === undefined ? true : !!req.body.is_active;

  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  if (!name) return res.status(400).json({ error: "name required" });
  if (!Number.isFinite(sort_order)) return res.status(400).json({ error: "sort_order invalid" });

  await q(
    `
    update public.categories
    set name = $3,
        sort_order = $4,
        is_active = $5,
        updated_at = now()
    where id = $1 and store = $2
    `,
    [id, store, name, sort_order, is_active]
  );

  res.json({ ok: true });
});

// soft delete category
app.delete("/api/manager/categories/:id", authManager, async (req, res) => {
  const store = req.manager.store;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

  await q(
    `
    update public.categories
    set deleted_at = now(),
        is_active = false,
        updated_at = now()
    where id = $1 and store = $2
    `,
    [id, store]
  );

  res.json({ ok: true });
});

// =========================
// MANAGER: ITEMS (store separated)
// =========================

app.get("/api/manager/items", authManager, async (req, res) => {
  const store = req.manager.store;

  const rows = await q(
    `
    select id, store, name, category, sub_category, shelf_life_days, is_active, deleted_at
    from public.items
    where store = $1
    order by category asc, coalesce(sub_category,'') asc, name asc
    `,
    [store]
  );

  res.json(rows.rows);
});

app.post("/api/manager/items", authManager, async (req, res) => {
  const store = req.manager.store;
  const name = String(req.body?.name || "").trim();
  const category = String(req.body?.category || "").trim();
  const sub_category = String(req.body?.sub_category || "").trim() || null;
  const shelf_life_days = Number(req.body?.shelf_life_days ?? 0);

  if (!name) return res.status(400).json({ error: "name required" });
  if (!category) return res.status(400).json({ error: "category required" });
  if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
    return res.status(400).json({ error: "shelf_life_days invalid" });
  }

  await q(
    `
    insert into public.items (store, name, category, sub_category, shelf_life_days, is_active, deleted_at)
    values ($1,$2,$3,$4,$5,true,null)
    on conflict (store, category, coalesce(sub_category,''), name)
    do update set
      shelf_life_days = excluded.shelf_life_days,
      is_active = true,
      deleted_at = null
    `,
    [store, name, category, sub_category, shelf_life_days]
  );

  res.json({ ok: true });
});

app.patch("/api/manager/items/:id", authManager, async (req, res) => {
  const store = req.manager.store;
  const id = Number(req.params.id);

  const category = String(req.body?.category || "").trim();
  const sub_category = String(req.body?.sub_category || "").trim() || null;
  const shelf_life_days = Number(req.body?.shelf_life_days ?? 0);
  const is_active = req.body?.is_active === undefined ? true : !!req.body.is_active;

  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  if (!category) return res.status(400).json({ error: "category required" });
  if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
    return res.status(400).json({ error: "shelf_life_days invalid" });
  }

  await q(
    `
    update public.items
    set category = $3,
        sub_category = $4,
        shelf_life_days = $5,
        is_active = $6
    where id = $1 and store = $2
    `,
    [id, store, category, sub_category, shelf_life_days, is_active]
  );

  res.json({ ok: true });
});

// soft delete item
app.delete("/api/manager/items/:id", authManager, async (req, res) => {
  const store = req.manager.store;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

  await q(
    `
    update public.items
    set deleted_at = now(),
        is_active = false
    where id = $1 and store = $2
    `,
    [id, store]
  );

  res.json({ ok: true });
});

// -------- Start --------
app.listen(PORT, () => {
  console.log(`✅ PreCheck server running on :${PORT}`);
});
