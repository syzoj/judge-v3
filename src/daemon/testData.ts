import yaml = require('js-yaml');
import fse = require('fs-extra');
import pathLib = require('path');
import { Language, languages, getLanguage } from '../languages';
import { compareStringByNumber, tryReadFile, filterPath } from '../utils';
import { SubtaskScoringType, SubtaskJudge, TestcaseJudge, Executable, TestData } from './interfaces';
import { FileContent } from '../interfaces';
import { globalConfig as Cfg } from './config';

export interface UserSubtask {
    score: number;
    type: string;
    cases: (string | number)[];
}

export interface UserConfigFile {
    subtasks: UserSubtask[];
    inputFile: string;
    fullScore?: number;
    outputFile?: string;
    userOutput?: string;
    specialJudge?: { language: string, fileName: string };
    interactor?: { language: string, fileName: string };
    extraSourceFiles?: { language: string, files: { name: string, dest: string }[] }[];
}

function filterHyphen(input: string): string {
    if (input == null || input === '-')
        return null;
    else
        return input;
}

function parseScoringType(typeString: string): SubtaskScoringType {
    if (typeString === 'sum')
        return SubtaskScoringType.Summation;
    else if (typeString === 'mul')
        return SubtaskScoringType.Multiple;
    else if (typeString === 'min')
        return SubtaskScoringType.Minimum;
    throw new Error("Subtask type must be one of the following: sum, mul, min");
}

async function parseExecutable(src: any, dataPath: string): Promise<Executable> {
    return { sourceCode: await fse.readFile(pathLib.join(dataPath, filterPath(src.fileName)), 'utf8'), language: getLanguage(src.language) };
}

async function parseYamlContent(obj: UserConfigFile, dataName: string): Promise<TestData> {
    const dataPath = pathLib.join(Cfg.testDataDirectory, dataName);
    let extraFiles: { [language: string]: FileContent[] } = {};
    if (obj.extraSourceFiles) {
        for (let l of obj.extraSourceFiles) {
            extraFiles[l.language] = [];
            for (let f of l.files) {
                extraFiles[l.language].push({
                    name: filterPath(f.dest),
                    content: await fse.readFile(pathLib.join(dataPath, filterPath(f.name)), 'utf8')
                })
            }
        }
    }
    return {
        subtasks: obj.subtasks.map(s => ({
            score: s.score,
            type: parseScoringType(s.type),
            cases: s.cases.map(c => ({
                input: obj.inputFile ? filterPath(obj.inputFile.replace('#', c.toString())) : null,
                output: obj.outputFile ? filterPath(obj.outputFile.replace('#', c.toString())) : null,
                userOutputFile: obj.userOutput ? filterPath(obj.userOutput.replace('#', c.toString())) : null,
                name: c.toString()
            }))
        })),
        spj: obj.specialJudge && await parseExecutable(obj.specialJudge, dataPath),
        extraSourceFiles: extraFiles,
        interactor: obj.interactor && await parseExecutable(obj.interactor, dataPath),
        name: dataName,
    }
}

export async function readRulesFile(dataName: string): Promise<TestData> {
    const dataPath = pathLib.join(Cfg.testDataDirectory, dataName);
    let fileContent = await tryReadFile(pathLib.join(dataPath, 'data.yml'));
    if (fileContent != null) {
        return parseYamlContent(yaml.safeLoad(fileContent) as UserConfigFile, dataName);
    } else { // No data.yml
        let spj: Executable = null;
        for (const lang of languages) {
            const spjName = pathLib.join(dataPath, "spj_" + lang.name + "." + lang.fileExtension);
            if (await fse.exists(spjName)) {
                spj = { sourceCode: await fse.readFile(spjName, 'utf8'), language: lang };
                break;
            }
        }
        let cases: { input: string, output: string, name: string }[] = [];
        let dirContent: string[];
        try {
            dirContent = await fse.readdir(dataPath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                return null;
            }
            throw err;
        }
        for (let fileName of await fse.readdir(dataPath)) {
            let outputFileName = null;

            const fileNameRegex = /^(.*)\.in$/;
            const matchResult = fileNameRegex.exec(fileName);
            if (matchResult != null) {
                const filePrefix = matchResult[1];
                if ((await fse.stat(pathLib.join(dataPath, fileName))).isFile()) {
                    const outputPathPrefix = pathLib.join(dataPath, filePrefix);
                    if (await fse.exists(outputPathPrefix + '.out')) {
                        outputFileName = filePrefix + '.out';
                    } else if (await fse.exists(outputPathPrefix + '.ans')) {
                        outputFileName = filePrefix + '.ans';
                    }
                }
                // Found output file
                if (outputFileName != null) {
                    cases.push({
                        input: filePrefix + '.in',
                        output: outputFileName,
                        name: filePrefix
                    });
                }
            }
        }

        cases.sort((a, b) => compareStringByNumber(a.name, b.name));

        return !cases.length ? null : {
            subtasks: [{
                score: 100,
                type: SubtaskScoringType.Summation,
                cases: cases
            }],
            spj: spj,
            name: dataName,
            extraSourceFiles: {}
        };
    }
}
