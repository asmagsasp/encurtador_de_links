// db.js — Conexão flexível: Turso LibSQL (Nuvem/Vercel) ou SQLite local (file:links.db)
require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const isTurso = Boolean(process.env.TURSO_DATABASE_URL);
const dbUrl = isTurso
  ? process.env.TURSO_DATABASE_URL
  : `file:${path.join(__dirname, 'links.db')}`;

const client = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Helpers assíncronos compatíveis com estilo SQLite
const db = {
  client,
  isTurso,

  async get(sql, args = []) {
    const res = await client.execute({ sql, args });
    return res.rows[0] ? { ...res.rows[0] } : null;
  },

  async all(sql, args = []) {
    const res = await client.execute({ sql, args });
    return res.rows.map(r => ({ ...r }));
  },

  async run(sql, args = []) {
    const res = await client.execute({ sql, args });
    return {
      lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : null,
      rowsAffected: res.rowsAffected,
    };
  },

  async exec(sql) {
    // Quebra comandos separados por ponto e vírgula se necessário
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await client.execute(stmt);
    }
  },

  async initSchema() {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_url TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        clicks INTEGER DEFAULT 0,
        expires_at DATETIME DEFAULT NULL,
        max_clicks INTEGER DEFAULT NULL,
        og_data TEXT DEFAULT NULL,
        user_id INTEGER DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS clicks_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_id INTEGER NOT NULL,
        clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        plan TEXT DEFAULT 'free',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrations seguras
    const cols = [
      'expires_at DATETIME DEFAULT NULL',
      'max_clicks INTEGER DEFAULT NULL',
      'og_data TEXT DEFAULT NULL',
      'user_id INTEGER DEFAULT NULL',
    ];
    for (const col of cols) {
      try { await client.execute(`ALTER TABLE links ADD COLUMN ${col}`); } catch {}
    }

    // Inicializa plano padrão se não existir
    const defaultPlan = await db.get('SELECT value FROM settings WHERE key = ?', ['current_plan']);
    if (!defaultPlan) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['current_plan', 'free']);
    }
  }
};

module.exports = db;
