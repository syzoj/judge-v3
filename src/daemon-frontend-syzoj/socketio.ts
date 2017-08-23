import http = require('http');
import socketio = require('socket.io');
import diff = require('jsondiffpatch');
import jwt = require('jsonwebtoken');
import winston = require('winston');

import { globalConfig as Cfg } from './config';
import { convertResult } from '../judgeResult';
import { JudgeResult, TaskStatus, CompilationResult, OverallResult } from '../interfaces';

interface JudgeData {
    running: boolean;
    current?: OverallResult;
}

interface RoughResult {
    result: string;
    score: number;
    time: number;
    memory: number;
}

let ioInstance: SocketIO.Server;
let detailProgressNamespace: SocketIO.Namespace;
// To do: find a better name
let roughProgressNamespace: SocketIO.Namespace;
// Provide support for NOI contests in which participants
// can only see whether his / her submission is successfully compiled.
let compileProgressNamespace: SocketIO.Namespace;

const currentJudgeList: JudgeData[] = [];
const finishedJudgeList: RoughResult[] = [];
const compiledList = [];

interface DisplayConfig {
    pushType: string;
    hideScore: boolean;
    hideUsage: boolean;
    hideCode: boolean;
    hideResult: boolean;
    hideTestcaseDetails?: boolean;
};

function getCompileStatus(status: string): string {
    if (["System Error", "Compile Error", "No Testdata"].includes(status)) {
        return status;
    } else {
        return "Submitted";
    }
}

function processRoughResult(source: RoughResult, config: DisplayConfig): RoughResult {
    const result = config.hideResult ?
        getCompileStatus(source.result) :
        source.result;
    return {
        result: result,
        time: config.hideUsage ? null : source.time,
        memory: config.hideUsage ? null : source.memory,
        score: config.hideUsage ? null : source.score
    };
}

const clientList: { [id: string]: DisplayConfig } = {};

export function initializeSocketIO(s: http.Server) {
    ioInstance = socketio(s);
    detailProgressNamespace = ioInstance.of('/detail');
    roughProgressNamespace = ioInstance.of('/rough');
    compileProgressNamespace = ioInstance.of('/compile');

    // TODO: deduplicate the following code.
    detailProgressNamespace.on('connection', (socket) => {
        socket.on('join', (reqJwt, cb) => {
            let req;
            try {
                req = jwt.verify(reqJwt, Cfg.token);
                if (req.type !== 'detail') {
                    throw new Error("Request type in token mismatch.");
                }
            } catch (err) {
                winston.info('The client has an incorrect token.');
                cb({
                    ok: false,
                    message: err.toString()
                });
                return;
            }
            const taskId = req.taskId;
            winston.verbose(`A client trying to get detailed progress for ${taskId}.`);
            socket.join(taskId.toString());
            if (finishedJudgeList[taskId]) {
                winston.debug(`Judge task #${taskId} has been finished, ${JSON.stringify(currentJudgeList[taskId])}`);
                cb({
                    ok: true,
                    finished: true,
                    result: currentJudgeList[taskId],
                    roughResult: finishedJudgeList[taskId]
                });
            } else {
                winston.debug(`Judge task #${taskId} has not been finished`);
                cb({
                    ok: true,
                    finished: false,
                    current: currentJudgeList[taskId] || { running: false }
                });
            }
        });
    });
    roughProgressNamespace.on('connection', (socket) => {
        socket.on('disconnect', () => {
            delete clientList[socket.id];
        })
        socket.on('join', (reqJwt, cb) => {
            let req;
            try {
                req = jwt.verify(reqJwt, Cfg.token);
                if (req.displayConfig.pushType !== 'rough') {
                    throw new Error("Permission denied");
                }
                clientList[socket.id] = req.displayConfig;
            } catch (err) {
                cb({
                    ok: false,
                    message: err.toString()
                });
                return;
            }
            const taskId = req.taskId;
            socket.join(taskId.toString());
            if (currentJudgeList[taskId]) {
                cb({
                    ok: true,
                    running: true,
                    finished: false
                });
            } else if (finishedJudgeList[taskId]) {
                // This is not likely to happen. If some task is processed, 
                // The client should not process it.
                const result = finishedJudgeList[taskId];
                cb({
                    ok: true,
                    running: false,
                    finished: true,
                    result: processRoughResult(result, clientList[socket.id])
                });
            } else {
                cb({
                    ok: true,
                    running: false,
                    finished: false
                })
            }
        });
    });

    compileProgressNamespace.on('connection', (socket) => {
        socket.on('join', (reqJwt, cb) => {
            let req;
            try {
                req = jwt.verify(reqJwt, Cfg.token);
                if (req.displayConfig.pushType !== 'compile') {
                    throw new Error("Request type in token mismatch.");
                }
            } catch (err) {
                cb({
                    ok: false,
                    message: err.toString()
                });
                return;
            }
            const taskId = req.taskId;
            socket.join(taskId.toString());
            if (compiledList[taskId]) {
                cb({
                    ok: true,
                    running: false,
                    finished: true,
                    result: compiledList[taskId]
                });
            } else if (currentJudgeList[taskId]) {
                cb({
                    ok: true,
                    running: true,
                    finished: false
                });
            } else {
                cb({
                    ok: true,
                    running: false,
                    finished: false
                });
            }
        });
    });
}

export function createTask(taskId: number) {
    winston.debug(`Judge task #${taskId} has started`);
    detailProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
    roughProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
    compileProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
    currentJudgeList[taskId] = { running: true, current: null };
}

export function updateCompileStatus(taskId: number, result: CompilationResult) {
    winston.debug(`Updating compilation status for #${taskId}`);

    compiledList[taskId] = { result: result.status === TaskStatus.Done ? 'Submitted' : 'Compile Error' };
    compileProgressNamespace.to(taskId.toString()).emit('finish', {
        taskId: taskId,
        result: compiledList[taskId]
    });
}

export function updateProgress(taskId: number, data: OverallResult) {
    winston.debug(`Updating progress for #${taskId}, data: ${JSON.stringify(data)}`);
    const original = currentJudgeList[taskId].current;
    const delta = diff.diff(original, data);
    detailProgressNamespace.to(taskId.toString()).emit('update', {
        taskId: taskId,
        delta: delta
    });
    currentJudgeList[taskId].current = data;
}

export function updateResult(taskId: number, data: OverallResult) {
    currentJudgeList[taskId].running = false;
    currentJudgeList[taskId].current = data;

    if (compiledList[taskId] == null) {
        if (data.error != null) {
            compiledList[taskId] = { result: "System Error" };
            compileProgressNamespace.to(taskId.toString()).emit('finish', {
                taskId: taskId,
                result: compiledList[taskId]
            });
        }
    }

    const finalResult = convertResult(taskId, data);
    const roughResult = {
        result: finalResult.statusString,
        time: finalResult.time,
        memory: finalResult.memory,
        score: finalResult.score
    };
    finishedJudgeList[taskId] = roughResult;
    roughProgressNamespace.to(taskId.toString()).clients((err, clients) => {
        for (const client of clients) {
            winston.debug(`Pushing rough result to ${client}`)
            roughProgressNamespace.sockets[client].emit('finish', {
                taskId: taskId,
                result: processRoughResult(finishedJudgeList[taskId], clientList[client])
            });
        }
    });
    detailProgressNamespace.to(taskId.toString()).emit('finish', {
        taskId: taskId,
        roughResult: finishedJudgeList[taskId],
        result: data
    });
}

export function cleanupProgress(taskId: number) {
    // Prevent race condition
    setTimeout(() => { delete currentJudgeList[taskId]; }, 10000);
}