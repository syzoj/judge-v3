import commandLineArgs = require('command-line-args');
import fs = require('fs');
import winston = require('winston');
import { configureWinston } from '../winston-common';
import { assign } from 'lodash';
import objectPath = require('object-path');

const runnerInstanceConfigExample = require("../../runner-instance-config-example.json");
const runnerSharedConfigExample = require("../../runner-shared-config-example.json");

export interface SandboxConfigBase {
    chroot: string;
    mountProc: boolean;
    redirectBeforeChroot: boolean;
    user: string;
    cgroup: string;
    environments: string[];
}

export interface ConfigStructure {
    rabbitMQ: string;
    testDataDirectory: string;
    workingDirectory: string;
    priority: number;
    redis: string;
    stderrDisplayLimit: number;
    compilerMessageLimit: number;
    spjTimeLimit: number;
    spjMemoryLimit: number;
    sandbox: SandboxConfigBase;
    outputLimit: number;
    binaryDirectory: string;
    dataDisplayLimit: number;
    doNotUseX32Abi: boolean;
}

const optionDefinitions = [
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'instance-config', alias: 'i', type: String },
    { name: 'shared-config', alias: 's', type: String }
];

const options = commandLineArgs(optionDefinitions);

console.log(options);

function readJSON(path: string): any {
    if (!fs.existsSync(path)) return {};

    console.log("Path: " + path);
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const instanceConfig = assign({}, runnerInstanceConfigExample, readJSON(options["instance-config"]));
const sharedConfig = assign({}, runnerSharedConfigExample, readJSON(options["shared-config"]));

export const globalConfig: ConfigStructure = {
    rabbitMQ: sharedConfig.RabbitMQUrl,
    testDataDirectory: sharedConfig.TestData,
    priority: sharedConfig.Priority,
    redis: sharedConfig.RedisUrl,
    outputLimit: sharedConfig.OutputLimit,
    stderrDisplayLimit: sharedConfig.StderrDisplayLimit,
    compilerMessageLimit: sharedConfig.CompilerMessageLimit,
    spjTimeLimit: sharedConfig.SpjTimeLimit,
    spjMemoryLimit: sharedConfig.SpjMemoryLimit,
    workingDirectory: instanceConfig.WorkingDirectory,
    binaryDirectory: sharedConfig.BinaryDirectory,
    dataDisplayLimit: sharedConfig.DataDisplayLimit,
    doNotUseX32Abi: sharedConfig.DoNotUseX32ABI,
    sandbox: {
        chroot: sharedConfig.SandboxRoot,
        mountProc: true,
        redirectBeforeChroot: false,
        user: sharedConfig.SandboxUser,
        cgroup: instanceConfig.SandboxCgroup,
        environments: sharedConfig.SandboxEnvironments
    },
}

function parseBoolean(s: string) {
    if (s === 'true') return true;
    else if (s === 'false') return false;
    throw new Error(`Invalid boolean value: ${JSON.stringify(s)}`);
}
const configEnvOverrideItems = {
    SYZOJ_JUDGE_RABBITMQ_URI: [String, "rabbitMQ"],
    SYZOJ_JUDGE_TESTDATA_PATH: [String, "testDataDirectory"],
    SYZOJ_JUDGE_REDIS_URI: [String, "redis"],
    SYZOJ_JUDGE_SANDBOX_ROOTFS_PATH: [String, "sandbox.chroot"],
    SYZOJ_JUDGE_WORKING_DIRECTORY: [String, "workingDirectory"],
    SYZOJ_JUDGE_BINARY_DIRECTORY: [String, "binaryDirectory"],
    SYZOJ_JUDGE_DO_NOT_USE_X32_ABI: [parseBoolean, "doNotUseX32Abi"],
    SYZOJ_JUDGE_CGROUP: [String, "sandbox.cgroup"],
};

for (const key in configEnvOverrideItems) {
    const [Type, configKey] = configEnvOverrideItems[key];
    if (key in process.env)
        objectPath.set(globalConfig, configKey, Type(process.env[key]));
}

configureWinston(options.verbose);
