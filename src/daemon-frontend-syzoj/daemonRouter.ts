import express = require('express');
import winston = require('winston');

import { globalConfig as Cfg } from './config';
import { pushTask } from './rmq';

const taskRouter: express.Router = express.Router();

taskRouter.use((req, res, next) => {
    if (req.get('Token') !== Cfg.token) {
        return res.status(403).send('Incorrect token');
    } else {
        next();
    }
});

taskRouter.put('/task', (req, res) => {
    if (!req.body) {
        return res.sendStatus(400);
    }
    try {
        winston.info("Got task: " + req.body);
        pushTask(req.body);
        return res.status(200).send('OK');
    } catch (err) {
        return res.status(500).send(err.toString());
    }
});

export default taskRouter;