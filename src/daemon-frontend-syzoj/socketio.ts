import http = require('http');
import socketio = require('socket.io');
import diff = require('jsondiffpatch');
import jwt = require('jsonwebtoken');
import winston = require('winston');

import { globalConfig as Cfg } from './config';
import { convertResult } from '../judgeResult';
import { JudgeResult, TaskStatus, CompilationResult, OverallResult } from '../interfaces';

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

const currentJudgeList: { [taskId: string]: OverallResult } = {};
const finishedJudgeList: { [taskId: string]: RoughResult } = {};
const compiledList = [];

// The detail progress is pushed to client in the delta form.
// However, the messages may arrive in an unorder form.
// In that case, the client will re-connect the server.
const clientDetailProgressList: { [clientId: string]: { version: number, content: OverallResult } } = {};
const clientDisplayConfigList: { [clientId: string]: DisplayConfig } = {};

interface DisplayConfig {
    showScore: boolean;
    showUsage: boolean;
    showCode: boolean;
    showResult: boolean;
    showDetailResult: boolean;
    showTestdata: boolean;
    inContest: boolean;
    // hideTestcaseDetails?: boolean;
};

function processOverallResult(source: OverallResult, config: DisplayConfig): OverallResult {
    if (source == null)
        return null;
    if (source.error != null) {
        return {
            error: source.error,
            systemMessage: source.systemMessage
        };
    }
    return {
        compile: source.compile,
        judge: config.showDetailResult ? (source.judge && {
            subtasks: source.judge.subtasks && source.judge.subtasks.map(st => ({
                score: st.score,
                cases: st.cases.map(cs => ({
                    status: cs.status,
                    result: cs.result && {
                        type: cs.result.type,
                        time: config.showUsage ? cs.result.time : undefined,
                        memory: config.showUsage ? cs.result.memory : undefined,
                        scoringRate: cs.result.scoringRate,
                        systemMessage: cs.result.systemMessage,
                        input: config.showTestdata ? cs.result.input : undefined,
                        output: config.showTestdata ? cs.result.output : undefined,
                        userOutput: config.showTestdata ? cs.result.userOutput : undefined,
                        userError: config.showTestdata ? cs.result.userError : undefined,
                        spjMessage: config.showTestdata ? cs.result.spjMessage : undefined,
                    }
                }))
            }))
        }) : null
    }
}

function getCompileStatus(status: string): string {
    if (["System Error", "Compile Error", "No Testdata"].includes(status)) {
        return status;
    } else {
        return "Submitted";
    }
}

function processRoughResult(source: RoughResult, config: DisplayConfig): RoughResult {
    const result = config.showResult ?
        source.result :
        getCompileStatus(source.result);
    return {
        result: result,
        time: config.showUsage ? source.time : null,
        memory: config.showUsage ? source.memory : null,
        score: config.showUsage ? source.score : null
    };
}

function forAllClients(ns: SocketIO.Namespace, taskId: string, exec: (socketId: string) => void): void {
    ns.in(taskId.toString()).clients((err, clients) => {
        if (!err) {
            clients.forEach(client => {
                exec(client);
            });
        } else {
            winston.warn(`Error while listing socketio clients in ${taskId}`, err);
        }
    });
}


export function initializeSocketIO(s: http.Server) {
    ioInstance = socketio(s);

    const initializeNamespace = (name, exec: (token: any, socket: SocketIO.Socket) => Promise<any>) => {
        const newNamespace = ioInstance.of('/' + name);
        newNamespace.on('connection', (socket) => {
            socket.on('disconnect', () => {
                winston.info(`Client ${socket.id} disconnected.`);
                delete clientDisplayConfigList[socket.id];
                if (clientDetailProgressList[socket.id]) {
                    delete clientDetailProgressList[socket.id];
                }
            });
            socket.on('join', (reqJwt, cb) => {
                winston.info(`Client ${socket.id} connected.`);
                let req;
                try {
                    req = jwt.verify(reqJwt, Cfg.token);
                    if (req.type !== name) {
                        throw new Error("Request type in token mismatch.");
                    }
                    clientDisplayConfigList[socket.id] = req.displayConfig;
                } catch (err) {
                    winston.info('The client has an incorrect token.');
                    cb({
                        ok: false,
                        message: err.toString()
                    });
                    return;
                }
                const taskId = req.taskId;
                winston.verbose(`A client trying to join ${name} namespace for ${taskId}.`);
                socket.join(taskId.toString());
                exec(req, socket).then(x => cb(x), err => cb({ ok: false, message: err.toString() }));
            });
        });
        return newNamespace;
    };

    detailProgressNamespace = initializeNamespace('detail', async (req, socket) => {
        const taskId = req.taskId;
        if (finishedJudgeList[taskId]) {
            winston.debug(`Judge task #${taskId} has been finished, ${JSON.stringify(currentJudgeList[taskId])}`);
            return {
                ok: true,
                running: false,
                finished: true,
                result: processOverallResult(currentJudgeList[taskId], clientDisplayConfigList[socket.id]),
                roughResult: processRoughResult(finishedJudgeList[taskId], clientDisplayConfigList[socket.id])
            };
        } else {
            winston.debug(`Judge task #${taskId} has not been finished`);
            // If running
            if (currentJudgeList[taskId]) {
                clientDetailProgressList[socket.id] = {
                    version: 0,
                    content: processOverallResult(currentJudgeList[taskId], clientDisplayConfigList[socket.id])
                };
                return {
                    ok: true,
                    finished: false,
                    running: true,
                    current: clientDetailProgressList[socket.id]
                };
            } else {
                // If not running yet, the creation of clientDetailProgressList
                // will be done in the starting procedure (createTask function).
                return {
                    ok: true,
                    finished: false,
                    running: false
                };
            }
        }
    });

    roughProgressNamespace = initializeNamespace('rough', async (req, socket) => {
        const taskId = req.taskId;
        if (currentJudgeList[taskId]) {
            return {
                ok: true,
                running: true,
                finished: false
            };
        } else if (finishedJudgeList[taskId]) {
            return {
                ok: true,
                running: false,
                finished: true,
                result: processRoughResult(finishedJudgeList[taskId], clientDisplayConfigList[socket.id])
            };
        } else {
            return {
                ok: true,
                running: false,
                finished: false
            };
        }
    });

    compileProgressNamespace = initializeNamespace('compile', async (req, socket) => {
        const taskId = req.taskId;
        if (compiledList[taskId]) {
            return {
                ok: true,
                running: false,
                finished: true,
                result: compiledList[taskId]
            };
        } else if (currentJudgeList[taskId]) {
            return {
                ok: true,
                running: true,
                finished: false
            };
        } else {
            return {
                ok: true,
                running: false,
                finished: false
            };
        }
    });
}

export function createTask(taskId: string) {
    winston.debug(`Judge task #${taskId} has started`);

    currentJudgeList[taskId] = {};
    finishedJudgeList[taskId] = null;
    forAllClients(detailProgressNamespace, taskId, (clientId) => {
        clientDetailProgressList[clientId] = {
            version: 0,
            content: {}
        };
    });

    roughProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
    detailProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
    compileProgressNamespace.to(taskId.toString()).emit("start", { taskId: taskId });
}

export function updateCompileStatus(taskId: string, result: CompilationResult) {
    winston.debug(`Updating compilation status for #${taskId}`);

    compiledList[taskId] = { result: result.status === TaskStatus.Done ? 'Submitted' : 'Compile Error' };
    compileProgressNamespace.to(taskId.toString()).emit('finish', {
        taskId: taskId,
        result: compiledList[taskId]
    });
}

export function updateProgress(taskId: string, data: OverallResult) {
    winston.verbose(`Updating progress for #${taskId}, data: ${JSON.stringify(data)}`);

    currentJudgeList[taskId] = data;
    forAllClients(detailProgressNamespace, taskId, (client) => {
        winston.debug(`Pushing progress update to ${client}`)
        if (clientDetailProgressList[client] && clientDisplayConfigList[client]) { // avoid race condition
            const original = clientDetailProgressList[client].content;
            const updated = processOverallResult(currentJudgeList[taskId], clientDisplayConfigList[client]);
            const version = clientDetailProgressList[client].version;
            winston.warn("Original: " + JSON.stringify(original) + "\n Updated: " + JSON.stringify(updated));
            detailProgressNamespace.sockets[client].emit('update', {
                taskId: taskId,
                from: version,
                to: version + 1,
                delta: diff.diff(original, updated)
            })
            clientDetailProgressList[client].version++;
        }
    });
}

export function updateResult(taskId: string, data: OverallResult) {
    currentJudgeList[taskId] = data;

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

    forAllClients(roughProgressNamespace, taskId, (client) => {
        winston.debug(`Pushing rough result to ${client}`)
        roughProgressNamespace.sockets[client].emit('finish', {
            taskId: taskId,
            result: processRoughResult(finishedJudgeList[taskId], clientDisplayConfigList[client])
        });
    });

    forAllClients(detailProgressNamespace, taskId, (client) => {
        if (clientDisplayConfigList[client]) { // avoid race condition
            winston.debug(`Pushing detail result to ${client}`)
            detailProgressNamespace.sockets[client].emit('finish', {
                taskId: taskId,
                result: processOverallResult(currentJudgeList[taskId], clientDisplayConfigList[client]),
                roughResult: processRoughResult(finishedJudgeList[taskId], clientDisplayConfigList[client])
            });
            delete clientDetailProgressList[client];
        }
    });
}

export function cleanupProgress(taskId: string) {
    // Prevent race condition
    setTimeout(() => { delete currentJudgeList[taskId]; }, 10000);
}