import winston = require('winston');
import rmq = require('../rmq');

import { JudgeTaskContent, JudgeTask, ProblemType, TestData, StandardJudgeParameter } from '../interfaces';
import { StandardJudger } from './standard';
import { JudgerBase } from './judger-base';
import { JudgeResult, ErrorType, OverallResult, CompilationResult, TaskStatus, ProgressReportType } from '../../interfaces';
import { readRulesFile } from '../testData';
import { filterPath } from '../../utils';
import { AnswerSubmissionJudger } from './submit-answer';

export async function judge(
    task: JudgeTaskContent,
    extraData: Buffer,
    reportProgress: (p: OverallResult) => Promise<void>,
    reportCompileProgress: (p: CompilationResult) => Promise<void>
): Promise<OverallResult> {
    winston.verbose(`Judging ${task.taskId}`);
    // Parse test data
    let testData: TestData = null;
    try {
        winston.debug(`Reading rules file for ${task.testData}...`);
        testData = await readRulesFile(filterPath(task.testData));
    } catch (err) {
        winston.info(`Error reading test data for ${task.testData}`, err);
        return { error: ErrorType.TestDataError, systemMessage: `An error occurred while parsing test data: ${err.toString()}` };
    }
    if (testData == null) {
        winston.verbose(`Test data ${task.testData} unavailable`);
        return { error: ErrorType.TestDataError, systemMessage: "Testdata unavailable." };
    }

    let judger: JudgerBase;
    if (task.type === ProblemType.Standard) {
        judger = new StandardJudger(testData, task.param as StandardJudgeParameter, task.priority);
    } else if (task.type === ProblemType.AnswerSubmission) {
        judger = new AnswerSubmissionJudger(testData, extraData, task.priority);
    } else {
        throw new Error(`Task type not supported`);
    }

    try {
        winston.debug(`Preprocessing testdata for ${task.testData}...`);
        await judger.preprocessTestData();
    } catch (err) {
        winston.verbose(`Test data ${task.testData} err`, err);
        return { error: ErrorType.TestDataError, systemMessage: err.toString() };
    }

    winston.debug(`Compiling...`);
    const compileResult = await judger.compile();
    winston.debug(`Reporting compilation progress...`);
    await reportCompileProgress(compileResult);
    if (compileResult.status !== TaskStatus.Done) {
        winston.verbose(`Compilation error: ${compileResult.message}`);
        return {
            compile: compileResult
        };
    }
    winston.debug(`Judging...`);
    const judgeResult = await judger.judge(r => reportProgress({ compile: compileResult, judge: r }));
    
    await judger.cleanup();
    return { compile: compileResult, judge: judgeResult };
}