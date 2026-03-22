import pino from 'pino';
import { EventEmitter } from 'events';
import { Writable } from 'stream';

const level = process.env.LOG_LEVEL || 'info';

// Broadcast emitter for log streaming to SSE clients
export const logBroadcast = new EventEmitter();
logBroadcast.setMaxListeners(50);

// Custom writable stream that emits to both stdout and SSE clients
const broadcastStream = new Writable({
  write(chunk, _encoding, callback) {
    const line = chunk.toString();
    process.stdout.write(line);
    logBroadcast.emit('log', line.trim());
    callback();
  },
});

export const logger = pino({
  level,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}, broadcastStream);
