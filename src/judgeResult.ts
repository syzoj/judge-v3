import _ = require('lodash');

export interface JudgeResultSubmit {
    taskId: number;
    time: number;
    memory: number;
    score: number;
    statusNumber: number;
    statusString: string;
    result: string;
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
    let time = -1,
        memory = -1,
        score = 0,
        done = true,
        statusString = null;

    if (source.compileStatus === TaskStatus.Failed) {
        statusString = compileError;
    } else if (source.error != null) {
        done = false;
        score = -1;
        if (source.error === ErrorType.TestDataError) {
            statusString = testdataError;
        } else {
            statusString = systemError;
        }
    } else if (source.subtasks != null) {
        if (source.subtasks.some(s => s.score === -1)) {
            score = -1;
            statusString = systemError;
        } else {
            const finalResult = firstNonAC(source.subtasks.map(s => firstNonAC(s.cases.filter(c => c.result != null).map(c => c.result.type))));
            statusString = statusToString[finalResult];
            score = _.sum(source.subtasks.map(s => s.score));
        }
    }

    return {
        taskId: id,
        time: time,
        memory: memory,
        score: score,
        statusNumber: done ? TaskStatus.Done : TaskStatus.Failed,
        statusString: statusString,
        result: JSON.stringify(source)
    };
}