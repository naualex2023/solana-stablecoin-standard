/**
 * Redis client for SSS Token Backend Services
 */
import type { Redis as RedisType } from 'ioredis';
/**
 * Initialize Redis connection
 */
export declare function initRedis(url?: string): RedisType;
/**
 * Get Redis client (initializes if needed)
 */
export declare function getRedis(): RedisType;
/**
 * Close Redis connection
 */
export declare function closeRedis(): Promise<void>;
/**
 * Publish a message to a channel
 */
export declare function publish(channel: string, message: string): Promise<number>;
/**
 * Subscribe to a channel
 */
export declare function subscribe(channel: string, callback: (message: string) => void): Promise<void>;
/**
 * Set a key with optional expiry (in seconds)
 */
export declare function setKey(key: string, value: string, expirySeconds?: number): Promise<void>;
/**
 * Get a key value
 */
export declare function getKey(key: string): Promise<string | null>;
/**
 * Delete a key
 */
export declare function deleteKey(key: string): Promise<number>;
/**
 * Check if key exists
 */
export declare function exists(key: string): Promise<boolean>;
/**
 * Set a key only if it doesn't exist (NX)
 */
export declare function setNX(key: string, value: string, expirySeconds?: number): Promise<boolean>;
/**
 * Acquire a distributed lock
 */
export declare function acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
/**
 * Release a distributed lock
 */
export declare function releaseLock(key: string): Promise<void>;
/**
 * Add to a set
 */
export declare function sadd(key: string, ...members: string[]): Promise<number>;
/**
 * Check if member is in set
 */
export declare function sismember(key: string, member: string): Promise<boolean>;
/**
 * Remove from set
 */
export declare function srem(key: string, ...members: string[]): Promise<number>;
/**
 * Get all set members
 */
export declare function smembers(key: string): Promise<string[]>;
//# sourceMappingURL=redis.d.ts.map