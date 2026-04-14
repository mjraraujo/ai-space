/**
 * Logger — pino-compatible structured JSON logger for the AI Space server.
 *
 * Outputs newline-delimited JSON to stdout. Each entry includes:
 *   level, time (Unix ms), pid, hostname, msg, and any extra fields.
 *
 * Usage:
 *   import { createLogger } from './logger.js';
 *   const log = createLogger('model-manager');
 *   log.info({ modelId }, 'Model pulled');
 *   log.error({ err }, 'Pull failed');
 */

import { hostname } from 'node:os';

const PID = process.pid;
const HOST = hostname();

// pino numeric levels
const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

/** @param {string} [name] component name shown in the 'name' field */
export function createLogger(name) {
  function write(levelName, fields, msg) {
    const entry = {
      level: LEVELS[levelName],
      time: Date.now(),
      pid: PID,
      hostname: HOST,
      ...(name && { name }),
      ...fields,
      msg
    };
    // Serialize Error objects nicely
    if (entry.err instanceof Error) {
      entry.err = { message: entry.err.message, stack: entry.err.stack, type: entry.err.name };
    }
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  return {
    trace: (fields, msg) => write('trace', typeof fields === 'string' ? {} : fields, typeof fields === 'string' ? fields : msg),
    debug: (fields, msg) => write('debug', typeof fields === 'string' ? {} : fields, typeof fields === 'string' ? fields : msg),
    info:  (fields, msg) => write('info',  typeof fields === 'string' ? {} : fields, typeof fields === 'string' ? fields : msg),
    warn:  (fields, msg) => write('warn',  typeof fields === 'string' ? {} : fields, typeof fields === 'string' ? fields : msg),
    error: (fields, msg) => write('error', typeof fields === 'string' ? {} : fields, typeof fields === 'string' ? fields : msg),
    fatal: (fields, msg) => write('fatal', typeof fields === 'string' ? {} : fields, typeof fields === 'string' ? fields : msg),
    child: (bindings) => createLogger(bindings.name || name)
  };
}

/** Application-wide root logger */
export const rootLogger = createLogger('ai-space-server');
