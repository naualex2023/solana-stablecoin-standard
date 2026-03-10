/**
 * Redis client for SSS Token Backend Services
 */

import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';

let redis: RedisType | null = null;

/**
 * Parse Redis URL to extract connection parameters
 */
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  // Parse URL like: redis://:password@host:port or redis://user:password@host:port
  try {
    const parsed = new URL(url);
    const config: { host: string; port: number; password?: string } = {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port) || 6379,
    };
    
    // Handle password - URL format redis://:password@host means empty username, password is set
    if (parsed.password) {
      config.password = parsed.password;
    }
    
    console.log('Redis config:', { 
      host: config.host, 
      port: config.port, 
      hasPassword: !!config.password 
    });
    
    return config;
  } catch (e) {
    console.error('Failed to parse Redis URL:', e);
    // Fallback for simple host:port format
    const parts = url.replace(/^redis:\/\//, '').split(':');
    return {
      host: parts[0] || 'localhost',
      port: parseInt(parts[1]) || 6379,
    };
  }
}

/**
 * Initialize Redis connection
 */
export function initRedis(url?: string): RedisType {
  if (redis) {
    return redis;
  }

  const redisUrl = url || process.env.REDIS_URL || 'redis://localhost:6379';
  const config = parseRedisUrl(redisUrl);
  
  redis = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      if (times > 3) {
        console.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 100, 2000);
    },
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });

  redis.on('connect', () => {
    console.log('Redis connected');
  });

  redis.on('ready', () => {
    console.log('Redis ready');
  });

  return redis;
}

/**
 * Get Redis client (initializes if needed)
 */
export function getRedis(): RedisType {
  if (!redis) {
    return initRedis();
  }
  return redis;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

/**
 * Publish a message to a channel
 */
export async function publish(channel: string, message: string): Promise<number> {
  return getRedis().publish(channel, message);
}

/**
 * Subscribe to a channel
 */
export async function subscribe(channel: string, callback: (message: string) => void): Promise<void> {
  const subscriber = getRedis().duplicate();
  await subscriber.subscribe(channel);
  subscriber.on('message', (_ch, msg) => {
    callback(msg);
  });
}

/**
 * Set a key with optional expiry (in seconds)
 */
export async function setKey(key: string, value: string, expirySeconds?: number): Promise<void> {
  if (expirySeconds) {
    await getRedis().setex(key, expirySeconds, value);
  } else {
    await getRedis().set(key, value);
  }
}

/**
 * Get a key value
 */
export async function getKey(key: string): Promise<string | null> {
  return getRedis().get(key);
}

/**
 * Delete a key
 */
export async function deleteKey(key: string): Promise<number> {
  return getRedis().del(key);
}

/**
 * Check if key exists
 */
export async function exists(key: string): Promise<boolean> {
  const result = await getRedis().exists(key);
  return result === 1;
}

/**
 * Set a key only if it doesn't exist (NX)
 */
export async function setNX(key: string, value: string, expirySeconds?: number): Promise<boolean> {
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
export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  return setNX(`lock:${key}`, '1', ttlSeconds);
}

/**
 * Release a distributed lock
 */
export async function releaseLock(key: string): Promise<void> {
  await deleteKey(`lock:${key}`);
}

/**
 * Add to a set
 */
export async function sadd(key: string, ...members: string[]): Promise<number> {
  return getRedis().sadd(key, ...members);
}

/**
 * Check if member is in set
 */
export async function sismember(key: string, member: string): Promise<boolean> {
  const result = await getRedis().sismember(key, member);
  return result === 1;
}

/**
 * Remove from set
 */
export async function srem(key: string, ...members: string[]): Promise<number> {
  return getRedis().srem(key, ...members);
}

/**
 * Get all set members
 */
export async function smembers(key: string): Promise<string[]> {
  return getRedis().smembers(key);
}