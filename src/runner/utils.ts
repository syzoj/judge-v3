import klaw = require('klaw');
import posix = require('posix');
import fse = require('fs-extra');
import { ExecParam } from '../languages';
import {cloneObject} from '../utils';
import { SandboxParameter, MountInfo } from 'simple-sandbox/src/interfaces';
import { globalConfig as Cfg } from './config';

export * from "../utils";
import { emptyDir } from "../utils";

import { exec, execFile } from "child_process";
import util = require("util");

const execFileAsync = (util as any).promisify(execFile);

export async function setWriteAccess(dirName: string, writeAccess: boolean): Promise<void> {
    const user = posix.getpwnam(Cfg.sandbox.user);
    const uid = writeAccess ? user.uid : process.getuid(), gid = writeAccess ? user.gid : process.getgid();
    await Promise.all([
        execFileAsync("/bin/chmod", ["-R", "755", "--", dirName]),
        execFileAsync("/bin/chown", ["-R", `${uid}:${uid}`, "--", dirName])
    ]);
}

export async function createOrEmptyDir(path: string): Promise<void> {
    await fse.ensureDir(path);
    await emptyDir(path);
}

export function sandboxize(execParam: ExecParam, mounts: MountInfo[]): SandboxParameter {
    const result = Object.assign(cloneObject(execParam),Cfg.sandbox);
    return Object.assign(result, { mounts: mounts });
}

export async function tryEmptyDir(path: string) {
    try {
        await emptyDir(path);
    } catch (e) { }
}
