import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

// ---- API routes must stay ABOVE the static catch-all ----
// IMPORTANT: keep your existing /api/items, /api/log, /api/expiry routes here
// Example placeholder:
// app.get("/api/items", async (req, res) => { ... });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve /public files (index.html, app.js, style.css, icons, manifest, etc.)
app.use(express.static(path.join(__dirname, "public")));

// Always return index.html for the main app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("PreCheck running on port", PORT));
