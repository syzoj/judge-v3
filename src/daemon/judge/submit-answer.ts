import winston = require('winston');
import pathLib = require('path');
import decompress = require('decompress');
import randomstring = require('randomstring');
import fse = require('fs-extra');

import { RPCTaskType, TestcaseResultType, TestcaseDetails, TaskStatus, CompilationResult, AnswerSubmissionRunTask, AnswerSubmissionRunResult } from '../../interfaces';
import { TestData, TestcaseJudge } from '../interfaces';
import { JudgerBase } from './judger-base';
import { compile } from './compile';
import { globalConfig as Cfg } from '../config';
import { runTask } from '../rmq';
import { remove, readFileLength, readBufferLength } from '../../utils';

export class AnswerSubmissionJudger extends JudgerBase {
    submissionContent: Buffer;
    spjExecutableName: string = null;
    tempDirectory: string;

    constructor(testData: TestData, userSubmission: Buffer, priority: number) {
        super(testData, priority);
        winston.debug(`Submission size: ${userSubmission.length}`);
        this.submissionContent = userSubmission;
        this.tempDirectory = pathLib.join(Cfg.tempDirectory, 'SYZOJ-tmp-' + randomstring.generate(10));
    }

    async preprocessTestData(): Promise<void> {
        if (this.testData.spj != null) {
            winston.verbose("Compiling special judge.");
            const [spjExecutableName, spjResult] = await compile(this.testData.spj.sourceCode,
                this.testData.spj.language, null, this.priority);
            if (spjResult.status !== TaskStatus.Done) {
                winston.verbose("Special judge CE: " + spjResult.message);
                let message = null;
                if (spjResult.message != null && spjResult.message !== "") {
                    message = "===== Special Judge Compilation Message =====" + spjResult.message;
                }
                throw new Error(message);
            } else {
                this.spjExecutableName = spjExecutableName;
            }
        } else {
            this.spjExecutableName = null;
        }
    }

    async compile(): Promise<CompilationResult> {
        await fse.mkdir(this.tempDirectory);
        try {
            await decompress(this.submissionContent, this.tempDirectory);
            return { status: TaskStatus.Done };
        } catch (err) {
            return { status: TaskStatus.Failed, message: `Unable to decompress your answer` + err.toString() };
        }
    }

    async judgeTestcase(curCase: TestcaseJudge, started: () => Promise<void>): Promise<TestcaseDetails> {
        let userOutput: Buffer;
        try {
            userOutput = await fse.readFile(pathLib.join(this.tempDirectory, curCase.userOutputFile));
        } catch (err) {
            return {
                type: TestcaseResultType.FileError,
                time: null,
                memory: null,
                scoringRate: 0,
                systemMessage: `Unable to open your answer: ${err.toString()}`
            }
        }

        const task: AnswerSubmissionRunTask = {
            testDataName: this.testData.name,
            inputData: curCase.input,
            answerData: curCase.output,
            userAnswer: userOutput,
            spjExecutableName: this.spjExecutableName
        }

        const [inputContent, outputContent, runResult]: [string, string, AnswerSubmissionRunResult] = await Promise.all([
            readFileLength(curCase.input ? pathLib.join(Cfg.testDataDirectory, this.testData.name, curCase.input) : null, Cfg.dataDisplayLimit),
            readFileLength(curCase.output ? pathLib.join(Cfg.testDataDirectory, this.testData.name, curCase.output) : null, Cfg.dataDisplayLimit),
            runTask({ type: RPCTaskType.RunSubmitAnswer, task: task }, this.priority, started)
        ]) as any;


        return {
            type: runResult.result,
            time: NaN,
            memory: NaN,
            input: { name: curCase.input, content: inputContent },
            output: { name: curCase.output, content: outputContent },
            scoringRate: runResult.scoringRate,
            userOutput: readBufferLength(userOutput, Cfg.dataDisplayLimit),
            spjMessage: runResult.spjMessage,
        }
    }

    async cleanup(): Promise<void> {
        await remove(this.tempDirectory);
    }
}
