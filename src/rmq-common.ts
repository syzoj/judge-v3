import amqp = require('amqplib');
import winston = require('winston');
import msgpack = require('msgpack-lite');

export const maxPriority = 5;
export const taskQueueName = 'task';

export async function assertTaskQueue(channel: amqp.Channel) {
    await channel.assertQueue(taskQueueName, {
        maxPriority: maxPriority
    });
}

export async function waitForTask<T>(conn: amqp.Connection, queueName: string, priority: number, retry: (err: Error) => boolean, handle: (task: T) => Promise<void>) {
    const channel = await conn.createChannel();
    channel.prefetch(1);
    await channel.consume(queueName, (msg: amqp.Message) => {
        const data = msgpack.decode(msg.content) as T;
        winston.verbose('Got task');

        handle(data).then(async () => {
            channel.ack(msg);
        }, async (err) => {
            if (retry)
                await new Promise((res) => setTimeout(res, 300));
            winston.warn(`Failed to process message: ${err.toString()}`);
            channel.nack(msg, false, retry(err));
        });
    }, {
        priority: priority
    });
}
