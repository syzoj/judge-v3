export const lang = {
    name: "cpp",
    sourceFileName: "a.cpp",
    fileExtension: "cpp",
    binarySizeLimit: 5000 * 1024,

    // Note that these two paths are in the sandboxed environment.
    compile: (sourcePath, outputDirectory) => ({
        // To customize the compilation process,
        // write a shell script or some other stuff, 
        // and put it to your sandbox.
        executable: "/usr/bin/g++",
        parameters: ["g++", sourcePath, "-o", `${outputDirectory}/a.out`, "-std=c++03", "-O2", "-fdiagnostics-color=always", "-DONLINE_JUDGE", "-mx32"],
        time: 5000,
        memory: 1024 * 1024 * 1024,
        process: 10,
        // This is just a redirection. You can simply ignore this
        // if you can specify custom location for message output
        // in the parameter of the compiler, or have redirected the compilation 
        // message to somewhere.
        // An example will be available soon.
        stdout: `${outputDirectory}/message.txt`,
        stderr: `${outputDirectory}/message.txt`,
        // We will read this file for message in the output directory.
        messageFile: 'message.txt',
        workingDirectory: outputDirectory
    }),

    run: (binaryDirectory: string,
        workingDirectory: string,
        time: number,
        memory: number,
        stdinFile = null,
        stdoutFile = null,
        stderrFile = null
    ) => ({
        executable: `${binaryDirectory}/a.out`,
        parameters: [],
        time: time,
        memory: memory,
        stackSize: memory,
        process: 1,
        stdin: stdinFile,
        stdout: stdoutFile,
        stderr: stderrFile,
        workingDirectory: workingDirectory
    })
};
