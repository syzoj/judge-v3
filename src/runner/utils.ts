import klaw = require('klaw');
import posix = require('posix');
import fse = require('fs-extra');
import { ExecParam } from '../languages';
import {cloneObject} from '../utils';
import { SandboxParameter, MountInfo } from 'simple-sandbox/src/interfaces';
import { globalConfig as Cfg } from './config';

export function setWriteAccess(dirName: string, writeAccess: boolean): Promise<void> {
    const user = posix.getpwnam(Cfg.sandbox.user);
    const operations: Promise<void>[] = [];
    return new Promise<void>((res, rej) => {
        klaw(dirName).on('data', (item) => {
            operations.push((async () => {
                const path = item.path;
                await fse.chmod(path, 0o755);
                if (writeAccess) {
                    await fse.chown(path, user.uid, user.gid);
                } else {
                    await fse.chown(path, process.getuid(), process.getgid());
                }
            })());
        }).on('end', () => {
            Promise.all(operations).then(() => res(), (err) => rej(err));
        });
    });
}

export async function createOrEmptyDir(path: string): Promise<void> {
    try {
        await fse.mkdir(path);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    await fse.emptyDir(path);
}

export function sandboxize(execParam: ExecParam, mounts: MountInfo[]): SandboxParameter {
    const result = Object.assign(cloneObject(execParam),Cfg.sandbox);
    return Object.assign(result, { mounts: mounts });
}

export async function tryEmptyDir(path: string) {
    try {
        await fse.emptyDir(path);
    } catch (e) { }
}
