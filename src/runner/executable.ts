import tar = require('tar');
import lockfile = require('lockfile');
import Bluebird = require('bluebird');
import pathLib = require('path');
import fse = require('fs-extra');
import msgpack = require('msgpack-lite');
import winston = require('winston');

import { streamToBuffer } from '../utils';
import { get as getRedis, put as putRedis } from './redis';
import { globalConfig as Cfg } from './config';
import { getLanguage, Language } from '../languages';
import { redisBinarySuffix, redisMetadataSuffix } from '../interfaces';
Bluebird.promisifyAll(lockfile);

interface BinaryMetadata {
    language: string;
    code: string;
}

export async function pushBinary(name: string, language: Language, code: string, path: string): Promise<void> {
    winston.verbose(`Pushing binary ${name}, creating tar archive...`);
    const binary = await streamToBuffer(tar.create({
        gzip: true,
        cwd: path,
        portable: true
    }, ['.']));
    const data: BinaryMetadata = {
        language: language.name,
        code: code
    };
    await putRedis(name + redisBinarySuffix, binary);
    await putRedis(name + redisMetadataSuffix, msgpack.encode(data));
}

// Return value: [path, language, code]
export async function fetchBinary(name: string): Promise<[string, Language, string]> {
    winston.verbose(`Fetching binary ${name}...`);
    await fse.ensureDir(Cfg.binaryDirectory);
    const targetName = pathLib.join(Cfg.binaryDirectory, name);
    const lockFileName = pathLib.join(Cfg.binaryDirectory, `${name}-get.lock`);

    const metadata = msgpack.decode(await getRedis(name + redisMetadataSuffix)) as BinaryMetadata;
    const isCurrentlyWorking = await fse.pathExists(lockFileName);
    // The binary already exists, no need for locking
    if (await fse.pathExists(targetName) && !isCurrentlyWorking) {
        winston.debug(`Binary ${name} exists, no need for fetching...`);
    } else {
        winston.debug(`Acquiring lock ${lockFileName}...`);
        await lockfile.lockAsync(lockFileName, {
            wait: 1000
        });
        let ok = false;
        try {
            winston.debug(`Got lock for ${name}.`);
            if (await fse.pathExists(targetName)) {
                winston.debug(`Work ${name} done by others...`);
            } else {
                winston.debug(`Doing work: fetching binary for ${name} ...`);
                await fse.ensureDir(targetName);
                const binary = await getRedis(name + redisBinarySuffix);
                winston.debug(`Decompressing binary (size=${binary.length})...`);
                await new Promise((res, rej) => {
                    const s = tar.extract({
                        cwd: targetName
                    });
                    s.on('error', rej);
                    s.on('close', res);
                    s.write(binary);
                    s.end();
                });
            }
            ok = true;
        } finally {
            if (!ok)
                await fse.rmdir(targetName);
            winston.debug('Unlocking...');
            await lockfile.unlockAsync(lockFileName);
        }
    }
    return [targetName, getLanguage(metadata.language), metadata.code];
}
