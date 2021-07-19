import * as fse from 'fs-extra';
import * as pathLib from 'path';
import util = require('util');
import sha256 = require('crypto-js/sha256');
import nodeStream = require('stream');

import { exec, execFile } from "child_process";

const execAsync = (util as any).promisify(exec);
const execFileAsync = (util as any).promisify(execFile);

export async function emptyDir(dirName: string): Promise<void> {
    await execAsync("/bin/find . -mindepth 1 -delete", { cwd: dirName });
}

export async function remove(filename: string): Promise<void> {
    await execFileAsync("/bin/rm", ["-rf", "--", filename]);
}

export async function getFolderSize(dirName: string): Promise<number> {
    const result = await execAsync("/usr/bin/du -sb . | /usr/bin/cut -f1", { cwd: dirName });
    return Number(result.stdout) || 0;
}

export function codeFingerprint(code: string, language: string): string {
    return "src-" + language + sha256(code);
}

export function streamToBuffer(source: nodeStream.Readable): Promise<Buffer> {
    return new Promise((res, rej) => {
        const bufs = [];
        source.on('data', (d) => { bufs.push(d); });
        source.on('end', () => {
            res(Buffer.concat(bufs));
        });
        source.on('error', (err) => {
            rej(err);
        })
    });
}

export function cloneObject<T>(src: T): T {
    return Object.assign({}, src);
}

export function fileTooLongPrompt(actualSize: number, bytesRead: number): string {
    const omitted = actualSize - bytesRead;
    return `<${omitted} byte${omitted != 1 ? 's' : ''} omitted>`;
}

export async function tryReadFile(path: string, encoding = 'utf8'): Promise<string> {
    let fileContent = null;
    try {
        fileContent = await fse.readFile(path, 'utf8');
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }
    return fileContent;
}

export function readBufferLength(buf: Buffer, lengthLimit: number, appendPrompt = fileTooLongPrompt)
    : string {
    let content = buf.toString('utf8', 0, lengthLimit);
    if (buf.length > lengthLimit) {
        content += '\n' + appendPrompt(buf.length, lengthLimit);
    }
    return content;
}

export async function readFileLength(path: string, lengthLimit: number, appendPrompt = fileTooLongPrompt)
    : Promise<string> {
    let file = -1;
    try {
        file = await fse.open(path, 'r');
        const actualSize = (await fse.stat(path)).size;
        const buf = new Buffer(Math.min(actualSize, lengthLimit));
        const bytesRead = await fse.read(file, buf, 0, buf.length, 0) as any as number;
        let ret = buf.toString('utf8', 0, bytesRead);
        if (bytesRead < actualSize) {
            ret += '\n' + appendPrompt(actualSize, bytesRead);
        }
        return ret;
    } catch (e) {
        return null;
    } finally {
        if (file != -1) {
            await fse.close(file);
        }
    }
}

export function filterPath(src: string): string {
    src = src.toString();
    const replaceList = ['..'];
    let orig;
    let cur = src;
    do {
        orig = cur;
        for (const s of replaceList) {
            cur = cur.replace(s, '');
        }
    } while (cur != orig);
    return cur;
}


// By Pisces
function extractNumerals(s: string): number[] {
    return (s.match(/\d+/g) || []).map((x) => parseInt(x));
}

export function compareStringByNumber(a: string, b: string) {
    const acmp = extractNumerals(a), bcmp = extractNumerals(b);
    for (let i = 0; i < Math.min(acmp.length, bcmp.length); i++) {
        if (acmp[i] > bcmp[i])
            return 1;
        else if (acmp[i] < bcmp[i])
            return -1;
    }
    return a > b ? 1 : -1;
}
