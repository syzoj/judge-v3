import amqp = require('amqplib');
import { globalConfig as Cfg } from './config';
import msgpack = require('msgpack-lite');
import winston = require('winston');
import util = require('util');
import { cleanUp } from './cleanup';
import * as rmqCommon from '../rmq-common';
import { JudgeResult, ProgressReportData } from '../interfaces';

let amqpConnection: amqp.Connection;
let publicChannel: amqp.Channel;

export async function connect() {
    winston.verbose(`Connecting to RabbitMQ "${Cfg.rabbitMQ}"...`);
    amqpConnection = await amqp.connect(Cfg.rabbitMQ);
    winston.debug(`Connected to RabbitMQ, asserting queues`);
    publicChannel = await newChannel();
    await rmqCommon.assertJudgeQueue(publicChannel);
    await rmqCommon.assertResultReportQueue(publicChannel);
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
        priority: task.priority
    });
}

export async function waitForResult(handle: (result: ProgressReportData) => Promise<void>) {
    const channel = await newChannel();
    channel.prefetch(1);
    await channel.consume(rmqCommon.resultReportQueueName, (msg: amqp.Message) => {
        winston.info(`Got result from queue`);
        (async () => {
            const data = msgpack.decode(msg.content);
            await handle(data);
        })().then(async () => {
            channel.ack(msg);
        }, async (err) => {
            winston.warn(`Failed to process message ${err.toString()}, try again`);
            setTimeout(() => { channel.nack(msg, false, true) }, 500);
        });
    });
}

export async function waitForProgress(handle: (result: ProgressReportData) => Promise<void>) {
    const channel = await newChannel();
    channel.prefetch(1);
    await channel.consume(rmqCommon.resultReportQueueName, (msg: amqp.Message) => {
        winston.info(`Got result from queue`);
        (async () => {
            const data = msgpack.decode(msg.content);
            await handle(data);
        })().then(async () => {
            channel.ack(msg);
        }, async (err) => {
            winston.warn(`Failed to process message ${err.toString()}, try again`);
            setTimeout(() => { channel.nack(msg, false, true) }, 500);
        });
    });
}
