import * as commandLineArgs from 'command-line-args';
import * as fs from 'fs';
import * as winston from 'winston';

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
}

const optionDefinitions = [
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'instance-config', alias: 'i', type: String },
    { name: 'shared-config', alias: 's', type: String }
];

const options = commandLineArgs(optionDefinitions);

console.log(options);

function readJSON(path: string): any {
    console.log("Path: " + path);
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const instanceConfig = readJSON(options["instance-config"]);
const sharedConfig = readJSON(options["shared-config"]);


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
    sandbox: {
        chroot: sharedConfig.SandboxRoot,
        mountProc: true,
        redirectBeforeChroot: false,
        user: sharedConfig.SandboxUser,
        cgroup: instanceConfig.SandboxCgroup,
        environments: sharedConfig.SandboxEnvironments
    },
}

if (options.verbose) {
    (winston as any).level = 'debug';
} else {
    (winston as any).level = 'warn';
}