import pathLib = require('path');
import fse = require('fs-extra');
import randomString = require('randomstring');
import bluebird = require('bluebird');
import getFolderSize = require('get-folder-size');
import AnsiToHtml = require('ansi-to-html');

import { CompileTask, CompilationResult, TaskStatus } from '../interfaces';
import { globalConfig as Cfg } from './config';
import { sandboxize, createOrEmptyDir, setWriteAccess } from './utils';
import { Language, getLanguage } from '../languages';
import { startSandbox } from 'simple-sandbox';
import { SandboxParameter, MountInfo, SandboxStatus, SandboxResult } from 'simple-sandbox/lib/interfaces';
import { readFileLength } from '../utils';
import { pushBinary } from './executable';

const getSize: any = bluebird.promisify(getFolderSize);
const convert = new AnsiToHtml({ escapeXML: true });

export async function compile(task: CompileTask): Promise<CompilationResult> {
    const srcDir = pathLib.join(Cfg.workingDirectory, `src`);
    const binDir = pathLib.join(Cfg.workingDirectory, `bin`);
    const tempDir = pathLib.join(Cfg.workingDirectory, 'temp');
    await Promise.all([createOrEmptyDir(srcDir), createOrEmptyDir(binDir), createOrEmptyDir(tempDir)]);
    await Promise.all([
        setWriteAccess(srcDir, false),
        setWriteAccess(binDir, true),
        setWriteAccess(tempDir, true)]);

    const writeTasks: Promise<void>[] = [];
    if (task.extraFiles) {
        for (const f of task.extraFiles) {
            writeTasks.push(fse.writeFile(pathLib.join(srcDir, f.name), f.content, { encoding: 'utf8' }));
        }
    }

    const language = getLanguage(task.language);
    const srcPath = pathLib.join(srcDir, language.sourceFileName);
    writeTasks.push(fse.writeFile(srcPath, task.code, { encoding: 'utf8' }));
    await Promise.all(writeTasks);

    const srcDir_Sandbox = '/sandbox/1';
    const binDir_Sandbox = '/sandbox/2';
    const compileConfig = language.compile(
        `${srcDir_Sandbox}/${language.sourceFileName}`, binDir_Sandbox);

    const sandboxParam = sandboxize(compileConfig, [{
        src: srcDir,
        dst: srcDir_Sandbox,
        limit: 0
    }, {
        src: binDir,
        dst: binDir_Sandbox,
        limit: -1
    }, {
        src: tempDir,
        dst: '/tmp',
        limit: -1
    }]);

    try {
        const sandbox = await startSandbox(sandboxParam);
        const sandboxResult = await sandbox.waitForStop();

        // If the compiler exited
        if (sandboxResult.status === SandboxStatus.OK) {
            // If the compiler did not return an error
            if (sandboxResult.code === 0) {
                const outputSize = await getSize(binDir);
                // If the output is too long
                if (outputSize > language.binarySizeLimit) {
                    return {
                        status: TaskStatus.Failed,
                        message: `Your source code compiled to ${outputSize} bytes which is too big, too thick, too long for us..`
                    };
                } // Else OK!
            } else { // If compilation error
                return {
                    status: TaskStatus.Failed,
                    message: convert.toHtml(await readFileLength(pathLib.join(binDir, compileConfig.messageFile), Cfg.compilerMessageLimit))
                };
            }
        } else {
            return {
                status: TaskStatus.Failed,
                message: (`A ${SandboxStatus[sandboxResult.status]} encountered while compiling your code.\n\n` + await readFileLength(binDir + '/' + compileConfig.messageFile, Cfg.compilerMessageLimit)).trim()
            };
        }

        await pushBinary(task.binaryName, language, task.code, binDir);
        return { status: TaskStatus.Done };
    } finally {
        await Promise.all([fse.remove(binDir), fse.remove(srcDir)]);
    }
}