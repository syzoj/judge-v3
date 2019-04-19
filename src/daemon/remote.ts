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
		try {
			await waitForSingleTask(handle);
		} catch(e) {
			winston.error("Failed to fetch task", e);
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
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
                        testData: v.problemId,
                        type: 1,
                        priority: 1,
                        param: {
                            language: v.code.language,
                            code: v.code.code,
                            timeLimit: v.data.timeLimit * 1000,
                            memoryLimit: v.data.memoryLimit
                        }
                    }
                };
                winston.verbose('Received task', v, task);
	    	    handle(task).then(() => resolve()).catch((err) => reject(err));
            }
        });
    });
}

let curTask: any;
function getCurTask(): Promise<any> {
    if(curTask)
        return Promise.resolve(curTask);
    curTask = grpcJudgeService.handleTask((err, resp) => {
        if(err) {
            winston.error("Failed to handle task", err);
        }
    });
    return curTask;
}

export async function reportProgress(data: ProgressReportData) {
    winston.verbose('Reporting progress', data);
    let task = await getCurTask();
    task.write({ auth: Cfg.serverToken, response: { legacy: data }});
}

export async function reportResult(data: ProgressReportData) {
    winston.verbose('Reporting result', data);
    let task = await getCurTask();
    task.write({ auth: Cfg.serverToken, response: { legacy: data }, done: true });
    task.end();
    curTask = null;
}
