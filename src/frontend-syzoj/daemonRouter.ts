import express = require('express');
import winston = require('winston');
import urlLib = require('url');
import rp = require('request-promise');

import { globalConfig as Cfg } from './config';
import { pushTask } from './rmq';

const taskRouter: express.Router = express.Router();

interface JudgeTask {
    content: any;
    extraFileLocation?: string;
}

taskRouter.use((req, res, next) => {
    if (req.get('Token') !== Cfg.token) {
        return res.status(403).send('Incorrect token');
    } else {
        next();
    }
});

taskRouter.put('/task', async (req, res) => {
    if (!req.body) {
        return res.sendStatus(400);
    }
    try {
        winston.info("Got task: " + JSON.stringify(req.body.content.taskId));
        const task = req.body as JudgeTask;
        let extraData: Buffer = null;
        if (task.extraFileLocation != null) {
            winston.verbose(`Have extra data, downloading from '${task.extraFileLocation}'...`);
            extraData = await rp(urlLib.resolve(Cfg.remoteUrl, task.extraFileLocation), {
                encoding: null,
                simple: true
            });
            winston.verbose("Extra data downloaded.");
        }
        pushTask({ content: task.content, extraData: extraData });
        return res.status(200).send('OK');
    } catch (err) {
        return res.status(500).send(err.toString());
    }
});

export default taskRouter;