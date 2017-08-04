import { JudgeTask, ProblemType, TestData, StandardJudgeParameter } from '../interfaces';
import { judgeStandard } from './standard';
import {JudgeResult, ErrorType} from '../../interfaces';
import { readRulesFile } from '../testData';
import { filterPath } from '../../utils';
import winston = require('winston');

export async function judge(
    task: JudgeTask, reportProgress: (p: JudgeResult) => Promise<void>
): Promise<JudgeResult> {
    winston.verbose(`Judging ${task.taskId}`);
    // Parse test data
    let testData: TestData = null;
    try {
        testData = await readRulesFile(filterPath(task.testData));
    } catch (err) {
        winston.info(`Error reading test data for ${task.testData}`, err);
        return { error: ErrorType.TestDataError, systemMessage: `An error occurred while parsing test data: ${err.toString()}` };
    }
    if (testData == null) {
        winston.verbose(`Test data ${task.testData} unavailable`);
        return { error: ErrorType.TestDataError, systemMessage: "Testdata unavailable." };
    }

    // Do things
    if (task.type === ProblemType.Standard) {
        return await judgeStandard(testData, task.param as StandardJudgeParameter, task.priority, reportProgress);
    } else {
        throw new Error(`Task type not supported`);
    }
}