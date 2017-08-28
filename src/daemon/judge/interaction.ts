import { TestData, InteractionJudgeParameter, TestcaseJudge } from '../interfaces';
import { TaskStatus, ErrorType, TestcaseDetails, CompilationResult, JudgeResult, TestcaseResult, InteractionRunTask, StandardRunResult, RPCTaskType } from '../../interfaces';
import { globalConfig as Cfg } from '../config';
import { cloneObject, readFileLength } from '../../utils';
import { compile } from './compile';
import { Language, getLanguage } from '../../languages';
import { runTask } from '../rmq';
import { JudgerBase } from './judger-base';

import pathLib = require('path');
import winston = require('winston');

export class InteractionJudger extends JudgerBase {
    parameters: InteractionJudgeParameter;
    userCodeLanguage: Language;
    interactorExecutableName: string = null;
    userCodeExecuableName: string = null;

    constructor(testData: TestData,
        param: InteractionJudgeParameter,
        priority: number) {
        super(testData, priority);
        this.parameters = param;
        this.userCodeLanguage = getLanguage(param.language);
    }

    async preprocessTestData(): Promise<void> {
        if (this.testData.interactor != null) {
            winston.verbose("Compiling interactor.");
            const [interactorExecutableName, interactorResult] = await compile(this.testData.interactor.sourceCode,
                this.testData.interactor.language, null, this.priority);
            if (interactorResult.status !== TaskStatus.Done) {
                winston.verbose("Special judge CE: " + interactorResult.message);
                let message = null;
                if (interactorResult.message != null && interactorResult.message !== "") {
                    message = "===== Interactor Compilation Message =====" + interactorResult.message;
                }
                throw new Error(message);
            } else {
                this.interactorExecutableName = interactorExecutableName;
            }
        } else {
            this.interactorExecutableName = null;
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
        const task: InteractionRunTask = {
            testDataName: this.testData.name,
            inputData: curCase.input,
            answerData: curCase.output,
            time: this.parameters.timeLimit,
            memory: this.parameters.memoryLimit,
            userExecutableName: this.userCodeExecuableName,
            interactorExecutableName: this.interactorExecutableName
        };

        // We do not have to create a InteractionRunResult
        const [inputContent, outputContent, runResult]: [string, string, StandardRunResult] = await Promise.all([
            readFileLength(curCase.input ? pathLib.join(Cfg.testDataDirectory, this.testData.name, curCase.input) : null, Cfg.dataDisplayLimit),
            readFileLength(curCase.output ? pathLib.join(Cfg.testDataDirectory, this.testData.name, curCase.output) : null, Cfg.dataDisplayLimit),
            runTask({ type: RPCTaskType.RunInteraction, task: task }, this.priority, started)
        ]) as any;

        return {
            type: runResult.result,
            time: runResult.time,
            memory: runResult.memory,
            userError: runResult.userError,
            userOutput: null,
            scoringRate: runResult.scoringRate,
            spjMessage: runResult.spjMessage,
            input: { name: curCase.input, content: inputContent },
            output: { name: curCase.output, content: outputContent },
            systemMessage: runResult.systemMessage
        };
    }
}