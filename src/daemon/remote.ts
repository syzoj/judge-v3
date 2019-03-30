import * as url from 'url';
import * as util from 'util';
import { globalConfig as Cfg } from './config';
import msgpack = require('msgpack-lite');
import winston = require('winston');
import { ProgressReportData } from '../interfaces';
import { JudgeTask } from './interfaces';
import * as SocketIOClient from 'socket.io-client';

let socketIOConnection: SocketIOClient.Socket;
let cancelCurrentPull: Function;

export async function connect() {
    const socketIOUrl = url.resolve(Cfg.serverUrl, 'judge');
    winston.verbose(`Connect to Socket.IO "${socketIOUrl}"...`);
    socketIOConnection = SocketIOClient(socketIOUrl);

    socketIOConnection.on('disconnect', () => {
        winston.verbose(`Disconnected from Socket.IO "${socketIOUrl}"...`);
        if (cancelCurrentPull) cancelCurrentPull();
    });
}

export async function disconnect() {
    socketIOConnection.close();
}

export async function waitForTask(handle: (task: JudgeTask) => Promise<void>) {
    while (true) {
        winston.verbose('Waiting for new task...');
        await new Promise((resolve, reject) => {
            // This should be cancelled if socket disconnects.
            let cancelled = false;
            cancelCurrentPull = () => {
                cancelled = true;
                winston.verbose('Cancelled task polling since disconnected.');
                resolve();
            }

            socketIOConnection.once('onTask', async (payload: Buffer, ack: Function) => {
                // After cancelled, a new pull is emitted while socket's still disconnected.
                if (cancelled) return;

                try {
                    winston.verbose('onTask.');
                    await handle(msgpack.decode(payload));
                    ack();
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });

            socketIOConnection.emit('waitForTask', Cfg.serverToken, () => {
                winston.verbose('waitForTask acked.');
            });
        });
    }
}

// Difference between result and progress:
// The `progress' is to be handled by *all* frontend proxies and pushed to all clients.
// The `result' is to be handled only *once*, and is to be written to the database.

export async function reportProgress(data: ProgressReportData) {
    winston.verbose('Reporting progress', data);
    const payload = msgpack.encode(data);
    socketIOConnection.emit('reportProgress', Cfg.serverToken, payload);
}

export async function reportResult(data: ProgressReportData) {
    winston.verbose('Reporting result', data);
    const payload = msgpack.encode(data);
    socketIOConnection.emit('reportResult', Cfg.serverToken, payload);
}
