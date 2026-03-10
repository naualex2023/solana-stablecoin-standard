"use strict";
/**
 * Redis client for SSS Token Backend Services
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRedis = initRedis;
exports.getRedis = getRedis;
exports.closeRedis = closeRedis;
exports.publish = publish;
exports.subscribe = subscribe;
exports.setKey = setKey;
exports.getKey = getKey;
exports.deleteKey = deleteKey;
exports.exists = exists;
exports.setNX = setNX;
exports.acquireLock = acquireLock;
exports.releaseLock = releaseLock;
exports.sadd = sadd;
exports.sismember = sismember;
exports.srem = srem;
exports.smembers = smembers;
const ioredis_1 = __importDefault(require("ioredis"));
let redis = null;
/**
 * Initialize Redis connection
 */
function initRedis(url) {
    if (redis) {
        return redis;
    }
    const redisUrl = url || process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new ioredis_1.default(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: false,
    });
    redis.on('error', (err) => {
        console.error('Redis connection error:', err);
    });
    redis.on('connect', () => {
        console.log('Redis connected');
    });
    return redis;
}
/**
 * Get Redis client (initializes if needed)
 */
function getRedis() {
    if (!redis) {
        return initRedis();
    }
    return redis;
}
/**
 * Close Redis connection
 */
async function closeRedis() {
    if (redis) {
        await redis.quit();
        redis = null;
    }
}
/**
 * Publish a message to a channel
 */
async function publish(channel, message) {
    return getRedis().publish(channel, message);
}
/**
 * Subscribe to a channel
 */
async function subscribe(channel, callback) {
    const subscriber = getRedis().duplicate();
    await subscriber.subscribe(channel);
    subscriber.on('message', (_ch, msg) => {
        callback(msg);
    });
}
/**
 * Set a key with optional expiry (in seconds)
 */
async function setKey(key, value, expirySeconds) {
    if (expirySeconds) {
        await getRedis().setex(key, expirySeconds, value);
    }
    else {
        await getRedis().set(key, value);
    }
}
/**
 * Get a key value
 */
async function getKey(key) {
    return getRedis().get(key);
}
/**
 * Delete a key
 */
async function deleteKey(key) {
    return getRedis().del(key);
}
/**
 * Check if key exists
 */
async function exists(key) {
    const result = await getRedis().exists(key);
    return result === 1;
}
/**
 * Set a key only if it doesn't exist (NX)
 */
async function setNX(key, value, expirySeconds) {
    if (expirySeconds) {
        const result = await getRedis().set(key, value, 'EX', expirySeconds, 'NX');
        return result === 'OK';
    }
    const result = await getRedis().setnx(key, value);
    return result === 1;
}
/**
 * Acquire a distributed lock
 */
async function acquireLock(key, ttlSeconds) {
    return setNX(`lock:${key}`, '1', ttlSeconds);
}
/**
 * Release a distributed lock
 */
async function releaseLock(key) {
    await deleteKey(`lock:${key}`);
}
/**
 * Add to a set
 */
async function sadd(key, ...members) {
    return getRedis().sadd(key, ...members);
}
/**
 * Check if member is in set
 */
async function sismember(key, member) {
    const result = await getRedis().sismember(key, member);
    return result === 1;
}
/**
 * Remove from set
 */
async function srem(key, ...members) {
    return getRedis().srem(key, ...members);
}
/**
 * Get all set members
 */
async function smembers(key) {
    return getRedis().smembers(key);
}
//# sourceMappingURL=redis.js.map