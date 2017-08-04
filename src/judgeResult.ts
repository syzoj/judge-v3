import _ = require('lodash');
import winston = require('winston');

export interface JudgeResultSubmit {
    taskId: number;
    time: number;
    memory: number;
    score: number;
    statusNumber: number;
    statusString: string;
    result: JudgeResult;
}

import { JudgeResult, TaskResult, TaskStatus, ErrorType, SubtaskResult, TestCaseResult, TestCaseDetails } from './interfaces';

const compileError = "Compile Error",
    systemError = "System Error",
    testdataError = "No Testdata";

export const statusToString = {};
statusToString[TaskResult.Accepted] = "Accepted";
statusToString[TaskResult.WrongAnswer] = "Wrong Answer";
statusToString[TaskResult.PartiallyCorrect] = "Partially Correct";
statusToString[TaskResult.MemoryLimitExceeded] = "Memory Limit Exceeded";
statusToString[TaskResult.TimeLimitExceeded] = "Time Limit Exceeded";
statusToString[TaskResult.OutputLimitExceeded] = "Output Limit Exceeded";
statusToString[TaskResult.RuntimeError] = "Runtime Error";
statusToString[TaskResult.FileError] = "File Error";
statusToString[TaskResult.JudgementFailed] = "Judgement Failed";
statusToString[TaskResult.InvalidInteraction] = "Invalid Interaction";

export function firstNonAC(t: TaskResult[]): TaskResult {
    if (t.every(v => v === TaskResult.Accepted)) {
        return TaskResult.Accepted
    } else {
        return t.find(r => r !== TaskResult.Accepted);
    }
}

export function convertResult(id: number, source: JudgeResult): JudgeResultSubmit {
    winston.debug(`Converting result for ${id}`, source);
    let time = -1,
        memory = -1,
        score = 0,
        done = true,
        statusString = null;

    if (source.compileStatus === TaskStatus.Failed) {
        statusString = compileError;
        score = 0;
    } else if (source.error != null) {
        done = false;
        score = NaN;
        if (source.error === ErrorType.TestDataError) {
            statusString = testdataError;
        } else {
            statusString = systemError;
        }
    } else if (source.subtasks != null) {
        if (source.subtasks.some(s => s.score === NaN)) {
            score = NaN;
            statusString = systemError;
        } else {
            score = _.sum(source.subtasks.map(s => s.score));

            const forEveryTestcase = function <TParam>(map: (v: TestCaseDetails) => TParam, reduce: (v: TParam[]) => TParam): TParam {
                return reduce(source.subtasks.map(s => reduce(s.cases.filter(c => c.result != null).map(c => map(c.result)))));
            }
            time = forEveryTestcase(c => c.time, _.sum);
            memory = forEveryTestcase(c => c.memory, _.max);
            const finalResult = forEveryTestcase(c => c.type, firstNonAC);
            statusString = statusToString[finalResult];
        }
    }

    const result = {
        taskId: id,
        time: time,
        memory: memory,
        score: score,
        statusNumber: done ? TaskStatus.Done : TaskStatus.Failed,
        statusString: statusString,
        result: source
    };
    winston.debug(`Result for ${id}`, result);
    return result;
}