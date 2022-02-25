import pathLib = require('path');
import randomString = require('randomstring');
import util = require('util');
import fse = require('fs-extra');
import winston = require('winston');
const syspipe = require('syspipe');

import { SandboxStatus } from 'simple-sandbox/lib/interfaces';
import { TestcaseResultType, StandardRunTask, StandardRunResult, InteractionRunTask, AnswerSubmissionRunTask, AnswerSubmissionRunResult } from '../interfaces';
import { createOrEmptyDir, tryEmptyDir } from './utils';
import { readFileLength, tryReadFile } from '../utils';
import { globalConfig as Cfg } from './config';
import { runProgram, runDiff } from './run';
import { Language } from '../languages';
import { fetchBinary } from './executable';
import { signals } from './signals';

const workingDir = `${Cfg.workingDirectory}/data`;
const spjWorkingDir = `${Cfg.workingDirectory}/data-spj`;

interface SpjResult {
    status: TestcaseResultType;
    message: string;
    score: number;
}

const spjFullScore = 100;

function getStatusByScore(score: number): TestcaseResultType {
    switch (score) {
        case spjFullScore:
            return TestcaseResultType.Accepted;
        case 0:
            return TestcaseResultType.WrongAnswer;
        default:
            return TestcaseResultType.PartiallyCorrect;
    }
}

async function runSpj(spjBinDir: string, spjLanguage: Language): Promise<SpjResult> {
    const scoreFileName = 'score.txt';
    const messageFileName = 'message.txt';
    const [resultPromise] = await runProgram(spjLanguage,
        spjBinDir,
        spjWorkingDir,
        Cfg.spjTimeLimit,
        Cfg.spjMemoryLimit * 1024 * 1024,
        null,
        scoreFileName,
        messageFileName);
    const spjRunResult = await resultPromise;

    if (spjRunResult.result.status !== SandboxStatus.OK) {
        return {
            status: TestcaseResultType.JudgementFailed,
            message: `Special Judge ${SandboxStatus[spjRunResult.result.status]} encountered.`,
            score: 0
        };
    } else {
        const scoreString = await tryReadFile(pathLib.join(spjWorkingDir, scoreFileName)),
            score = Number(scoreString);
        const messageString = await readFileLength(pathLib.join(spjWorkingDir, messageFileName), Cfg.stderrDisplayLimit);

        if ((!scoreString) || isNaN(score) || score < 0 || score > spjFullScore) {
            return {
                status: TestcaseResultType.JudgementFailed,
                message: `Special Judge returned an unrecoginzed score: ${scoreString}.`,
                score: 0
            };
        } else {
            return {
                status: getStatusByScore(score),
                message: messageString,
                score: score / spjFullScore
            };
        }
    }
}

export async function judgeAnswerSubmission(task: AnswerSubmissionRunTask)
    : Promise<AnswerSubmissionRunResult> {
    try {
        await createOrEmptyDir(spjWorkingDir);
        const testDataPath = pathLib.join(Cfg.testDataDirectory, task.testDataName);

        const inputFilePath = task.inputData != null ?
            pathLib.join(testDataPath, task.inputData) : null;
        if (inputFilePath != null)
            await fse.copy(inputFilePath, pathLib.join(spjWorkingDir, 'input'));

        const answerFilePath = task.answerData != null ?
            pathLib.join(testDataPath, task.answerData) : null;
        if (answerFilePath != null)
            await fse.copy(answerFilePath, pathLib.join(spjWorkingDir, 'answer'));

        await fse.writeFile(pathLib.join(spjWorkingDir, "user_out"), task.userAnswer);

        if (task.spjExecutableName != null) {
            const [spjBinDir, spjLanguage] = await fetchBinary(task.spjExecutableName);
            winston.debug(`Using spj, language: ${spjLanguage.name}`);
            if (inputFilePath != null)
                await fse.copy(inputFilePath, pathLib.join(spjWorkingDir, 'input'));
            winston.debug(`Running spj`);
            const spjResult = await runSpj(spjBinDir, spjLanguage);
            winston.debug('Judgement done!!');

            return {
                result: spjResult.status,
                scoringRate: spjResult.score,
                spjMessage: spjResult.message,
            };
        } else {
            winston.debug(`Running diff`);
            const diffResult = await runDiff(spjWorkingDir, 'user_out', 'answer');
            winston.debug('Judgement done!!');
            return {
                result: diffResult.pass ? TestcaseResultType.Accepted : TestcaseResultType.WrongAnswer,
                scoringRate: diffResult.pass ? 1 : 0,
                spjMessage: diffResult.message,
            };
        }
    } finally {
        await tryEmptyDir(spjWorkingDir);
    }
}

export async function judgeStandard(task: StandardRunTask)
    : Promise<StandardRunResult> {
    winston.debug("Standard judge task...", task);
    try {
        const testDataPath = pathLib.join(Cfg.testDataDirectory, task.testDataName);
        const inputFilePath = task.inputData != null ?
            pathLib.join(testDataPath, task.inputData) : null;
        const answerFilePath = task.answerData != null ?
            pathLib.join(testDataPath, task.answerData) : null;

        winston.debug("Creating directories...");
        await Promise.all([createOrEmptyDir(workingDir), createOrEmptyDir(spjWorkingDir)]);

        let stdinRedirectionName, inputFileName,
            stdoutRedirectionName, outputFileName;
        const tempErrFile = randomString.generate(10) + ".err";

        if (task.fileIOInput != null) {
            inputFileName = task.fileIOInput;
            stdinRedirectionName = null;
        } else {
            if (task.inputData != null) {
                stdinRedirectionName = inputFileName = randomString.generate(10) + ".in";
            } else {
                stdinRedirectionName = inputFileName = null;
            }
        }

        if (task.fileIOOutput != null) {
            outputFileName = task.fileIOOutput;
            stdoutRedirectionName = null;
        } else {
            stdoutRedirectionName = outputFileName = randomString.generate(10) + ".out";
        }

        if (inputFilePath != null) {
            winston.debug("Copying input file...");
            await fse.copy(inputFilePath, pathLib.join(workingDir, inputFileName));
        }

        winston.debug("Fetching user binary...");
        const [binaryDirectory, language, userCode] = await fetchBinary(task.userExecutableName);

        winston.debug("Running user program...");
        const [resultPromise] = await runProgram(language,
            binaryDirectory,
            workingDir,
            task.time,
            task.memory * 1024 * 1024,
            stdinRedirectionName,
            stdoutRedirectionName,
            tempErrFile);
        const runResult = await resultPromise;

        winston.verbose((task.inputData || "<none> ") + " Run result: " + JSON.stringify(runResult));

        const time = Math.round(runResult.result.time / 1e6),
            memory = runResult.result.memory / 1024;

        let status: TestcaseResultType = null, message = null;
        if (runResult.outputLimitExceeded) {
            status = TestcaseResultType.OutputLimitExceeded;
        } else if (runResult.result.status === SandboxStatus.TimeLimitExceeded) {
            status = TestcaseResultType.TimeLimitExceeded;
        } else if (runResult.result.status === SandboxStatus.MemoryLimitExceeded) {
            status = TestcaseResultType.MemoryLimitExceeded;
        } else if (runResult.result.status === SandboxStatus.RuntimeError) {
            message = `Killed: ${signals[runResult.result.code]}`;
            status = TestcaseResultType.RuntimeError;
        } else if (runResult.result.status !== SandboxStatus.OK) {
            message = "Warning: corrupt sandbox result " + util.inspect(runResult.result);
            status = TestcaseResultType.RuntimeError;
        } else {
            message = `Exited with return code ${runResult.result.code}`;
        }

        const [userOutput, userError] = await Promise.all([
            readFileLength(pathLib.join(workingDir, outputFileName), Cfg.dataDisplayLimit),
            readFileLength(pathLib.join(workingDir, tempErrFile), Cfg.stderrDisplayLimit)
        ]);

        try {
            await fse.move(pathLib.join(workingDir, outputFileName), pathLib.join(spjWorkingDir, 'user_out'));
        } catch (e) {
            if (e.code === 'ENOENT' && runResult.result.status === SandboxStatus.OK && !runResult.outputLimitExceeded) {
                status = TestcaseResultType.FileError;
            }
        }

        const partialResult = {
            time: time,
            memory: memory,
            userOutput: userOutput,
            userError: userError,
            systemMessage: message
        };
        if (status !== null) {
            return Object.assign({ scoringRate: 0, spjMessage: null, result: status }, partialResult);
        } else {
            if (answerFilePath != null)
                await fse.copy(answerFilePath, pathLib.join(spjWorkingDir, 'answer'));

            if (task.spjExecutableName != null) {
                const [spjBinDir, spjLanguage] = await fetchBinary(task.spjExecutableName);
                winston.debug(`Using spj, language: ${spjLanguage.name}`);
                if (inputFilePath != null)
                    await fse.copy(inputFilePath, pathLib.join(spjWorkingDir, 'input'));
                await fse.writeFile(pathLib.join(spjWorkingDir, 'code'), userCode);
                winston.debug(`Running spj`);
                const spjResult = await runSpj(spjBinDir, spjLanguage);
                winston.debug('Judgement done!!');

                return Object.assign({
                    scoringRate: spjResult.score,
                    spjMessage: spjResult.message,
                    result: spjResult.status
                }, partialResult);
            } else {
                winston.debug(`Running diff`);
                const diffResult = await runDiff(spjWorkingDir, 'user_out', 'answer');
                winston.debug('Judgement done!!');
                return Object.assign({
                    scoringRate: diffResult.pass ? 1 : 0,
                    spjMessage: diffResult.message,
                    result: diffResult.pass ? TestcaseResultType.Accepted : TestcaseResultType.WrongAnswer,
                }, partialResult);
            }
        }
    } finally {
        tryEmptyDir(workingDir);
        tryEmptyDir(spjWorkingDir);
    }
}

export async function judgeInteraction(task: InteractionRunTask)
    : Promise<StandardRunResult> {
    let pipe1 = null, pipe2 = null;
    try {
        const testDataPath = pathLib.join(Cfg.testDataDirectory, task.testDataName);
        const inputFilePath = task.inputData != null ?
            pathLib.join(testDataPath, task.inputData) : null;
        const answerFilePath = task.answerData != null ?
            pathLib.join(testDataPath, task.answerData) : null;

        winston.debug("Creating directories...");
        await Promise.all([createOrEmptyDir(workingDir), createOrEmptyDir(spjWorkingDir)]);

        const tempErrFile = randomString.generate(10) + ".err";

        if (inputFilePath != null) {
            await fse.copy(inputFilePath,
                pathLib.join(spjWorkingDir, 'input'));
        }
        if (answerFilePath != null) {
            await fse.copy(answerFilePath,
                pathLib.join(spjWorkingDir, 'answer'));
        }

        winston.debug("Fetching user binary...");
        const [userBinaryDirectory, userLanguage, userCode] = await fetchBinary(task.userExecutableName);
        winston.debug("Fetching interactor binary...");
        const [interactorBinaryDirectory, interactorLanguage] = await fetchBinary(task.interactorExecutableName);

        await fse.writeFile(pathLib.join(spjWorkingDir, 'code'), userCode);

        pipe1 = syspipe.pipe(),
            pipe2 = syspipe.pipe();

        const [userProgramTaskPromise, stopUser] = await runProgram(userLanguage,
            userBinaryDirectory,
            workingDir,
            task.time,
            task.memory * 1024 * 1024,
            pipe1.read,
            pipe2.write,
            tempErrFile);

        const [interactorTaskPromise] = await runProgram(interactorLanguage,
            interactorBinaryDirectory,
            spjWorkingDir,
            task.time * 2,
            task.memory * 1024 * 1024,
            pipe2.read,
            pipe1.write,
            tempErrFile);

        const [interactorResult, runResult] = await Promise.all([interactorTaskPromise
            .then((result) => { stopUser(); return result; }, (err) => { stopUser(); return Promise.reject(err); }), userProgramTaskPromise]);

        const time = Math.round(runResult.result.time / 1e6),
            memory = runResult.result.memory / 1024;

        let status: TestcaseResultType = null, message = null;
        if (runResult.outputLimitExceeded) {
            status = TestcaseResultType.OutputLimitExceeded;
        } else if (runResult.result.status === SandboxStatus.TimeLimitExceeded) {
            status = TestcaseResultType.TimeLimitExceeded;
        } else if (runResult.result.status === SandboxStatus.MemoryLimitExceeded) {
            status = TestcaseResultType.MemoryLimitExceeded;
        } else if (runResult.result.status === SandboxStatus.RuntimeError) {
            message = `Killed: ${signals[runResult.result.code]}`;
            status = TestcaseResultType.RuntimeError;
        } else if (runResult.result.status === SandboxStatus.Cancelled) {
            // User program is cancelled because the interactor has already exited.
            // We do nothing here.
        } else if (runResult.result.status !== SandboxStatus.OK) {
            message = "Warning: corrupt sandbox result " + util.inspect(runResult.result);
            status = TestcaseResultType.RuntimeError;
        } else {
            message = `Exited with return code ${runResult.result.code}`;
        }
        if (interactorResult.result.status !== SandboxStatus.OK) {
            if (interactorResult.result.status === SandboxStatus.TimeLimitExceeded) {
                message = 'Interactor Time Limit Exceeded. This is likely to happen if your program stuck.';
                status = TestcaseResultType.TimeLimitExceeded;
            } else {
                message = `A ${SandboxStatus[interactorResult.result.status]} encountered while running interactor`;
                status = TestcaseResultType.JudgementFailed;
            }
        }
        const partialResult = {
            time: time,
            memory: memory,
            userOutput: null,
            userError: await readFileLength(pathLib.join(workingDir, tempErrFile), Cfg.stderrDisplayLimit),
            spjMessage: await readFileLength(pathLib.join(spjWorkingDir, tempErrFile), Cfg.stderrDisplayLimit)
        };

        // If interactor exited normally
        let score = 0;
        if (status == null) {
            const scoreString = await tryReadFile(spjWorkingDir + '/score.txt');
            const rawScore = Number(scoreString);
            if ((!scoreString) || isNaN(rawScore)) {
                score = null;
                status = TestcaseResultType.JudgementFailed;
                message = `Interactor returned a non-number score ${scoreString}`;
            } else if (rawScore === -1) {
                status = TestcaseResultType.InvalidInteraction;
            } else {
                score = rawScore;
                status = getStatusByScore(rawScore);
            }
        }
        winston.debug(`Interaction problem judge succeeded, score = ${score}`);
        return Object.assign(partialResult, {
            result: status,
            scoringRate: score / spjFullScore,
            systemMessage: message
        });
    } finally {
        const closePipe = async (p) => {
            try {
                if (p) {
                    await fse.close(p.read);
                    await fse.close(p.write);
                }
            } catch (e) { }
        }
        await closePipe(pipe1);
        await closePipe(pipe2);
        await tryEmptyDir(spjWorkingDir);
        await tryEmptyDir(workingDir);
    }
}
