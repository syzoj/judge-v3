import * as url from 'url';
import * as util from 'util';
import { globalConfig as Cfg } from './config';
import msgpack = require('msgpack-lite');
import winston = require('winston');
import { ProgressReportData } from '../interfaces';
import { JudgeTask } from './interfaces';
import protos from '../protos';
import grpc = require('grpc');

let grpcJudgeService: any;
let cancelCurrentPull: Function;

export async function connect() {
    winston.verbose(`Connect to server "${Cfg.serverUrl}"...`);
    grpcJudgeService = new protos.syzoj.judge.JudgeService(Cfg.serverUrl, grpc.credentials.createInsecure());
    winston.verbose('Connected');
}

export async function disconnect() {
    // TODO
}

export async function waitForTask(handle: (task: JudgeTask) => Promise<void>) {
	for(;;) {
		await waitForSingleTask(handle);
	}
}

function waitForSingleTask(handle: (task: JudgeTask) => Promise<void>) {
    winston.verbose('Waiting for new task...');
    return new Promise((resolve, reject) => {
        grpcJudgeService.fetchTask({ auth: Cfg.serverToken }, function(err, result) {
            if(err) {
                reject(err);
            } else {
                let v = result.task.traditional;
	            let task: JudgeTask = {
                    content: {
                        taskId: "",
                        testData: v.problem_id,
                        type: 1,
                        priority: 1,
                        param: {
                            language: v.code.language,
                            code: v.code.code,
                            timeLimit: v.data.timeLimit / 1000000000,
                            memoryLimit: v.data.memoryLimit / 1024 / 1024
                        }
                    }
                };
                winston.verbose('Received task', v, task);
	    	    handle(task).then(() => resolve()).catch((err) => reject(err));
            }
        });
    });
}

export async function reportProgress(data: ProgressReportData) {
    winston.verbose('Reporting progress', data);
	// TODO
}

export function reportResult(data: ProgressReportData) {
    return new Promise((resolve, reject) => {
        winston.verbose('Reporting result', data);
	    grpcJudgeService.handleTask({ auth: Cfg.serverToken, response: { legacy: data }}, (err, result) => {
            if(err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}
