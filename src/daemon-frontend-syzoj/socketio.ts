import http = require('http');
import socketio = require('socket.io');
import diff = require('jsondiffpatch');
import jwt = require('jsonwebtoken');

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
const finishedJudgeList = {};

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
                cb({
                    ok: false,
                    message: err.toString()
                });
                return;
            }
            const taskId = req.taskId;
            socket.join(taskId.toString());
            if (finishedJudgeList[taskId]) {
                cb({
                    ok: true,
                    finished: true,
                    result: currentJudgeList[taskId],
                    roughResult: finishedJudgeList[taskId]
                });
            } else {
                cb({
                    ok: true,
                    finished: false,
                    current: currentJudgeList[taskId] || { running: false }
                });
            }
        });
    });

    roughProgressNamespace.on('connection', (socket) => {
        socket.on('join', (reqJwt, cb) => {
            let req;
            try {
                req = jwt.verify(reqJwt, Cfg.token);
                if (req.type !== 'rough') {
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
            if (currentJudgeList[taskId]) {
                cb({
                    ok: true,
                    running: true,
                    finished: false
                });
            } else if (finishedJudgeList[taskId]) {
                // This is not likely to happen. If some task is processed, 
                // The client should not process it.
                cb({
                    ok: true,
                    running: false,
                    finished: true,
                    result: finishedJudgeList[taskId]
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
                if (req.type !== 'compile') {
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
            if (finishedJudgeList[taskId]) {
                cb({
                    ok: true,
                    finished: true
                });
            } else if (currentJudgeList[taskId]
                && currentJudgeList[taskId].current
                && currentJudgeList[taskId].current.compile) {
                cb({
                    ok: true,
                    finished: true
                });
            } else {
                cb({
                    ok: true,
                    finished: false
                });
            }
        });
    });
}

export function createTask(taskId: number) {
    detailProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
    roughProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
    compileProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
    currentJudgeList[taskId] = { running: true, current: null };
}

export function updateCompileStatus(taskId: number, result: CompilationResult) {
    compileProgressNamespace.to(taskId.toString()).emit('compiled', {
        taskId: taskId,
        result: {
            ok: result.status === TaskStatus.Done,
            message: result.message
        }
    });
}

export function updateProgress(taskId: number, data: OverallResult) {
    // currentJudgeList[taskId].current = data;
    const original = currentJudgeList[taskId].current;
    const delta = diff.diff(original, data);
    detailProgressNamespace.to(taskId.toString()).emit('update', {
        taskId: taskId,
        delta: delta
    });
    currentJudgeList[taskId].current = data;
}

export function updateResult(taskId: number, data: OverallResult) {
    const finalResult = convertResult(taskId, data);
    const roughResult = {
        result: finalResult.statusString,
        time: finalResult.time,
        memory: finalResult.memory,
        score: finalResult.score
    };
    roughProgressNamespace.to(taskId.toString()).emit('finish', {
        taskId: taskId,
        result: roughResult
    });
    detailProgressNamespace.to(taskId.toString()).emit('finish', {
        taskId: taskId,
        roughResult: roughResult,
        result: data
    });
    finishedJudgeList[taskId] = roughResult;
}

export function cleanupProgress(taskId: number) {
    // Prevent race condition
    setTimeout(() => delete currentJudgeList[taskId], 10000);
}