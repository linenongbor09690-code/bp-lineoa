const { Client } = require('@line/bot-sdk');

let client;

function getClient() {
  if (!client) {
    client = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  }
  return client;
}

/**
 * ตอบกลับข้อความใน Webhook
 */
async function replyMessage(replyToken, messages) {
  const msgs = Array.isArray(messages) ? messages : [messages];
  return getClient().replyMessage(replyToken, msgs);
}

/**
 * Push message ไปยัง userId โดยตรง
 */
async function pushMessage(lineUserId, messages) {
  const msgs = Array.isArray(messages) ? messages : [messages];
  return getClient().pushMessage(lineUserId, msgs);
}

/**
 * ส่งข้อความแจ้งเตือน อสม. เมื่อผู้ป่วยมีค่าความดันสูง
 */
async function notifyAorsormor(aorsormorLineId, patientData, bpData) {
  const { systolic, diastolic, riskLevel } = bpData;
  const levelText = { high: 'สูงระดับที่ 2 🟠', critical: 'วิกฤต! 🔴' }[riskLevel] || riskLevel;

  const message = {
    type: 'flex',
    altText: `แจ้งเตือน: ${patientData.first_name || patientData.display_name} มีค่าความดัน ${systolic}/${diastolic}`,
    contents: {
      type: 'bubble',
      styles: {
        header: { backgroundColor: riskLevel === 'critical' ? '#E74C3C' : '#E67E22' },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: riskLevel === 'critical' ? '🚨 แจ้งเตือนด่วน — วิกฤต!' : '⚠️ แจ้งเตือน — ความดันสูง',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'md',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: 'ชื่อ:', color: '#888888', size: 'sm', flex: 2 },
              {
                type: 'text',
                text: `${patientData.first_name || ''} ${patientData.last_name || patientData.display_name}`,
                color: '#333333',
                size: 'sm',
                flex: 5,
                weight: 'bold',
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: 'ค่าความดัน:', color: '#888888', size: 'sm', flex: 2 },
              {
                type: 'text',
                text: `${systolic}/${diastolic} mmHg`,
                color: riskLevel === 'critical' ? '#E74C3C' : '#E67E22',
                size: 'lg',
                weight: 'bold',
                flex: 5,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: 'ระดับ:', color: '#888888', size: 'sm', flex: 2 },
              { type: 'text', text: levelText, color: '#333333', size: 'sm', flex: 5 },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: 'บ้านเลขที่:', color: '#888888', size: 'sm', flex: 2 },
              {
                type: 'text',
                text: `ม.${patientData.moo || '-'} ${patientData.village || '-'}`,
                color: '#333333',
                size: 'sm',
                flex: 5,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: 'โทร:', color: '#888888', size: 'sm', flex: 2 },
              { type: 'text', text: patientData.phone || 'ไม่ระบุ', color: '#0066CC', size: 'sm', flex: 5 },
            ],
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'text',
            text: riskLevel === 'critical'
              ? 'กรุณาดำเนินการส่งตัวพบเจ้าหน้าที่ รพ.สต. หรือโรงพยาบาลโดยด่วน!'
              : 'กรุณาติดต่อและนำส่งพบเจ้าหน้าที่ รพ.สต.',
            wrap: true,
            size: 'sm',
            color: '#555555',
            margin: 'sm',
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
              label: 'โทรหาผู้ป่วย',
              uri: `tel:${patientData.phone || ''}`,
            },
            style: 'primary',
            color: '#E74C3C',
          },
        ],
      },
    },
  };

  return pushMessage(aorsormorLineId, message);
}

/**
 * ส่งแจ้งเตือนเจ้าหน้าที่ รพ.สต.
 */
async function notifyStaff(staffLineIds, patientData, bpData) {
  const { systolic, diastolic, riskLevel } = bpData;
  const promises = staffLineIds.map(lineId =>
    pushMessage(lineId, {
      type: 'text',
      text: `🔴 แจ้งเตือนด่วน รพ.สต.\n\nผู้ป่วย: ${patientData.first_name || patientData.display_name} ${patientData.last_name || ''}\nค่าความดัน: ${systolic}/${diastolic} mmHg (วิกฤต)\nหมู่ที่: ${patientData.moo || '-'} ${patientData.village || ''}\nโทร: ${patientData.phone || 'ไม่ระบุ'}\n\nกรุณาดำเนินการทันที!`,
    })
  );
  return Promise.allSettled(promises);
}

/**
 * ส่ง Quick Reply ตัวเลือกกลุ่ม
 */
function buildGroupTypeQuickReply() {
  return {
    type: 'text',
    text: 'กรุณาเลือกประเภทการลงทะเบียน:',
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '👥 กลุ่มเสี่ยง', text: 'ลงทะเบียน:กลุ่มเสี่ยง' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '🏥 กลุ่มป่วย', text: 'ลงทะเบียน:กลุ่มป่วย' },
        },
      ],
    },
  };
}

/**
 * ส่งข้อความรับบีพี
 */
function buildBPPromptMessage() {
  return {
    type: 'text',
    text: 'กรุณาส่งค่าความดันโลหิตของคุณ:\n\n📝 พิมพ์ตัวเลข เช่น "130/85"\n🖼️ หรือถ่ายรูปหน้าจอเครื่องวัดความดันส่งมาได้เลย',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '120/80 (ตัวอย่าง)', text: '120/80' } },
        { type: 'action', action: { type: 'camera', label: '📷 ถ่ายรูปเครื่องวัด' } },
        { type: 'action', action: { type: 'cameraRoll', label: '🖼️ เลือกรูปภาพ' } },
      ],
    },
  };
}

module.exports = {
  getClient,
  replyMessage,
  pushMessage,
  notifyAorsormor,
  notifyStaff,
  buildGroupTypeQuickReply,
  buildBPPromptMessage,
};
