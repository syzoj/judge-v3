import amqp = require('amqplib');

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