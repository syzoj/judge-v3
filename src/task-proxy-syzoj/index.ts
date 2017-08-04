require('source-map-support').install();

import express = require('express');
import bodyParser = require('body-parser');
import Bluebird = require('bluebird');
import url = require('url');
import rp = require('request-promise');

import { globalConfig as Cfg } from './config';
import { connect, pushTask, waitForResult } from './rmq';
import { convertResult } from '../judgeResult';

const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
    if (req.get('Token') !== Cfg.token) {
        return res.status(403).send('Incorrect token');
    } else {
        next();
    }
});

app.post('/task', (req, res) => {
    if (!req.body) {
        return res.sendStatus(400);
    }
    try {
        pushTask(req.body);
        return res.status(200).send('OK');
    } catch (err) {
        return res.status(500).send(err.toString());
    }
});

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