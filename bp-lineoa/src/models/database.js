const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/bp_monitor.db');

let db;

function getDB() {
  if (!db) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

async function initDB() {
  const db = getDB();

  db.exec(`
    -- ตารางผู้ใช้
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT UNIQUE NOT NULL,
      display_name TEXT,
      first_name TEXT,
      last_name TEXT,
      id_card TEXT UNIQUE,
      phone TEXT,
      village TEXT,
      moo INTEGER,
      tambon TEXT,
      amphoe TEXT,
      group_type TEXT DEFAULT 'normal' CHECK(group_type IN ('normal','risk','patient')),
      aor_sor_mor_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ตาราง อสม.
    CREATE TABLE IF NOT EXISTS aorsormors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      village TEXT,
      moo INTEGER,
      notify_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ตารางบันทึกค่าความดัน
    CREATE TABLE IF NOT EXISTS bp_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      systolic INTEGER NOT NULL,
      diastolic INTEGER NOT NULL,
      pulse INTEGER,
      risk_level TEXT NOT NULL CHECK(risk_level IN ('normal','risk','high','critical')),
      source TEXT DEFAULT 'text' CHECK(source IN ('text','image')),
      image_url TEXT,
      measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      note TEXT
    );

    -- ตารางการแจ้งเตือน
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      recipient_type TEXT CHECK(recipient_type IN ('user','aorsormor','staff')),
      recipient_line_id TEXT,
      message TEXT,
      risk_level TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'sent'
    );

    -- ตาราง เจ้าหน้าที่ รพ.สต.
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT UNIQUE,
      name TEXT,
      role TEXT,
      notify_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Index สำหรับ query เร็ว
    CREATE INDEX IF NOT EXISTS idx_bp_user_time ON bp_records(user_id, measured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_line ON users(line_user_id);
    CREATE INDEX IF NOT EXISTS idx_bp_risk ON bp_records(risk_level, measured_at DESC);
  `);

  console.log('Database initialized');
  return db;
}

// ===== User Queries =====

function findUserByLineId(lineUserId) {
  return getDB().prepare(`
    SELECT u.*, a.name as aorsormor_name 
    FROM users u 
    LEFT JOIN aorsormors a ON u.aor_sor_mor_id = a.id
    WHERE u.line_user_id = ?
  `).get(lineUserId);
}

function createUser(data) {
  return getDB().prepare(`
    INSERT INTO users (line_user_id, display_name, group_type)
    VALUES (@line_user_id, @display_name, @group_type)
  `).run(data);
}

function updateUser(lineUserId, data) {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
  return getDB().prepare(`
    UPDATE users SET ${fields}, updated_at = CURRENT_TIMESTAMP
    WHERE line_user_id = @line_user_id
  `).run({ ...data, line_user_id: lineUserId });
}

// ===== BP Record Queries =====

function saveBPRecord(data) {
  return getDB().prepare(`
    INSERT INTO bp_records (user_id, systolic, diastolic, pulse, risk_level, source, image_url, note)
    VALUES (@user_id, @systolic, @diastolic, @pulse, @risk_level, @source, @image_url, @note)
  `).run(data);
}

function getBPHistory(userId, days = 30) {
  return getDB().prepare(`
    SELECT * FROM bp_records
    WHERE user_id = ? AND measured_at >= datetime('now', '-' || ? || ' days')
    ORDER BY measured_at ASC
  `).all(userId, days);
}

function getLatestBP(userId) {
  return getDB().prepare(`
    SELECT * FROM bp_records WHERE user_id = ? ORDER BY measured_at DESC LIMIT 1
  `).get(userId);
}

// ===== Dashboard Queries =====

function getDashboardStats() {
  const db = getDB();
  return {
    total_users: db.prepare(`SELECT COUNT(*) as c FROM users`).get().c,
    risk_users: db.prepare(`SELECT COUNT(*) as c FROM users WHERE group_type = 'risk'`).get().c,
    patient_users: db.prepare(`SELECT COUNT(*) as c FROM users WHERE group_type = 'patient'`).get().c,
    today_records: db.prepare(`
      SELECT COUNT(*) as c FROM bp_records WHERE date(measured_at) = date('now')
    `).get().c,
    critical_today: db.prepare(`
      SELECT COUNT(*) as c FROM bp_records 
      WHERE risk_level = 'critical' AND date(measured_at) = date('now')
    `).get().c,
    risk_distribution: db.prepare(`
      SELECT risk_level, COUNT(*) as count 
      FROM bp_records WHERE measured_at >= datetime('now', '-30 days')
      GROUP BY risk_level
    `).all(),
    daily_trend: db.prepare(`
      SELECT date(measured_at) as date,
        ROUND(AVG(systolic)) as avg_sys,
        ROUND(AVG(diastolic)) as avg_dia,
        COUNT(*) as count
      FROM bp_records
      WHERE measured_at >= datetime('now', '-14 days')
      GROUP BY date(measured_at)
      ORDER BY date ASC
    `).all(),
  };
}

function getAllUsers(limit = 50, offset = 0) {
  return getDB().prepare(`
    SELECT u.*, 
      (SELECT systolic || '/' || diastolic FROM bp_records WHERE user_id = u.id ORDER BY measured_at DESC LIMIT 1) as last_bp,
      (SELECT risk_level FROM bp_records WHERE user_id = u.id ORDER BY measured_at DESC LIMIT 1) as last_risk,
      (SELECT measured_at FROM bp_records WHERE user_id = u.id ORDER BY measured_at DESC LIMIT 1) as last_measured
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getUserBPDetail(userId) {
  return getDB().prepare(`
    SELECT * FROM bp_records WHERE user_id = ?
    ORDER BY measured_at DESC LIMIT 90
  `).all(userId);
}

function getAorsormor(id) {
  return getDB().prepare(`SELECT * FROM aorsormors WHERE id = ?`).get(id);
}

function getAllStaff() {
  return getDB().prepare(`SELECT * FROM staff`).all();
}

function saveNotification(data) {
  return getDB().prepare(`
    INSERT INTO notifications (user_id, recipient_type, recipient_line_id, message, risk_level)
    VALUES (@user_id, @recipient_type, @recipient_line_id, @message, @risk_level)
  `).run(data);
}

module.exports = {
  getDB, initDB,
  findUserByLineId, createUser, updateUser,
  saveBPRecord, getBPHistory, getLatestBP,
  getDashboardStats, getAllUsers, getUserBPDetail,
  getAorsormor, getAllStaff, saveNotification,
};
