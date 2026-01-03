const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test route
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("select 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all items
app.get("/api/items", async (req, res) => {
  const { rows } = await pool.query(
    "select id, name, category from items order by category, name"
  );
  res.json(rows);
});

// Save stock log
app.post("/api/log", async (req, res) => {
  const { store, staff, item_id, quantity, expiry } = req.body;

  if (!store || !staff || !item_id) {
    return res.status(400).json({ error: "Missing data" });
  }

  await pool.query(
    `insert into stock_logs (store, staff, item_id, quantity, expiry)
     values ($1, $2, $3, $4, $5)`,
    [store, staff, item_id, quantity, expiry]
  );

  res.json({ success: true });
});

// Expiring today or earlier
app.get("/api/expiry", async (req, res) => {
  const { store } = req.query;

  const { rows } = await pool.query(
    `
    select i.name, s.quantity, s.expiry
    from stock_logs s
    join items i on i.id = s.item_id
    where s.store = $1
      and s.expiry <= current_date
    order by s.expiry
    `,
    [store]
  );

  res.json(rows);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("PreCheck running on port", port);
});
