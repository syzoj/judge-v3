require('source-map-support').install();

import winston = require('winston');
import { globalConfig as Cfg } from './config';
import util = require('util');
import rmq = require('./rmq');
import { judge } from './judge';
import { JudgeResult, ErrorType, ProgressReportType, OverallResult } from '../interfaces';

(async function () {
    winston.info("Daemon starts.");
    await rmq.connect();
    winston.info("Start consuming the queue.");
    await rmq.waitForTask(async (task) => {
        let result: OverallResult;
        try {
            await rmq.reportProgress({ taskId: task.content.taskId, type: ProgressReportType.Started, progress: null });
            result = await judge(task.content, task.extraData, async (progress) => {
                await rmq.reportProgress({ taskId: task.content.taskId, type: ProgressReportType.Progress, progress: progress });
            }, async (progress) => {
                const data = { taskId: task.content.taskId, type: ProgressReportType.Compiled, progress: progress };
                await rmq.reportProgress(data);
                await rmq.reportResult(data);
            });
        } catch (err) {
            winston.warn(`Judge error!!! TaskId: ${task.content.taskId}`, err);
            result = { error: ErrorType.SystemError, systemMessage: `An error occurred.\n${err.toString()}` };
        }
        const resultReport = { taskId: task.content.taskId, type: ProgressReportType.Finished, progress: result };
        await rmq.reportProgress(resultReport);
        await rmq.reportResult(resultReport);
    });
})().then(() => { winston.info("Initialization logic completed."); }, (err) => { winston.error(util.inspect(err)); process.exit(1); });