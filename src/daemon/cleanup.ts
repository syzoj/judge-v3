import { disconnect as disconnectRMQ } from './rmq';
import { disconnect as disconnectSIO } from './remote';
import winston = require('winston');

export function cleanUp(retCode: number) {
    winston.info('Cleaning up...');
    disconnectRMQ();
    disconnectSIO();
    process.exit(retCode);
}
