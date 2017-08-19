require('source-map-support').install();

import express = require('express');
import bodyParser = require('body-parser');
import Bluebird = require('bluebird');
import urlLib = require('url');
import rp = require('request-promise');
import winston = require('winston');
import http = require('http');

import { globalConfig as Cfg } from './config';
import { connect, waitForResult, waitForProgress } from './rmq';
import { convertResult } from '../judgeResult';
import { ProgressReportType, OverallResult, TaskStatus, CompilationResult } from '../interfaces';
import taskRouter from './daemonRouter';
import { initializeSocketIO, createTask, updateCompileStatus, updateProgress, updateResult } from './socketio';

const app = express();
app.use(bodyParser.json());
app.use('/daemon', taskRouter);


(async () => {
    await connect();
    await waitForResult(async (result) => {
        winston.info("Reporting...", result);

        const submit = async function (url, obj) {
            winston.debug(`POST ${Cfg.remoteUrl}, data = ${JSON.stringify(obj)}`);
            await rp(urlLib.resolve(Cfg.remoteUrl, url), {
                method: 'POST',
                body: obj,
                headers: {
                    Token: Cfg.token
                },
                json: true,
                simple: true
            });
        }

        if (result.type === ProgressReportType.Finished) {
            await submit("api/v2/judge/finished", convertResult(result.taskId, result.progress as OverallResult));
        } else if (result.type === ProgressReportType.Compiled) {
            await submit("api/v2/judge/compiled", {
                taskId: result.taskId,
                result: result.progress
            });
        } else {

        }
        winston.verbose("Reported.");
    });
    await waitForProgress(async (result) => {
        if (result.type === ProgressReportType.Started) {
            createTask(result.taskId);
        } else if (result.type === ProgressReportType.Compiled) {
            updateCompileStatus(result.taskId, result.progress as CompilationResult);
        } else if (result.type === ProgressReportType.Progress) {
            updateProgress(result.taskId, result.progress as OverallResult);
        } else if (result.type === ProgressReportType.Finished) {
            updateResult(result.taskId, result.progress as OverallResult);
        }
    });
})().then(() => {
    const server = http.createServer(app);
    server.listen(Cfg.listen.port, Cfg.listen.host);
});