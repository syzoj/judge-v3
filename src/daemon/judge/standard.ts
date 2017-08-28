import { TestData, StandardJudgeParameter, TestcaseJudge } from '../interfaces';
import { TaskStatus, ErrorType, TestcaseDetails, CompilationResult, JudgeResult, TestcaseResult, StandardRunTask, StandardRunResult, RPCTaskType } from '../../interfaces';
import { globalConfig as Cfg } from '../config';
import { cloneObject, readFileLength } from '../../utils';
import { compile } from './compile';
import { Language, getLanguage } from '../../languages';
import { runTask } from '../rmq';
import { JudgerBase } from './judger-base';

import pathLib = require('path');
import winston = require('winston');

export class StandardJudger extends JudgerBase {
    parameters: StandardJudgeParameter;
    userCodeLanguage: Language;
    spjExecutableName: string = null;
    userCodeExecuableName: string = null;

    constructor(testData: TestData,
        param: StandardJudgeParameter,
        priority: number) {
        super(testData, priority);
        this.parameters = param;
        this.userCodeLanguage = getLanguage(param.language);
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
        const language = getLanguage(this.parameters.language);
        const [executableName, compilationResult] = await compile(
            this.parameters.code,
            language,
            this.testData.extraSourceFiles[language.name],
            this.priority
        );
        this.userCodeExecuableName = executableName;
        return compilationResult;
    }

    async judgeTestcase(curCase: TestcaseJudge, started: () => Promise<void>): Promise<TestcaseDetails> {
        const task: StandardRunTask = {
            testDataName: this.testData.name,
            inputData: curCase.input,
            answerData: curCase.output,
            time: this.parameters.timeLimit,
            memory: this.parameters.memoryLimit,
            fileIOInput: this.parameters.fileIOInput,
            fileIOOutput: this.parameters.fileIOOutput,
            userExecutableName: this.userCodeExecuableName,
            spjExecutableName: this.spjExecutableName
        };

        const [inputContent, outputContent, runResult]: [string, string, StandardRunResult] = await Promise.all([
            readFileLength(curCase.input ? pathLib.join(Cfg.testDataDirectory, this.testData.name, curCase.input) : null, Cfg.dataDisplayLimit),
            readFileLength(curCase.output ? pathLib.join(Cfg.testDataDirectory, this.testData.name, curCase.output) : null, Cfg.dataDisplayLimit),
            runTask({ type: RPCTaskType.RunStandard, task: task }, this.priority, started)
        ]) as any;

        return {
            type: runResult.result,
            time: runResult.time,
            memory: runResult.memory,
            userError: runResult.userError,
            userOutput: runResult.userOutput,
            scoringRate: runResult.scoringRate,
            spjMessage: runResult.spjMessage,
            input: { name: curCase.input, content: inputContent },
            output: { name: curCase.output, content: outputContent },
            systemMessage: runResult.systemMessage
        };
    }
}