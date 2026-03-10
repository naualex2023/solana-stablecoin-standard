"use strict";
/**
 * Logger utility for SSS Token Backend Services
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';
/**
 * Create a pino logger instance
 */
exports.logger = (0, pino_1.default)({
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
function createLogger(context) {
    return exports.logger.child(context);
}
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map