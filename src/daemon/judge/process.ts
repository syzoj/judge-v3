import { TestData, StandardJudgeParameter, SubtaskJudge, TestCaseJudge, SubtaskScoringType } from '../interfaces';
import { SubtaskResult, TestCaseDetails, TaskStatus, TestCaseResult, JudgeResult } from '../../interfaces';
import { globalConfig as Cfg } from '../config';
import winston = require('winston');
import _ = require('lodash');

const globalFullScore = 100;
function calculateSubtaskScore(scoring: SubtaskScoringType, scores: number[]): number {
    if (scoring === SubtaskScoringType.Minimum) {
        return _.min(scores);
    } else if (scoring === SubtaskScoringType.Multiple) {
        return _.reduce(scores,
            (res, cur) => res * cur, 1);
    } else if (scoring === SubtaskScoringType.Summation) {
        return _.sum(scores) / scores.length;
    }
}

export async function processJudgement(
    subtasks: SubtaskJudge[],
    reportProgress: (r: SubtaskResult[]) => Promise<void>,
    judgeTestCase: (curCase: TestCaseJudge, started: () => Promise<void>) => Promise<TestCaseDetails>,
): Promise<SubtaskResult[]> {
    const results: SubtaskResult[] = subtasks.map(t => ({
        cases: t.cases.map(j => ({
            status: TaskStatus.Waiting
        }))
    }));
    winston.debug(`Totally ${results.length} subtasks.`);

    const judgeTasks: Promise<void>[] = [];
    for (let subtaskIndex = 0; subtaskIndex < subtasks.length; subtaskIndex++) {
        const currentResult = results[subtaskIndex];
        const currentTask = subtasks[subtaskIndex];

        judgeTasks.push((async () => {
            // Type minimum is skippable, run one by one
            if (currentTask.type !== SubtaskScoringType.Summation) {
                let skipped: boolean = true;
                for (let index = 0; index < currentTask.cases.length; index++) {
                    const currentTaskResult = currentResult.cases[index];
                    if (skipped) {
                        currentTaskResult.status = TaskStatus.Skipped;
                    } else {
                        winston.verbose(`Judging ${subtaskIndex}, case ${index}.`);
                        let score = 0;
                        try {
                            const taskJudge = await judgeTestCase(currentTask.cases[index], async () => {
                                currentTaskResult.status = TaskStatus.Running;
                                await reportProgress(results);
                            });
                            currentTaskResult.status = TaskStatus.Done;
                            currentTaskResult.result = taskJudge;
                            score = taskJudge.scoringRate;
                        } catch (err) {
                            currentTaskResult.status = TaskStatus.Failed;
                            currentTaskResult.errorMessage = err.toString();
                            winston.warn(`Task runner error: ${err.toString()} (subtask ${subtaskIndex}, case ${index})`);
                        }
                        if (score === 0) {
                            winston.debug(`Subtask ${subtaskIndex}, case ${index}: zero, skipping the rest.`);
                            skipped = true;
                        }
                        await reportProgress(results);
                    }
                }
            } else {
                // Non skippable, run all immediately
                const caseTasks: Promise<void>[] = [];
                for (let index = 0; index < currentTask.cases.length; index++) {
                    caseTasks.push((async () => {
                        const currentTaskResult = currentResult.cases[index];
                        winston.verbose(`Judging ${subtaskIndex}, case ${index}.`);
                        try {
                            currentTaskResult.result = await judgeTestCase(currentTask.cases[index], async () => {
                                currentTaskResult.status = TaskStatus.Running;
                                await reportProgress(results);
                            });
                            currentTaskResult.status = TaskStatus.Done;
                        } catch (err) {
                            currentTaskResult.status = TaskStatus.Failed;
                            currentTaskResult.errorMessage = err.toString();
                            winston.warn(`Task runner error: ${err.toString()} (subtask ${subtaskIndex}, case ${index})`);
                        }
                        await reportProgress(results);
                    })());
                }
                await Promise.all(caseTasks);
            }
            if (currentResult.cases.some(c => c.status === TaskStatus.Failed)) {
                // If any testcase has failed, the score is invaild.
                currentResult.score = NaN;
            } else {
                currentResult.score = calculateSubtaskScore(currentTask.type, currentResult.cases.map(c => c.result ? c.result.scoringRate : 0)) * currentTask.score;
            }
            winston.verbose(`Subtask ${subtaskIndex}, finished`);
        })());
    }
    await Promise.all(judgeTasks);
    return results;
}