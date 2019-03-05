import amqp = require('amqplib');
import { globalConfig as Cfg } from './config';
import msgpack = require('msgpack-lite');
import winston = require('winston');
import { RPCRequest, RPCReplyType, RPCReply } from '../interfaces';
import * as rmqCommon from '../rmq-common';
import { cleanUp } from './cleanup';

let amqpConnection: amqp.Connection;
let publicChannel: amqp.Channel;

export async function connect() {
    winston.verbose(`Connecting to RabbitMQ "${Cfg.rabbitMQ}"...`);
    amqpConnection = await amqp.connect(Cfg.rabbitMQ);
    winston.debug(`Connected to RabbitMQ, asserting queues`);
    publicChannel = await newChannel();
    await rmqCommon.assertTaskQueue(publicChannel);
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

export async function waitForTask(handle: (task: RPCRequest) => Promise<any>) {
    const channel = await newChannel();
    channel.prefetch(1);
    await channel.consume(rmqCommon.taskQueueName, async (msg: amqp.Message) => {
        const messageId = msg.properties.messageId;
        winston.info(`Got runner task, correlationId = ${msg.properties.correlationId}`);
        const response = (content: RPCReply) => {
            channel.sendToQueue(msg.properties.replyTo, msgpack.encode(content), { correlationId: msg.properties.correlationId });
        }
        response({ type: RPCReplyType.Started });

        while (true) {
            try {
                const request = msgpack.decode(msg.content) as RPCRequest;
                const result = await handle(request);
                response({ type: RPCReplyType.Finished, result: result });
                break;
            } catch (err) {
                let errorMessage = `Failed to run task ${msg.properties.correlationId}: ${err.toString()}, ${err.stack}`;
                winston.warn(errorMessage);

                // Only retry on 'Error: The child process has exited unexpectedly.'
                if (errorMessage.indexOf('Error: The child process has exited unexpectedly.') !== -1) {
                    winston.warn('Retrying.');
                    continue;
                }

                response({ type: RPCReplyType.Error, error: err.toString() });
                break;
            }
        }

        channel.ack(msg);
    }, {
            priority: Cfg.priority
        });
}
