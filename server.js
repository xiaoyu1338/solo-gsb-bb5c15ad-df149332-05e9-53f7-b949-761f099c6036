'use strict';

const path = require('node:path');
const express = require('express');
const { layout, batchLayout } = require('./src/packer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/layout', (req, res) => {
  try {
    const body = req.body || {};
    const result = layout(body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || '输入无效' });
  }
});

// 批量排产：最多用纸张数内逐张排样，返回各张独立布局与汇总
app.post('/api/batch-layout', (req, res) => {
  try {
    const body = req.body || {};
    const result = batchLayout(body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || '输入无效' });
  }
});

app.listen(PORT, () => {
  console.log(`单张纸裁切试排服务已启动: http://localhost:${PORT}`);
});

module.exports = app;
