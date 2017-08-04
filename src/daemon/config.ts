import * as commandLineArgs from 'command-line-args';
import * as fs from 'fs';
import * as winston from 'winston';

export interface ConfigStructure {
    rabbitMQ: string;
    testDataDirectory: string;
    priority: number;
    redis: string;
    dataDisplayLimit: number;
}

const optionDefinitions = [
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'config', alias: 'c', type: String },
];

const options = commandLineArgs(optionDefinitions);

function readJSON(path: string): any {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const configJSON = readJSON(options["config"]);
export const globalConfig: ConfigStructure = {
    rabbitMQ: configJSON.RabbitMQUrl,
    testDataDirectory: configJSON.TestData,
    priority: configJSON.Priority,
    redis: configJSON.RedisUrl,
    dataDisplayLimit: configJSON.DataDisplayLimit
}

if (options.verbose) {
    // winston.transports.Console.level = 'debug';
    (winston as any).level = 'debug';
} else {
    (winston as any).level = 'warn';
}