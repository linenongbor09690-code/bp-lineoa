# 📋 คู่มือติดตั้งระบบติดตามความดันโลหิต LINE OA

## 🏗️ โครงสร้างระบบ

```
bp-lineoa/
├── src/
│   ├── server.js              # Entry point
│   ├── routes/
│   │   ├── webhook.js         # รับ Event จาก LINE
│   │   └── api.js             # REST API สำหรับ Dashboard
│   ├── services/
│   │   ├── bpAnalysis.js      # วิเคราะห์ค่าความดัน
│   │   ├── lineService.js     # ส่งข้อความผ่าน LINE API
│   │   └── ocrService.js      # อ่านรูปภาพด้วย OCR
│   └── models/
│       └── database.js        # SQLite Database
├── liff/
│   ├── dashboard.html         # กราฟส่วนตัว (ผู้ใช้)
│   ├── register.html          # ฟอร์มลงทะเบียน
│   └── staff-dashboard.html   # Dashboard เจ้าหน้าที่
├── .env.example
└── package.json
```

---

## ⚡ ขั้นตอนติดตั้ง

### 1. เตรียม LINE OA

1. ไปที่ [LINE Developers Console](https://developers.line.biz)
2. สร้าง **Provider** ใหม่
3. สร้าง **Messaging API Channel** (สำหรับ Webhook)
4. สร้าง **LIFF App** 2 ตัว (สำหรับ Dashboard และ Register)
5. คัดลอก:
   - `Channel Access Token` (ยาว)
   - `Channel Secret`
   - LIFF ID ของทั้งสอง App

### 2. ติดตั้ง Dependencies

```bash
cd bp-lineoa
npm install
```

### 3. ตั้งค่า Environment

```bash
cp .env.example .env
# แก้ไข .env ด้วย Editor ที่ชอบ
nano .env
```

### 4. เปิดใช้งาน

```bash
# Development (ทดสอบในเครื่อง)
npm run dev

# Production
npm start
```

### 5. Expose URL สำหรับ LINE Webhook

ตัวเลือกที่แนะนำ:

**ตัวเลือก A: ngrok (ทดสอบ)**
```bash
ngrok http 3000
# URL: https://xxxx.ngrok.io
```

**ตัวเลือก B: Railway (Deploy ฟรี)**
```bash
# 1. Push โค้ดขึ้น GitHub
# 2. ไปที่ railway.app → New Project → Deploy from GitHub
# 3. ใส่ Environment Variables ใน Railway Dashboard
# 4. ได้ URL เช่น https://bp-monitor.railway.app
```

**ตัวเลือก C: VPS / Server จริง**
```bash
# ใช้ PM2 รัน background
npm install -g pm2
pm2 start src/server.js --name bp-monitor
pm2 save
```

### 6. ตั้งค่า Webhook URL ใน LINE Console

```
Webhook URL: https://your-domain.com/webhook
```
- เปิด **Use webhook**: ON
- คลิก **Verify** ต้องขึ้น Success

### 7. อัปเดต LIFF ID ในไฟล์ HTML

แก้ไขในไฟล์ `liff/dashboard.html` และ `liff/register.html`:
```javascript
const LIFF_ID = 'ใส่ LIFF ID จริงที่นี่';
```

---

## 🔑 Rich Menu Setup

สร้าง Rich Menu ใน LINE Console หรือใช้ API:

```json
{
  "size": { "width": 2500, "height": 1686 },
  "selected": true,
  "name": "BP Monitor Menu",
  "chatBarText": "เมนู",
  "areas": [
    {
      "bounds": { "x": 0, "y": 0, "width": 1666, "height": 843 },
      "action": { "type": "uri", "uri": "https://liff.line.me/YOUR_REGISTER_LIFF_ID" }
    },
    {
      "bounds": { "x": 0, "y": 843, "width": 833, "height": 843 },
      "action": { "type": "uri", "uri": "https://liff.line.me/YOUR_HEALTH_LIFF_ID" }
    },
    {
      "bounds": { "x": 833, "y": 843, "width": 833, "height": 843 },
      "action": { "type": "uri", "uri": "https://liff.line.me/YOUR_DASHBOARD_LIFF_ID" }
    },
    {
      "bounds": { "x": 1666, "y": 843, "width": 834, "height": 843 },
      "action": { "type": "message", "text": "ติดต่อเจ้าหน้าที่" }
    }
  ]
}
```

---

## 📊 การเพิ่ม อสม. และเจ้าหน้าที่

เพิ่มข้อมูลด้วย SQLite โดยตรง:

```sql
-- เพิ่ม อสม.
INSERT INTO aorsormors (line_user_id, name, phone, village, moo)
VALUES ('Uxxx...', 'นาง สมใจ ใจดี', '081-xxx-xxxx', 'บ้านหนองใหญ่', 3);

-- เพิ่มเจ้าหน้าที่ รพ.สต.
INSERT INTO staff (line_user_id, name, role)
VALUES ('Uyyy...', 'นาย ประยุทธ์ รักสุขภาพ', 'เจ้าหน้าที่สาธารณสุข');

-- ผูก อสม. กับผู้ป่วย (อัปเดต aor_sor_mor_id)
UPDATE users SET aor_sor_mor_id = 1 WHERE moo = 3;
```

---

## 🎯 เกณฑ์การจัดกลุ่มความเสี่ยง

| ระดับ | Systolic | Diastolic | การดำเนินการ |
|-------|----------|-----------|--------------|
| 🟢 ปกติ | < 140 | < 90 | ตอบชื่นชม |
| 🟡 เสี่ยง | 140-159 | 90-99 | แนะนำคัดกรองซ้ำ |
| 🟠 ป่วย | 160-179 | 100-119 | แจ้ง อสม. |
| 🔴 วิกฤต | ≥ 180 | ≥ 120 | แจ้ง อสม. + รพ.สต. ด่วน |

---

## 🔧 OCR Configuration

**ตัวเลือก 1: Google Vision API (แนะนำ)**
- สร้าง Project ที่ [console.cloud.google.com](https://console.cloud.google.com)
- เปิด Cloud Vision API
- สร้าง API Key → ใส่ใน `GOOGLE_VISION_API_KEY`

**ตัวเลือก 2: Tesseract.js (ฟรี)**
```bash
npm install tesseract.js
# แล้วตั้ง USE_TESSERACT=true ใน .env
```

---

## 📱 วิธีใช้งานสำหรับผู้ป่วย

1. **Add Friend** LINE OA ของ รพ.สต.
2. กด **ลงทะเบียน** → เลือกกลุ่ม → กรอกข้อมูล
3. ส่งค่าความดัน: พิมพ์ `130/85` หรือ **ถ่ายรูปหน้าจอเครื่องวัด**
4. ระบบตอบกลับทันทีพร้อมแสดงระดับความเสี่ยง
5. กด **Dashboard** ดูกราฟแนวโน้มย้อนหลัง

---

## 🔐 Security

- เปลี่ยน `STAFF_API_KEY` เป็น Key แบบสุ่ม เช่น: `openssl rand -hex 32`
- ใช้ HTTPS เสมอใน Production
- ไม่ commit ไฟล์ `.env` ลง Git (ใส่ใน `.gitignore`)
