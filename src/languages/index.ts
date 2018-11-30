export interface ExecParam {
    executable: string;
    parameters: string[];
    time: number;
    memory: number;
    process: number;
    stdin?: string | number;
    stdout?: string | number;
    stderr?: string | number;
    messageFile?: string;
    workingDirectory: string;
}

export interface Language {
    name: string;
    fileExtension: string;

    sourceFileName: string;
    binarySizeLimit: number;
    compile: (sourcePath: string, outputDirectory: string) => ExecParam;
    run: (binaryDirectory: string,
        workingDirectory: string,
        time: number,
        memory: number,
        stdinFile?: string | number,
        stdoutFile?: string | number,
        stderrFile?: string | number
    ) => ExecParam;
}

export const languages: Language[] = [
    require('./c'),
    require('./cpp'),
    require('./cpp11'),
    require('./cpp17'),
    require('./csharp'),
    require('./haskell'),
    require('./java'),
    require('./lua'),
    require('./luajit'),
    require('./nodejs'),
    require('./ocaml'),
    require('./pascal'),
    require('./python2'),
    require('./python3'),
    require('./ruby'),
    require('./vala'),
    require('./vbnet')
].map(f => f.lang);

export function getLanguage(name: string): Language {
    return name == null ? null : languages.find(l => l.name === name);
}
