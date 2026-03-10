/**
 * Logger utility for SSS Token Backend Services
 */

import pino from 'pino';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Create a pino logger instance
 */
export const logger = pino({
  level: logLevel,
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

export default logger;
