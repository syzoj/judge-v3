import amqp = require('amqplib');
import { globalConfig as Cfg } from './config';
import msgpack = require('msgpack-lite');
import winston = require('winston');
import util = require('util');
import uuid = require('uuid');
import { RPCRequest, RPCReplyType, RPCReply } from '../interfaces';
import { cleanUp } from './cleanup';
import * as rmqCommon from '../rmq-common';

let amqpConnection: amqp.Connection;

export async function connect() {
    winston.verbose(`Connecting to RabbitMQ "${Cfg.rabbitMQ}"...`);
    amqpConnection = await amqp.connect(Cfg.rabbitMQ);
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

// started: Callback when this task is started.
export async function runTask(task: RPCRequest, priority: number, started?: () => void): Promise<any> {
    const correlationId = uuid();
    winston.verbose(`Sending task ${util.inspect(task)} to run, with ID ${correlationId} and priority ${priority}`);
    const channel = await newChannel();
    const callbackQueue = (await channel.assertQueue('', { exclusive: true, autoDelete: true })).queue;

    let pmres, pmrej; // TODO: What the hack(f**k)? Please refine the hack.
    const resultPromise = new Promise((res, rej) => { pmres = res; pmrej = rej; });
    const cancel = await channel.consume(callbackQueue, (msg) => {
        const reply = msgpack.decode(msg.content) as RPCReply;
        winston.verbose(`Task ${correlationId} got reply: ${util.inspect(reply)}`);

        if (reply.type === RPCReplyType.Started) {
            if (started) started();
        } else {
            channel.close().then(() => {
                if (reply.type === RPCReplyType.Finished) {
                    pmres(reply.result);
                } else if (reply.type === RPCReplyType.Error) {
                    pmrej(new Error(reply.error));
                }
            }, (err) => {
                winston.error(`Failed to close RabbitMQ channel`, err);
                pmrej(err);
            });
        }
    }, { noAck: true });
    winston.debug(`Task ${correlationId} callback queue subscribed.`);

    channel.sendToQueue(rmqCommon.taskQueueName, msgpack.encode(task), {
        correlationId: correlationId, replyTo: callbackQueue, priority: priority
    });
    winston.debug(`Task ${correlationId} sent.`);

    return resultPromise;
}
