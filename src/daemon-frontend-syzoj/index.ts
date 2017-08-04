require('source-map-support').install();

import express = require('express');
import bodyParser = require('body-parser');
import Bluebird = require('bluebird');
import url = require('url');
import rp = require('request-promise');
import winston = require('winston');

import { globalConfig as Cfg } from './config';
import { connect, waitForResult } from './rmq';
import { convertResult } from '../judgeResult';
import taskRouter from './taskRouter';

const app = express();
app.use(bodyParser.json());
app.use('/daemon', taskRouter);

(async () => {
    await connect();
    await waitForResult(async (result) => {
        await rp(url.resolve(Cfg.remoteUrl, "api/v2/judge/update2"), {
            method: 'POST',
            body: convertResult(result.taskId, result.progress),
            headers: {
                Token: Cfg.token
            },
            json: true,
            simple: true
        });
    });
})().then(() => {
    app.listen(Cfg.listen.port, Cfg.listen.host);
});