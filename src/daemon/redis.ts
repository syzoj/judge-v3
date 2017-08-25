import Bluebird = require('bluebird');
import redis = require('redis');
import Redlock = require('redlock');

import { globalConfig as Cfg } from './config';
import { codeFingerprint } from '../utils';
import { redisMetadataSuffix } from '../interfaces';

Bluebird.promisifyAll(redis.RedisClient.prototype);
Bluebird.promisifyAll(redis.Multi.prototype);

const redisClient = redis.createClient(Cfg.redis, { detect_buffers: true }) as any;
// We use one client for now, cluster support to be added later.
const redlock = new Redlock([redisClient], {
    retryCount: 50,
    retryDelay: 100
    // retryJitter: 100
});

export async function checkBinaryExistance(name: string): Promise<Boolean> {
    return !!(await redisClient.existsAsync(name + redisMetadataSuffix));
}

const lockTTL = 1000;
export async function getCompileLock(name: string): Promise<() => Promise<void>> {
    const lockName = `compile-${name}`;
    const lock = await redlock.lock(lockName, lockTTL);
    const token = setInterval(async () => {
        await lock.extend(lockTTL);
    }, lockTTL * 0.7);
    return async () => {
        clearInterval(token);
        await lock.unlock();
    }
}