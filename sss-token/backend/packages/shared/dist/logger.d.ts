/**
 * Logger utility for SSS Token Backend Services
 */
import pino from 'pino';
/**
 * Create a pino logger instance
 */
export declare const logger: import("pino").Logger<never>;
/**
 * Create a child logger with additional context
 */
export declare function createLogger(context: Record<string, unknown>): pino.Logger<never>;
export default logger;
//# sourceMappingURL=logger.d.ts.map