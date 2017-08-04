import * as commandLineArgs from 'command-line-args';
import * as fs from 'fs';
import * as winston from 'winston';

export interface ConfigStructure {
    rabbitMQ: string;
    listen: { host: string, port: number };
    remoteUrl: string;
    token: string;
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
    listen: configJSON.Listen,
    remoteUrl: configJSON.RemoteUrl,
    token: configJSON.Token
}

if (options.verbose) {
    winston.transports.Console.level = 'verbose';
} else {
    winston.transports.Console.level = 'warn';
}