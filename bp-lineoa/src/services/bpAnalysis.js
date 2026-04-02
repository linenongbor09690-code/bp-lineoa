/**
 * วิเคราะห์ระดับความเสี่ยงจากค่าความดันโลหิต
 * อ้างอิงเกณฑ์ JNC7 / กรมการแพทย์ไทย
 */

const RISK_LEVELS = {
  NORMAL: 'normal',
  RISK: 'risk',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * แยกค่า systolic/diastolic จากข้อความ
 * รองรับรูปแบบ: "130/85", "130 85", "130-85", "sys130 dia85"
 */
function parseBloodPressureText(text) {
  const patterns = [
    /(\d{2,3})\s*[\/\-\s]\s*(\d{2,3})/,
    /sys[a-z]*[:\s]*(\d{2,3})[^\d]+dia[a-z]*[:\s]*(\d{2,3})/i,
    /(\d{2,3})\s+(\d{2,3})/,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const sys = parseInt(m[1]);
      const dia = parseInt(m[2]);
      if (sys >= 60 && sys <= 300 && dia >= 40 && dia <= 200) {
        return { systolic: sys, diastolic: dia };
      }
    }
  }
  return null;
}

/**
 * จัดกลุ่มความเสี่ยงตามค่าความดัน
 */
function classifyRisk(systolic, diastolic) {
  // วิกฤต: ≥180/120 หรือ ≥180 หรือ ≥120
  if (systolic >= 180 || diastolic >= 120) {
    return RISK_LEVELS.CRITICAL;
  }
  // ป่วย/เริ่มคุมไม่ได้: 160-179 / 100-119
  if (systolic >= 160 || diastolic >= 100) {
    return RISK_LEVELS.HIGH;
  }
  // กลุ่มเสี่ยง: 140-159 / 90-99
  if (systolic >= 140 || diastolic >= 90) {
    return RISK_LEVELS.RISK;
  }
  // ปกติ: <140/<90
  return RISK_LEVELS.NORMAL;
}

/**
 * สร้างข้อความตอบกลับตามระดับความเสี่ยง
 */
function buildReplyMessage(systolic, diastolic, riskLevel, userName = '') {
  const name = userName ? `คุณ${userName}` : 'คุณ';
  const bpText = `${systolic}/${diastolic} mmHg`;
  const dateStr = new Intl.DateTimeFormat('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date());

  const messages = {
    [RISK_LEVELS.NORMAL]: {
      color: '🟢',
      header: 'ปกติ — ค่าความดันดีเยี่ยม!',
      body: `${name} ค่าความดันของคุณ ${bpText} อยู่ในเกณฑ์ปกติ\n\n✅ ขอบคุณที่ดูแลสุขภาพอย่างสม่ำเสมอ\n💊 รักษาพฤติกรรมสุขภาพที่ดีต่อไปนะคะ\n🥗 ลดเค็ม งดบุหรี่ ออกกำลังกายสม่ำเสมอ`,
      action: null,
    },
    [RISK_LEVELS.RISK]: {
      color: '🟡',
      header: 'กลุ่มเสี่ยง — ควรเฝ้าระวัง',
      body: `${name} ค่าความดัน ${bpText} อยู่ในระดับ "ก่อนความดันสูง"\n\n⚠️ แนะนำให้วัดซ้ำภายใน 7 วัน\n🧂 ลดอาหารเค็มและอาหารแปรรูป\n🚶 ออกกำลังกายเบาๆ 30 นาที/วัน\n😴 พักผ่อนให้เพียงพอ ลดความเครียด\n\n📅 บันทึก: ${dateStr}`,
      action: 'repeat_screening',
    },
    [RISK_LEVELS.HIGH]: {
      color: '🟠',
      header: 'ป่วย/เริ่มคุมไม่ได้ — ควรพบแพทย์',
      body: `${name} ค่าความดัน ${bpText} อยู่ในระดับ "ความดันสูงระยะที่ 2"\n\n🚨 กรุณาพบเจ้าหน้าที่ รพ.สต. โดยเร็ว\n💊 อย่าหยุดยาเองหากกำลังรักษาอยู่\n📞 อสม. ของท่านจะติดต่อเพื่อช่วยเหลือ\n\n📅 บันทึก: ${dateStr}`,
      action: 'notify_aorsormor',
    },
    [RISK_LEVELS.CRITICAL]: {
      color: '🔴',
      header: '⚠️ วิกฤต — ต้องการความช่วยเหลือทันที!',
      body: `${name} ค่าความดัน ${bpText} อยู่ในระดับ "วิกฤต/อันตราย"\n\n🆘 กรุณาอยู่นิ่งๆ อย่าเคลื่อนไหวมาก\n📞 ทีมงานกำลังแจ้ง อสม. และ รพ.สต. ทันที\n🚑 หากมีอาการหนัก: ปวดศีรษะรุนแรง ตามัว หน้าชา โทร 1669 ด่วน!\n\n📅 บันทึก: ${dateStr}`,
      action: 'notify_all_urgent',
    },
  };

  return messages[riskLevel];
}

/**
 * สร้าง LINE Flex Message สำหรับแสดงผล
 */
function buildFlexMessage(systolic, diastolic, riskLevel, userName = '') {
  const info = buildReplyMessage(systolic, diastolic, riskLevel, userName);

  const colorMap = {
    normal: '#27AE60',
    risk: '#F1C40F',
    high: '#E67E22',
    critical: '#E74C3C',
  };

  const bgMap = {
    normal: '#E8F8EE',
    risk: '#FEFBE8',
    high: '#FFF3E0',
    critical: '#FCEAEA',
  };

  return {
    type: 'flex',
    altText: `${info.color} ${info.header} — ค่าความดัน ${systolic}/${diastolic} mmHg`,
    contents: {
      type: 'bubble',
      styles: {
        body: { backgroundColor: bgMap[riskLevel] },
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: info.color,
                size: 'xxl',
                flex: 0,
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                margin: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: info.header,
                    weight: 'bold',
                    size: 'md',
                    color: colorMap[riskLevel],
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `${systolic}/${diastolic} mmHg`,
                    size: 'xxl',
                    weight: 'bold',
                    color: '#2C3E50',
                  },
                ],
              },
            ],
          },
          {
            type: 'separator',
          },
          {
            type: 'text',
            text: info.body,
            wrap: true,
            size: 'sm',
            color: '#444444',
          },
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
              label: 'ดูกราฟประวัติความดัน',
              uri: `https://bp-monitor-axo6.onrender.com/liff/dashboard.html`,
            },
            style: 'primary',
            color: colorMap[riskLevel],
          },
          {
            type: 'button',
            action: {
              type: 'message',
              label: 'วัดซ้ำ / ส่งค่าใหม่',
              text: 'ส่งค่าความดัน',
            },
            style: 'secondary',
            margin: 'sm',
          },
        ],
      },
    },
  };
}

module.exports = {
  RISK_LEVELS,
  parseBloodPressureText,
  classifyRisk,
  buildReplyMessage,
  buildFlexMessage,
};
