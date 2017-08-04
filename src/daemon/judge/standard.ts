import { TestData, StandardJudgeParameter, TestCaseJudge } from '../interfaces';
import { TaskStatus, ErrorType, TestCaseDetails, JudgeResult, TaskResult, StandardRunTask, StandardRunResult, RPCTaskType } from '../../interfaces';
import { globalConfig as Cfg } from '../config';
import { cloneObject, readFileLength } from '../../utils';
import { compile } from './compile';
import { Language, getLanguage } from '../../languages';
import { processJudgement } from './process'
import { runTask } from '../rmq';
import pathLib = require('path');
import winston = require('winston');

export async function judgeStandard(
    testData: TestData,
    param: StandardJudgeParameter,
    priority: number,
    reportProgress: (progress: JudgeResult) => Promise<void>
): Promise<JudgeResult> {
    winston.debug("Running standard judging procedure.");

    let spjName: string = null;
    if (testData.spj != null) {
        winston.verbose("Compiling special judge.");
        const [spjExecutableName, spjResult] = await compile(testData.spj.sourceCode, testData.spj.language, null, priority);
        spjName = spjExecutableName;

        if (spjResult.status !== 0) {
            winston.verbose("Special judge CE.");
            let message = null;
            if (spjResult.message != null && spjResult.message !== "") {
                message = "===== Special Judge Compilation Message =====" + spjResult.message;
            }
            return { error: ErrorType.TestDataError, systemMessage: message };
        }
    }

    const language = getLanguage(param.language);
    winston.verbose("Compiling user program.");
    const [executableName, compilationResult] = await compile(
        param.code,
        language,
        testData.extraSourceFiles[language.name],
        priority
    );

    if (compilationResult.status !== 0) {
        winston.verbose("User program CE.");
        let message = null;
        if (compilationResult.message != null && compilationResult.message !== "") {
            message = compilationResult.message;
        }
        return { compileStatus: TaskStatus.Failed, compilerMessage: message };
    }

    winston.debug("Start judgement.");
    return {
        subtasks: await processJudgement(
            testData.subtasks,
            async (result) => { reportProgress({ subtasks: result }); },
            async (curCase, st) => {
                const task: StandardRunTask = {
                    testDataName: testData.name,
                    inputData: curCase.input,
                    answerData: curCase.output,
                    time: param.timeLimit,
                    memory: param.memoryLimit,
                    fileIOInput: param.fileIOInput,
                    fileIOOutput: param.fileIOOutput,
                    userExecutableName: executableName,
                    spjExecutableName: testData.spj ? spjName : null,
                };

                const [inputContent, outputContent, runResult]: [string, string, StandardRunResult] = await Promise.all([
                    readFileLength(pathLib.join(Cfg.testDataDirectory, testData.name, curCase.input), Cfg.dataDisplayLimit),
                    readFileLength(pathLib.join(Cfg.testDataDirectory, testData.name, curCase.output), Cfg.dataDisplayLimit),
                    runTask({ type: RPCTaskType.RunStandard, task: task }, priority, st)
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
            })
    };
}