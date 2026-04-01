const axios = require('axios');
const { parseBloodPressureText } = require('./bpAnalysis');

/**
 * ดาวน์โหลดรูปภาพจาก LINE และส่ง OCR
 * ใช้ Google Cloud Vision API
 */
async function extractBPFromImage(messageId, lineAccessToken) {
  try {
    // 1. ดาวน์โหลดรูปจาก LINE Content API
    const imageResponse = await axios.get(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: { Authorization: `Bearer ${lineAccessToken}` },
        responseType: 'arraybuffer',
      }
    );

    const imageBase64 = Buffer.from(imageResponse.data).toString('base64');

    // 2. ส่งไป Google Vision OCR
    if (process.env.GOOGLE_VISION_API_KEY) {
      const visionResponse = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
        {
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: 'TEXT_DETECTION', maxResults: 10 }],
            },
          ],
        }
      );

      const texts = visionResponse.data.responses[0]?.textAnnotations;
      if (texts && texts.length > 0) {
        const fullText = texts[0].description;
        console.log('OCR Result:', fullText);
        const bp = parseBloodPressureText(fullText);
        if (bp) return bp;
      }
    }

    // Fallback: ใช้ Tesseract.js ถ้าไม่มี Google Vision
    if (process.env.USE_TESSERACT === 'true') {
      return await extractWithTesseract(imageBase64);
    }

    return null;
  } catch (err) {
    console.error('OCR Error:', err.message);
    return null;
  }
}

/**
 * Fallback OCR ด้วย Tesseract.js (ไม่ต้องใช้ API key)
 */
async function extractWithTesseract(imageBase64) {
  try {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('tha+eng');
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();
    return parseBloodPressureText(text);
  } catch (err) {
    console.error('Tesseract error:', err.message);
    return null;
  }
}

module.exports = { extractBPFromImage };
