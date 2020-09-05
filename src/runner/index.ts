require('source-map-support').install();

import winston = require('winston');
import { globalConfig as Cfg } from './config';
import util = require('util');
import rmq = require('./rmq');
import { RPCRequest, RPCTaskType } from '../interfaces';
import { compile } from './compile';
import { judgeStandard, judgeAnswerSubmission, judgeInteraction } from './judge';

(async function () {
    winston.info("Runner starts.");
    await rmq.connect();
    winston.info("Start consuming the queue.");
    await rmq.waitForTask(async (task) => {
        winston.debug(`Handling task ${util.inspect(task)}`);
        if (task.type === RPCTaskType.Compile) {
            winston.debug("Task type is compile");
            return await compile(task.task);
        } else if (task.type === RPCTaskType.RunStandard) {
            return await judgeStandard(task.task);
        } else if (task.type === RPCTaskType.RunSubmitAnswer) {
            return await judgeAnswerSubmission(task.task);
        } else if (task.type === RPCTaskType.RunInteraction) {
            return await judgeInteraction(task.task);
        } else {
            winston.warn("Task type unsupported");
            throw new Error(`Task type ${task.type} not supported!`);
        }
	});
})().then(() => { winston.info("Initialization logic completed."); }, (err) => { winston.error(util.inspect(err)); process.exit(1); });
