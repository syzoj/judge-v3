import Bluebird = require('bluebird');
import fse = require('fs-extra');
import getFolderSize = require('get-folder-size');
import pathLib = require('path');
const getSize: any = Bluebird.promisify(getFolderSize);

import { startSandbox } from 'simple-sandbox/lib/index';
import { SandboxParameter, MountInfo, SandboxStatus, SandboxResult } from 'simple-sandbox/lib/interfaces';
import { SandboxProcess } from 'simple-sandbox/lib/sandboxProcess';
import { globalConfig as Cfg } from './config';
import { createOrEmptyDir, sandboxize, setWriteAccess } from './utils';
import { Language } from '../languages';

export interface RunResult {
    outputLimitExceeded: boolean;
    result: SandboxResult;
}

export interface DiffResult {
    pass: boolean;
    message: string;
}

export async function runDiff(dataDir: string, file1: string, file2: string): Promise<DiffResult> {
    await setWriteAccess(dataDir, true);
    const tmpPath = '/sandbox/1', outputFileName = 'diff.txt';
    const sandbox = await startSandbox(Object.assign({
        executable: '/usr/bin/diff',
        parameters: ['/usr/bin/diff', '-Bbq', file1, file2],
        time: Cfg.spjTimeLimit,
        memory: Cfg.spjMemoryLimit * 1024 * 1024,
        process: 2,
        stdin: null,
        stdout: outputFileName,
        stderr: null,
        workingDirectory: tmpPath,
        mounts: [{
            src: dataDir,
            dst: tmpPath,
            limit: -1
        }]
    }, Cfg.sandbox));
    const sandboxResult = await sandbox.waitForStop();

    if (sandboxResult.status !== SandboxStatus.OK) {
        return { pass: false, message: `Diff encountered ${SandboxStatus[sandboxResult.status]}` }
    }

    const message = await fse.readFile(pathLib.join(dataDir, outputFileName), 'utf8');
    return { pass: sandboxResult.code === 0, message: message };
}

export async function runProgram(language: Language,
    binDir: string,
    dataDir: string,
    time: number,
    memory: number,
    stdinFile?: string | number,
    stdoutFile?: string | number,
    stderrFile?: string | number): Promise<[RunResult, () => void]> {
    await setWriteAccess(binDir, false);
    await setWriteAccess(dataDir, true);

    const dataDir_Sandbox = '/sandbox/1';
    const binDir_Sandbox = '/sandbox/2';
    const runConfig = language.run(binDir_Sandbox, dataDir_Sandbox, time, memory, stdinFile, stdoutFile, stderrFile);

    const sandboxParam = sandboxize(runConfig, [{
        src: binDir,
        dst: binDir_Sandbox,
        limit: 0
    }, {
        src: dataDir,
        dst: dataDir_Sandbox,
        limit: -1
    }]);

    let result: SandboxResult = null;
    const sandbox = await startSandbox(sandboxParam);
    result = await sandbox.waitForStop();

    let ole = false;
    const outputSize = await getSize(binDir);
    if (outputSize > Cfg.outputLimit) {
        await fse.emptyDir(dataDir);
        ole = true;
    }

    return [{
        outputLimitExceeded: ole,
        result: result
    }, () => { sandbox.stop(); }];
}
