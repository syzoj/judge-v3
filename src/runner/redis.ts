import Bluebird = require('bluebird');
import redis = require('redis');
import winston = require('winston');

import { globalConfig as Cfg } from './config';
import { codeFingerprint } from '../utils';

Bluebird.promisifyAll(redis.RedisClient.prototype);
Bluebird.promisifyAll(redis.Multi.prototype);

const redisClient = redis.createClient(Cfg.redis, { detect_buffers: true }) as any;

export async function put(name: string, content: Buffer): Promise<void> {
    winston.debug(`Putting ${name}, size = ${content.byteLength}`);
    await redisClient.setAsync(new Buffer(name), content);
    winston.debug(`${name} has been put.`);
}

export async function get(name: string): Promise<Buffer> {
    winston.debug(`Getting redis record ${name}`);
    const result = await redisClient.getAsync(new Buffer(name)) as Buffer;
    if (result == null) {
        winston.warn(`Redis record ${name} unavailable`);
        throw new Error(`Redis record ${name} unavailable.`);
    }
    winston.debug(`Got redis record ${name}, size = ${result.byteLength}`);
    return result;
}