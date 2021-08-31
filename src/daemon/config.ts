import commandLineArgs = require('command-line-args');
import fs = require('fs');
import winston = require('winston');
import { configureWinston } from '../winston-common';
import { assign } from 'lodash';
import objectPath = require('object-path');

const daemonConfigExample = require("../../daemon-config-example.json");

export interface ConfigStructure {
    serverUrl: string;
    serverToken: string;
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
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const configJSON = assign({}, daemonConfigExample, readJSON(options["config"]));
export const globalConfig: ConfigStructure = {
    serverUrl: configJSON.ServerUrl,
    serverToken: configJSON.ServerToken,
    rabbitMQ: configJSON.RabbitMQUrl,
    testDataDirectory: configJSON.TestData,
    priority: configJSON.Priority,
    redis: configJSON.RedisUrl,
    dataDisplayLimit: configJSON.DataDisplayLimit,
    tempDirectory: configJSON.TempDirectory
}

const configEnvOverrideItems = {
    SYZOJ_JUDGE_WEB_URL: [String, "serverUrl"],
    SYZOJ_WEB_SECRET_JUDGE: [String, "serverToken"],
    SYZOJ_JUDGE_RABBITMQ_URI: [String, "rabbitMQ"],
    SYZOJ_JUDGE_TESTDATA_PATH: [String, "testDataDirectory"],
    SYZOJ_JUDGE_REDIS_URI: [String, "redis"]
};

for (const key in configEnvOverrideItems) {
    const [Type, configKey] = configEnvOverrideItems[key];
    if (key in process.env)
        objectPath.set(globalConfig, configKey, Type(process.env[key]));
}

configureWinston(options.verbose);
