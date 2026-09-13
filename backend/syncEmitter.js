const EventEmitter = require('events');

class SyncEmitter extends EventEmitter {}

const syncEmitter = new SyncEmitter();
syncEmitter.setMaxListeners(200);

const notifyChange = (type = 'DATA_CHANGED', payload = {}) => {
  try {
    syncEmitter.emit('change', { type, payload, timestamp: Date.now() });
  } catch (e) {
    console.error('Error emitting sync change:', e);
  }
};

module.exports = { syncEmitter, notifyChange };
