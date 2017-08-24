import {disconnect as disconnectRMQ } from './rmq';
import winston = require('winston');

export function cleanUp(retCode: number) {
    winston.info('Cleaning up...');
    disconnectRMQ();
    process.exit(1);
}