import amqp = require('amqplib');
import { globalConfig as Cfg } from './config';
import msgpack = require('msgpack-lite');
import winston = require('winston');
import util = require('util');
import { cleanUp } from './cleanup';
import * as rmqCommon from '../rmq-common';
import requestErrors = require('request-promise/errors');
import { JudgeResult, ProgressReportData, ProgressReportType } from '../interfaces';

let amqpConnection: amqp.Connection;
let publicChannel: amqp.Channel;

export async function connect() {
    winston.verbose(`Connecting to RabbitMQ "${Cfg.rabbitMQ}"...`);
    amqpConnection = await amqp.connect(Cfg.rabbitMQ);
    winston.debug(`Connected to RabbitMQ, asserting queues`);
    publicChannel = await newChannel();
    await rmqCommon.assertJudgeQueue(publicChannel);
    await rmqCommon.assertResultReportQueue(publicChannel);
    await rmqCommon.assertProgressReportExchange(publicChannel);
    amqpConnection.on('error', (err) => {
        winston.error(`RabbitMQ connection failure: ${err.toString()}`);
        cleanUp(2);
    });
}

export async function disconnect() {
    await amqpConnection.close();
}

async function newChannel(): Promise<amqp.Channel> {
    return await amqpConnection.createChannel();
}

export function pushTask(task: any) {
    publicChannel.sendToQueue(rmqCommon.judgeQueueName, msgpack.encode(task), {
        priority: task.content.priority
    });
}

export async function waitForResult(handle: (result: ProgressReportData) => Promise<void>) {
    await rmqCommon.waitForTask(amqpConnection, rmqCommon.resultReportQueueName, null, (err) => {
        if (err instanceof requestErrors.RequestError || err instanceof requestErrors.StatusCodeError || err instanceof requestErrors.TransformError) {
            return true;
        } else return false;
    }, handle);
}

export async function waitForProgress(handle: (result: ProgressReportData) => Promise<void>) {
    const channel = await newChannel();
    const queueName = (await channel.assertQueue('', { exclusive: true })).queue;
    await channel.bindQueue(queueName, rmqCommon.progressExchangeName, '');
    await channel.consume(queueName, (msg: amqp.Message) => {
        const data = msgpack.decode(msg.content) as ProgressReportData;
        winston.verbose(`Got result from progress exchange, id: ${data.taskId}`);

        handle(data).then(async () => {
            channel.ack(msg)
        }, async (err) => {
            channel.nack(msg, false, false);
        });
    });
}

export async function reportReported(taskId: string) {
    winston.verbose('Reporting report finished: ' + taskId);
    const payload = msgpack.encode({ type: ProgressReportType.Reported, taskId: taskId });
    publicChannel.publish(rmqCommon.progressExchangeName, '', payload);
}