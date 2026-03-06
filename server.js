const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

// رابط قاعدة البيانات
const DATABASE_URL =
  "postgresql://bebo_kyj2_user:HbrInXu38r7BMKgH1ij3Cyv6kjiAHW3Y@dpg-d6j9qgpr0fns73bjutf0-a.oregon-postgres.render.com/bebo_kyj2";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// صفحة اختبار
app.get("/", (req, res) => {
  res.send("bank-bebo-api running ✅");
});

// إنشاء الجدول
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

// فتح حساب جديد
app.post("/create-account", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: "username & password required",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    let accountNumber;
    let createdAccount = null;

    for (let i = 0; i < 10; i++) {
      accountNumber = Math.floor(1000000 + Math.random() * 9000000);

      try {
        const r = await pool.query(
          `INSERT INTO accounts (account_number, username, password_hash, balance)
           VALUES ($1, $2, $3, $4)
           RETURNING id, account_number, username, balance, created_at`,
          [accountNumber, username, passwordHash, 2000]
        );

        createdAccount = r.rows[0];
        break;
      } catch (err) {
        if (err.code !== "23505") throw err;
      }
    }

    if (!createdAccount) {
      return res.status(500).json({
        ok: false,
        error: "failed to generate unique account number",
      });
    }

    res.json({ ok: true, account: createdAccount });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// جلب كل الحسابات
app.get("/accounts", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, account_number, username, balance, created_at
      FROM accounts
      ORDER BY id DESC
    `);

    res.json({ ok: true, accounts: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// جلب حساب واحد برقم الحساب
app.get("/account/:accountNumber", async (req, res) => {
  const { accountNumber } = req.params;

  try {
    const r = await pool.query(
      `SELECT id, account_number, username, balance, created_at
       FROM accounts
       WHERE account_number = $1
       LIMIT 1`,
      [accountNumber]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "account not found" });
    }

    res.json({ ok: true, account: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// تعديل الاسم باستخدام id
app.put("/accounts/:id/username", async (req, res) => {
  const { id } = req.params;
  const { username } = req.body || {};

  if (!username) {
    return res.status(400).json({ ok: false, error: "username required" });
  }

  try {
    const r = await pool.query(
      `UPDATE accounts
       SET username = $1
       WHERE id = $2
       RETURNING id, account_number, username, balance, created_at`,
      [username, id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "account not found" });
    }

    res.json({ ok: true, account: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// تعديل الرصيد باستخدام id
app.put("/accounts/:id/balance", async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body || {};

  if (typeof amount !== "number") {
    return res.status(400).json({ ok: false, error: "amount must be number" });
  }

  try {
    const r = await pool.query(
      `UPDATE accounts
       SET balance = balance + $1
       WHERE id = $2
       RETURNING id, account_number, username, balance, created_at`,
      [amount, id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "account not found" });
    }

    res.json({ ok: true, account: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// تغيير كلمة السر باستخدام id
app.put("/accounts/:id/password", async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body || {};

  if (!newPassword) {
    return res.status(400).json({ ok: false, error: "newPassword required" });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);

    const r = await pool.query(
      `UPDATE accounts
       SET password_hash = $1
       WHERE id = $2
       RETURNING id`,
      [hash, id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "account not found" });
    }

    res.json({ ok: true, message: "Password updated ✅" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
