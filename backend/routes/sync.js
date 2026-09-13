const express = require('express');
const router = express.Router();
const { syncEmitter } = require('../syncEmitter');

// SSE Endpoint for instant real-time synchronization
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

  const onDataChanged = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (e) {}
  };

  syncEmitter.on('change', onDataChanged);

  // Keep-alive heartbeat every 20 seconds to prevent connection drops
  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch (e) {}
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    syncEmitter.removeListener('change', onDataChanged);
  });
});

module.exports = router;
