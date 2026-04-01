const express = require('express');
const router = express.Router();
const db = require('../models/database');

// Middleware ตรวจสอบ API Key สำหรับเจ้าหน้าที่
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!process.env.STAFF_API_KEY || key === process.env.STAFF_API_KEY) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// ===== Dashboard Stats =====
router.get('/dashboard/stats', requireApiKey, (req, res) => {
  try {
    const stats = db.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== รายชื่อผู้ใช้ทั้งหมด =====
router.get('/users', requireApiKey, (req, res) => {
  try {
    const { limit = 50, offset = 0, group_type } = req.query;
    let users = db.getAllUsers(parseInt(limit), parseInt(offset));
    if (group_type) users = users.filter(u => u.group_type === group_type);
    res.json({ success: true, data: users, count: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ประวัติค่าความดันรายบุคคล =====
router.get('/users/:userId/bp', requireApiKey, (req, res) => {
  try {
    const records = db.getUserBPDetail(req.params.userId);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== LIFF: บันทึกข้อมูลส่วนตัว =====
router.post('/register', (req, res) => {
  try {
    const { line_user_id, first_name, last_name, id_card, phone, village, moo, tambon, amphoe, group_type } = req.body;
    if (!line_user_id) return res.status(400).json({ error: 'line_user_id required' });

    db.updateUser(line_user_id, { first_name, last_name, id_card, phone, village, moo, tambon, amphoe, group_type });
    res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== LIFF: ดูประวัติรายบุคคล (สำหรับ Dashboard ใน LIFF) =====
router.get('/my-bp/:lineUserId', (req, res) => {
  try {
    const user = db.findUserByLineId(req.params.lineUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const records = db.getBPHistory(user.id, 30);
    res.json({ success: true, data: records, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Health Check =====
router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

module.exports = router;
