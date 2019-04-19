require('source-map-support').install();

import winston = require('winston');
import { globalConfig as Cfg } from './config';
import util = require('util');
import rmq = require('./rmq');
import remote = require('./remote');
import { judge } from './judge';
import { JudgeResult, ErrorType, ProgressReportType, OverallResult, SerializedBuffer } from '../interfaces';

(async function () {
    winston.info("Daemon starts.");
    await remote.connect();
    await rmq.connect();
    winston.info("Start consuming the queue.");
    await remote.waitForTask(async (task) => {
        if (task.extraData) {
            const extraData: SerializedBuffer = task.extraData as any as SerializedBuffer;
            if (extraData.type === "Buffer") task.extraData = new Buffer(extraData.data);
        }

        let result: OverallResult;
        try {
            await remote.reportProgress({ taskId: task.content.taskId, type: ProgressReportType.Started, progress: null });
            result = await judge(task.content, task.extraData, async (progress) => {
                await remote.reportProgress({ taskId: task.content.taskId, type: ProgressReportType.Progress, progress: progress });
            }, async (progress) => {
                const data = { taskId: task.content.taskId, type: ProgressReportType.Compiled, progress: progress };
                await remote.reportProgress(data);
                //await remote.reportResult(data);
            });
        } catch (err) {
            winston.warn(`Judge error!!! TaskId: ${task.content.taskId}`, err);
            result = { error: ErrorType.SystemError, systemMessage: `An error occurred.\n${err.toString()}` };
        }
        const resultReport = { taskId: task.content.taskId, type: ProgressReportType.Finished, progress: result };
        await remote.reportProgress(resultReport);
        await remote.reportResult(resultReport);
    });
})().then(() => { winston.info("Initialization logic completed."); }, (err) => { winston.error(util.inspect(err)); process.exit(1); });
