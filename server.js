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

function err(res, code, message) {
  res.status(code).json({ error: message });
}

function requireManager(req, res, next) {
  try {
    const h = String(req.headers.authorization || "");
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) return err(res, 401, "Unauthorized");
    const decoded = jwt.verify(token, JWT_SECRET);
    req.manager = decoded;
    next();
  } catch {
    return err(res, 401, "Unauthorized");
  }
}

// -------- Static files (public/) --------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// -------- Category mapping (DB vs UI) --------
// DB keeps "Back counter", UI shows "Fountain Drinks"
function uiCategoryFromDb(cat) {
  const c = String(cat || "").trim();
  if (c.toLowerCase() === "back counter") return "Fountain Drinks";
  return c;
}
function dbCategoryFromUi(cat) {
  const c = String(cat || "").trim();
  if (c.toLowerCase() === "fountain drinks") return "Back counter";
  return c;
}

// =========================
// Public APIs (Staff)
// =========================

// List categories for store (active)
app.get("/api/categories", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return err(res, 400, "Invalid store");

  const r = await q(
    `
    select id, store, name, sort_order
    from public.categories
    where store=$1 and deleted_at is null and is_active=true
    order by sort_order asc, name asc
  `,
    [store]
  );

  res.json(
    r.rows.map((x) => ({
      ...x,
      name: uiCategoryFromDb(x.name),
    }))
  );
});

// List items for store (active)
app.get("/api/items", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return err(res, 400, "Invalid store");

  const r = await q(
    `
    select id, store, name, category, sub_category, shelf_life_days
    from public.items
    where store=$1 and deleted_at is null and is_active=true
    order by category asc, name asc
  `,
    [store]
  );

  res.json(
    r.rows.map((x) => ({
      ...x,
      category: uiCategoryFromDb(x.category),
      sub_category: x.sub_category,
    }))
  );
});

// Save logs in batch
app.post("/api/log/batch", async (req, res) => {
  const body = req.body || {};
  const store = normStore(body.store);
  if (!store) return err(res, 400, "Invalid store");

  const staff = String(body.staff || "").trim();
  const shift = String(body.shift || "").trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!staff || !shift) return err(res, 400, "Missing staff/shift");
  if (!rows.length) return err(res, 400, "No rows");

  // Insert one-by-one (safe + clear)
  for (const r of rows) {
    const item_id = r.item_id ?? null;
    const item_name = String(r.item_name || "").trim();
    const category = dbCategoryFromUi(String(r.category || "").trim());
    const sub_category = r.sub_category ? String(r.sub_category) : null;
    const quantity = r.quantity == null ? null : Number(r.quantity);
    const expiry = r.expiry ? String(r.expiry) : null;
    const expiry_at = r.expiry_at ? String(r.expiry_at) : null;

    if (!item_name || !category) continue;

    await q(
      `
      insert into public.logs
      (store, staff, shift, item_id, item_name, category, sub_category, quantity, expiry, expiry_at, created_at)
      values
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
    `,
      [store, staff, shift, item_id, item_name, category, sub_category, quantity, expiry, expiry_at]
    );
  }

  res.json({ ok: true });
});

// Latest expiry per item for summary (today/tomorrow/safe)
app.get("/api/expiry", async (req, res) => {
  const store = normStore(req.query.store);
  if (!store) return err(res, 400, "Invalid store");

  // "latest record per item_name + category + sub_category" -> shows newest expiry
  const r = await q(
    `
    with ranked as (
      select
        item_name,
        category,
        sub_category,
        coalesce(expiry::text, (expiry_at at time zone 'utc')::date::text) as expiry_value,
        created_at,
        row_number() over (
          partition by item_name, category, coalesce(sub_category,'')
          order by created_at desc
        ) as rn
      from public.logs
      where store=$1
    )
    select item_name as name,
           category,
           sub_category,
           expiry_value
    from ranked
    where rn=1 and expiry_value is not null
    order by name asc
  `,
    [store]
  );

  res.json(
    r.rows.map((x) => ({
      ...x,
      category: uiCategoryFromDb(x.category),
    }))
  );
});

// =========================
// Manager APIs
// =========================

app.post("/api/manager/login", async (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  const store = normStore(req.body?.store);

  if (!store) return err(res, 400, "Invalid store");
  if (!pin) return err(res, 400, "PIN required");
  if (pin !== String(MANAGER_PIN)) return err(res, 401, "Wrong PIN");

  const token = jwt.sign({ role: "manager", store }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

// ----- Items -----
app.get("/api/manager/items", requireManager, async (req, res) => {
  const store = normStore(req.query.store || req.manager?.store);
  if (!store) return err(res, 400, "Invalid store");

  const r = await q(
    `
    select id, store, name, category, sub_category, shelf_life_days, is_active
    from public.items
    where store=$1 and deleted_at is null
    order by category asc, name asc
  `,
    [store]
  );

  res.json(
    r.rows.map((x) => ({
      ...x,
      category: uiCategoryFromDb(x.category),
    }))
  );
});

app.post("/api/manager/items", requireManager, async (req, res) => {
  const store = normStore(req.body?.store || req.manager?.store);
  if (!store) return err(res, 400, "Invalid store");

  const name = String(req.body?.name || "").trim();
  const category = dbCategoryFromUi(String(req.body?.category || "").trim());
  const sub_category = req.body?.sub_category ? String(req.body.sub_category) : null;
  const shelf_life_days = Number(req.body?.shelf_life_days ?? 0);

  if (!name || !category) return err(res, 400, "Missing name/category");
  if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) return err(res, 400, "Invalid shelf life");

  const r = await q(
    `
    insert into public.items (store, name, category, sub_category, shelf_life_days, is_active)
    values ($1,$2,$3,$4,$5,true)
    returning id
  `,
    [store, name, category, sub_category, shelf_life_days]
  );

  res.json({ ok: true, id: r.rows[0]?.id });
});

app.patch("/api/manager/items/:id", requireManager, async (req, res) => {
  const store = normStore(req.body?.store || req.manager?.store);
  if (!store) return err(res, 400, "Invalid store");

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return err(res, 400, "Invalid id");

  const category = dbCategoryFromUi(String(req.body?.category || "").trim());
  const sub_category = req.body?.sub_category ? String(req.body.sub_category) : null;
  const shelf_life_days = Number(req.body?.shelf_life_days ?? 0);

  if (!category) return err(res, 400, "Missing category");
  if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) return err(res, 400, "Invalid shelf life");

  await q(
    `
    update public.items
    set category=$1, sub_category=$2, shelf_life_days=$3, updated_at=now()
    where id=$4 and store=$5 and deleted_at is null
  `,
    [category, sub_category, shelf_life_days, id, store]
  );

  res.json({ ok: true });
});

app.delete("/api/manager/items/:id", requireManager, async (req, res) => {
  const store = normStore(req.query.store || req.manager?.store);
  if (!store) return err(res, 400, "Invalid store");

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return err(res, 400, "Invalid id");

  await q(
    `
    update public.items
    set deleted_at=now(), is_active=false
    where id=$1 and store=$2 and deleted_at is null
  `,
    [id, store]
  );

  res.json({ ok: true });
});

// ----- Categories -----
app.get("/api/manager/categories", requireManager, async (req, res) => {
  const store = normStore(req.query.store || req.manager?.store);
  if (!store) return err(res, 400, "Invalid store");

  const r = await q(
    `
    select id, store, name, sort_order, is_active
    from public.categories
    where store=$1 and deleted_at is null
    order by sort_order asc, name asc
  `,
    [store]
  );

  res.json(
    r.rows.map((x) => ({
      ...x,
      name: uiCategoryFromDb(x.name),
    }))
  );
});

app.post("/api/manager/categories", requireManager, async (req, res) => {
  const store = normStore(req.body?.store || req.manager?.store);
  if (!store) return err(res, 400, "Invalid store");

  const nameUI = String(req.body?.name || "").trim();
  const name = dbCategoryFromUi(nameUI);
  const sort_order = Number(req.body?.sort_order ?? 100);

  if (!name) return err(res, 400, "Name required");

  await q(
    `
    insert into public.categories(store, name, sort_order, is_active)
    values($1,$2,$3,true)
  `,
    [store, name, Number.isFinite(sort_order) ? sort_order : 100]
  );

  res.json({ ok: true });
});

app.patch("/api/manager/categories/:id", requireManager, async (req, res) => {
  const store = normStore(req.body?.store || req.manager?.store);
  if (!store) return err(res, 400, "Invalid store");

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return err(res, 400, "Invalid id");

  const nameUI = String(req.body?.name || "").trim();
  const name = dbCategoryFromUi(nameUI);
  const sort_order = Number(req.body?.sort_order ?? 100);
  const is_active = req.body?.is_active === false ? false : true;

  if (!name) return err(res, 400, "Name required");

  await q(
    `
    update public.categories
    set name=$1, sort_order=$2, is_active=$3, updated_at=now()
    where id=$4 and store=$5 and deleted_at is null
  `,
    [name, Number.isFinite(sort_order) ? sort_order : 100, is_active, id, store]
  );

  res.json({ ok: true });
});

app.delete("/api/manager/categories/:id", requireManager, async (req, res) => {
  const store = normStore(req.query.store || req.manager?.store);
  if (!store) return err(res, 400, "Invalid store");

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return err(res, 400, "Invalid id");

  await q(
    `
    update public.categories
    set deleted_at=now(), is_active=false
    where id=$1 and store=$2 and deleted_at is null
  `,
    [id, store]
  );

  res.json({ ok: true });
});

// -------- Serve index.html for root --------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------- Start --------
app.listen(PORT, () => {
  console.log(`✅ PreCheck server running on :${PORT}`);
});
