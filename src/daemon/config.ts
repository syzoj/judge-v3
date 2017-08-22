import commandLineArgs = require('command-line-args');
import fs = require('fs');
import winston = require('winston');
import { configureWinston } from '../winston-common';

export interface ConfigStructure {
    rabbitMQ: string;
    testDataDirectory: string;
    priority: number;
    redis: string;
    dataDisplayLimit: number;
    tempDirectory: string;
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
    dataDisplayLimit: configJSON.DataDisplayLimit,
    tempDirectory: configJSON.TempDirectory
}

configureWinston(options.verbose);