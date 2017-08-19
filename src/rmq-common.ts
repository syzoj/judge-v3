import amqp = require('amqplib');
import msgpack = require('msgpack-lite');
import winston = require('winston');

export const maxPriority = 5;
export const taskQueueName = 'task';
export const progressExchangeName = 'progress';
export const resultReportQueueName = 'result';
export const judgeQueueName = 'judge';

export async function assertTaskQueue(channel: amqp.Channel) {
    await channel.assertQueue(taskQueueName, {
        maxPriority: maxPriority
    });
}

// Difference between result and progress:
// The `progress' is to be handled by *all* frontend proxies and pushed to all clients.
// The `result' is to be handled only *once*, and is to be written to the database.

export async function assertProgressReportExchange(channel: amqp.Channel) {
    await channel.assertExchange(progressExchangeName, 'fanout', { durable: false });
}

export async function assertResultReportQueue(channel: amqp.Channel) {
    await channel.assertQueue(resultReportQueueName, { durable: true });
}

export async function assertJudgeQueue(channel: amqp.Channel) {
    await channel.assertQueue(judgeQueueName, {
        maxPriority: maxPriority,
        durable: true
    });
}


export async function waitForTask<T>(conn: amqp.Connection, queueName: string, priority: number, retry: (err: Error) => boolean, handle: (task: T) => Promise<void>) {
    const channel = await conn.createChannel();
    channel.prefetch(1);
    await channel.consume(queueName, (msg: amqp.Message) => {
        const data = msgpack.decode(msg.content) as T;
        winston.verbose('Got task', data);

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
