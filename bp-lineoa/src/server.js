const express = require('express');
const { middleware } = require('@line/bot-sdk');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const webhookRouter = require('./routes/webhook');
const apiRouter = require('./routes/api');
const { initDB } = require('./models/database');

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}));

// LINE Webhook (ต้องใช้ raw body)
app.use('/webhook', middleware(lineConfig), webhookRouter);

// REST API (JSON)
app.use(express.json());
app.use('/api', apiRouter);

// LIFF Static Files
app.use('/liff', express.static(path.join(__dirname, '../liff')));

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`BP Monitor LINE OA running on port ${PORT}`);
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

module.exports = app;
