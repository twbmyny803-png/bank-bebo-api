const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// صفحة اختبار
app.get("/", (req, res) => res.send("bank-bebo-api running ✅"));

// 1) إنشاء الجدول (مرة واحدة)
app.get("/init-db", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        account_number BIGINT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        balance NUMERIC(12,2) NOT NULL DEFAULT 2000,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    res.json({ ok: true, message: "DB ready ✅" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 2) فتح حساب
app.post("/create-account", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "username & password required" });
  }

  const accountNumber = Math.floor(1000000 + Math.random() * 9000000);
  const balance = 2000;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const r = await pool.query(
      `INSERT INTO accounts (account_number, username, password_hash, balance)
       VALUES ($1, $2, $3, $4)
       RETURNING id, account_number, username, balance, created_at`,
      [accountNumber, username, passwordHash, balance]
    );

    res.json({ ok: true, account: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 3) قائمة الحسابات (عرض)
app.get("/accounts", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, account_number, username, balance, created_at FROM accounts ORDER BY id DESC`
    );
    res.json({ ok: true, accounts: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 4) تعديل الاسم
app.put("/accounts/:id/username", async (req, res) => {
  const { id } = req.params;
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: "username required" });

  try {
    const r = await pool.query(
      `UPDATE accounts SET username=$1 WHERE id=$2 RETURNING id, account_number, username, balance, created_at`,
      [username, id]
    );
    res.json({ ok: true, account: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 5) تعديل الرصيد (زيادة/نقصان)
app.put("/accounts/:id/balance", async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body || {}; // مثال: 500 أو -200
  if (typeof amount !== "number") {
    return res.status(400).json({ ok: false, error: "amount must be number" });
  }

  try {
    const r = await pool.query(
      `UPDATE accounts SET balance = balance + $1 WHERE id=$2
       RETURNING id, account_number, username, balance, created_at`,
      [amount, id]
    );
    res.json({ ok: true, account: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 6) تغيير كلمة السر
app.put("/accounts/:id/password", async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body || {};
  if (!newPassword) return res.status(400).json({ ok: false, error: "newPassword required" });

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE accounts SET password_hash=$1 WHERE id=$2`, [hash, id]);
    res.json({ ok: true, message: "Password updated ✅" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on", PORT));
