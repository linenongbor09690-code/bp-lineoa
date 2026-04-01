const express = require('express');
const router = express.Router();

const db = require('../models/database');
const { parseBloodPressureText, classifyRisk, buildFlexMessage, RISK_LEVELS } = require('../services/bpAnalysis');
const lineService = require('../services/lineService');
const { extractBPFromImage } = require('../services/ocrService');

// ===== POST /webhook =====
router.post('/', async (req, res) => {
  res.status(200).send('OK'); // ตอบกลับ LINE ก่อนเสมอ

  const events = req.body.events || [];
  await Promise.all(events.map(handleEvent));
});

async function handleEvent(event) {
  try {
    if (event.type === 'follow') return handleFollow(event);
    if (event.type === 'message') return handleMessage(event);
    if (event.type === 'postback') return handlePostback(event);
  } catch (err) {
    console.error('Event handler error:', err);
  }
}

// ===== เมื่อ Follow LINE OA =====
async function handleFollow(event) {
  const lineUserId = event.source.userId;

  // ดึงข้อมูล Profile จาก LINE
  let profile = { displayName: 'ผู้ใช้งาน' };
  try {
    profile = await lineService.getClient().getProfile(lineUserId);
  } catch (_) {}

  // สร้างผู้ใช้ในฐานข้อมูล (ถ้ายังไม่มี)
  const existing = db.findUserByLineId(lineUserId);
  if (!existing) {
    db.createUser({
      line_user_id: lineUserId,
      display_name: profile.displayName,
      group_type: 'normal',
    });
  }

  await lineService.replyMessage(event.replyToken, [
    {
      type: 'text',
      text: `สวัสดีครับ คุณ${profile.displayName} 👋\n\nยินดีต้อนรับสู่ระบบติดตามความดันโลหิต\nรพ.สต. ของเรา\n\n📋 กรุณาลงทะเบียนก่อนใช้งานผ่านเมนูด้านล่างครับ`,
    },
    lineService.buildGroupTypeQuickReply(),
  ]);
}

// ===== จัดการข้อความ =====
async function handleMessage(event) {
  const lineUserId = event.source.userId;
  const { replyToken, message } = event;

  // รูปภาพ → OCR
  if (message.type === 'image') {
    return handleImageMessage(event, lineUserId, replyToken, message.id);
  }

  if (message.type !== 'text') return;

  const text = message.text.trim();

  // ===== คำสั่งลงทะเบียน =====
  if (text.startsWith('ลงทะเบียน:')) {
    const groupType = text.includes('เสี่ยง') ? 'risk' : 'patient';
    return handleRegistration(replyToken, lineUserId, groupType);
  }

  // ===== ส่งค่าความดัน =====
  const bpValue = parseBloodPressureText(text);
  if (bpValue) {
    return handleBPSubmission(replyToken, lineUserId, bpValue, 'text');
  }

  // ===== คำสั่งพิเศษ =====
  if (/^(ส่งค่าความดัน|วัดความดัน|บันทึกความดัน)/.test(text)) {
    return lineService.replyMessage(replyToken, lineService.buildBPPromptMessage());
  }

  if (/^(ประวัติ|ดูประวัติ|history)/.test(text)) {
    return handleHistory(replyToken, lineUserId);
  }

  if (/^(ลงทะเบียน|สมัคร|register)/.test(text)) {
    return lineService.replyMessage(replyToken, lineService.buildGroupTypeQuickReply());
  }

  if (/^(ช่วยเหลือ|help|เมนู|menu)/.test(text)) {
    return handleHelp(replyToken);
  }

  // Default
  await lineService.replyMessage(replyToken, {
    type: 'text',
    text: `ขออภัย ไม่เข้าใจคำสั่ง\n\nพิมพ์ค่าความดัน เช่น "130/85"\nหรือพิมพ์ "เมนู" เพื่อดูตัวเลือก`,
  });
}

// ===== ลงทะเบียน =====
async function handleRegistration(replyToken, lineUserId, groupType) {
  db.updateUser(lineUserId, { group_type: groupType });
  const label = groupType === 'risk' ? 'กลุ่มเสี่ยง' : 'กลุ่มป่วย';

  await lineService.replyMessage(replyToken, [
    {
      type: 'text',
      text: `✅ ลงทะเบียน${label}เรียบร้อยแล้วครับ\n\nกรุณาส่งข้อมูลส่วนตัวเพิ่มเติมผ่านลิงก์ด้านล่าง\n(ชื่อ-สกุล, เลขบัตร, ที่อยู่)`,
    },
    {
      type: 'flex',
      altText: 'กรอกข้อมูลส่วนตัว',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: '📝 กรอกข้อมูลส่วนตัว', weight: 'bold', size: 'lg' },
            { type: 'text', text: 'กรุณากรอกข้อมูลให้ครบถ้วนเพื่อการดูแลที่ดีที่สุด', wrap: true, color: '#888888', size: 'sm', margin: 'sm' },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: 'กรอกข้อมูลส่วนตัว',
                uri: `${process.env.LIFF_BASE_URL}/liff/register.html`,
              },
              style: 'primary',
              color: '#2D6BCD',
            },
          ],
        },
      },
    },
  ]);
}

// ===== รับและวิเคราะห์ค่าความดัน (ข้อความ) =====
async function handleBPSubmission(replyToken, lineUserId, bpValue, source, imageUrl = null) {
  const { systolic, diastolic } = bpValue;
  const riskLevel = classifyRisk(systolic, diastolic);

  const user = db.findUserByLineId(lineUserId);
  if (!user) {
    return lineService.replyMessage(replyToken, {
      type: 'text',
      text: 'กรุณาลงทะเบียนก่อนใช้งาน พิมพ์ "ลงทะเบียน"',
    });
  }

  // บันทึกลงฐานข้อมูล
  db.saveBPRecord({
    user_id: user.id,
    systolic,
    diastolic,
    pulse: null,
    risk_level: riskLevel,
    source,
    image_url: imageUrl,
    note: null,
  });

  // ส่ง Flex Message ตอบกลับผู้ใช้
  const flexMsg = buildFlexMessage(systolic, diastolic, riskLevel, user.first_name || user.display_name);
  await lineService.replyMessage(replyToken, flexMsg);

  // ===== แจ้งเตือนตามระดับ =====
  if (riskLevel === RISK_LEVELS.HIGH || riskLevel === RISK_LEVELS.CRITICAL) {
    // แจ้ง อสม.
    if (user.aor_sor_mor_id) {
      const aorsormor = db.getAorsormor(user.aor_sor_mor_id);
      if (aorsormor?.line_user_id) {
        await lineService.notifyAorsormor(aorsormor.line_user_id, user, { systolic, diastolic, riskLevel });
        db.saveNotification({
          user_id: user.id,
          recipient_type: 'aorsormor',
          recipient_line_id: aorsormor.line_user_id,
          message: `BP ${systolic}/${diastolic}`,
          risk_level: riskLevel,
        });
      }
    }
  }

  if (riskLevel === RISK_LEVELS.CRITICAL) {
    // แจ้งเจ้าหน้าที่ รพ.สต. ทุกคน
    const staffList = db.getAllStaff();
    const staffLineIds = staffList.map(s => s.line_user_id).filter(Boolean);
    if (staffLineIds.length > 0) {
      await lineService.notifyStaff(staffLineIds, user, { systolic, diastolic, riskLevel });
      staffLineIds.forEach(lineId => {
        db.saveNotification({
          user_id: user.id,
          recipient_type: 'staff',
          recipient_line_id: lineId,
          message: `BP ${systolic}/${diastolic} CRITICAL`,
          risk_level: riskLevel,
        });
      });
    }
  }
}

// ===== รับรูปภาพ → OCR =====
async function handleImageMessage(event, lineUserId, replyToken, messageId) {
  // แจ้งผู้ใช้ว่ากำลังประมวลผล
  await lineService.replyMessage(replyToken, {
    type: 'text',
    text: '🔍 กำลังอ่านค่าความดันจากรูปภาพ กรุณารอสักครู่...',
  });

  const bpValue = await extractBPFromImage(messageId, process.env.LINE_CHANNEL_ACCESS_TOKEN);

  if (!bpValue) {
    // ถ้า OCR ไม่ได้ผล
    const imageUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    await lineService.pushMessage(lineUserId, {
      type: 'text',
      text: 'ขออภัย อ่านค่าจากรูปไม่ได้ชัดเจนครับ 🙏\n\nกรุณาพิมพ์ตัวเลขแทน เช่น "130/85"',
    });
    return;
  }

  const imageUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  await handleBPSubmission(null, lineUserId, bpValue, 'image', imageUrl);

  // Push แทน reply เพราะ replyToken หมดอายุแล้ว
  const user = db.findUserByLineId(lineUserId);
  const { systolic, diastolic } = bpValue;
  const riskLevel = classifyRisk(systolic, diastolic);
  const flexMsg = buildFlexMessage(systolic, diastolic, riskLevel, user?.first_name);
  await lineService.pushMessage(lineUserId, flexMsg);
}

// ===== ดูประวัติ =====
async function handleHistory(replyToken, lineUserId) {
  const user = db.findUserByLineId(lineUserId);
  if (!user) {
    return lineService.replyMessage(replyToken, {
      type: 'text', text: 'กรุณาลงทะเบียนก่อนครับ',
    });
  }

  const records = db.getBPHistory(user.id, 7);

  if (records.length === 0) {
    return lineService.replyMessage(replyToken, {
      type: 'text', text: 'ยังไม่มีประวัติการวัดความดันในช่วง 7 วันที่ผ่านมาครับ',
    });
  }

  const lines = records.slice(-5).map(r => {
    const date = new Date(r.measured_at).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
    const icon = { normal: '🟢', risk: '🟡', high: '🟠', critical: '🔴' }[r.risk_level] || '⚪';
    return `${icon} ${date}: ${r.systolic}/${r.diastolic} mmHg`;
  });

  await lineService.replyMessage(replyToken, [
    {
      type: 'text',
      text: `📊 ประวัติค่าความดัน 7 วันล่าสุด:\n\n${lines.join('\n')}`,
    },
    {
      type: 'flex',
      altText: 'ดูกราฟประวัติ',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: 'ดูกราฟแนวโน้มแบบละเอียด', weight: 'bold' },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: 'เปิด Dashboard',
                uri: `${process.env.LIFF_BASE_URL}/liff/dashboard.html`,
              },
              style: 'primary',
              color: '#2A7A6A',
            },
          ],
        },
      },
    },
  ]);
}

// ===== Help Menu =====
async function handleHelp(replyToken) {
  await lineService.replyMessage(replyToken, {
    type: 'text',
    text: `📋 เมนูการใช้งาน\n\n1️⃣ ส่งค่าความดัน — พิมพ์ "130/85" หรือส่งรูปถ่าย\n2️⃣ ดูประวัติ — พิมพ์ "ประวัติ"\n3️⃣ ลงทะเบียน — พิมพ์ "ลงทะเบียน"\n4️⃣ ประเมินสุขภาพ — ผ่านเมนูด้านล่าง\n5️⃣ ติดต่อเจ้าหน้าที่ — พิมพ์ "ติดต่อ"`,
  });
}

// ===== Postback =====
async function handlePostback(event) {
  const { data } = event.postback;
  console.log('Postback:', data);
}

module.exports = router;
