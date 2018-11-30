export const lang =  {
    name: "java",
    sourceFileName: "Main.java",
    fileExtension: "java",
    binarySizeLimit: 5000 * 1024,

    // Note that these two paths are in the sandboxed environment.
    compile: (sourcePath, outputDirectory) => ({
        // To customize the compilation process,
        // write a shell script or some other stuff, 
        // and put it to your sandbox.
        executable: "/usr/bin/compile-java",
        parameters: ["compile-java", sourcePath, outputDirectory],
        time: 5000,
        memory: 1024 * 1024 * 1024 * 2,
        process: 20,
        // This is just a redirection. You can simply ignore this
        // if you can specify custom location for message output
        // in the parameter of the compiler, or have redirected the compilation 
        // message to somewhere.
        // An example will be available soon.
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
        executable: `${binaryDirectory}/run`,
        parameters: ["run"],
        time: time,
        memory: memory,
        process: 25,
        stdin: stdinFile,
        stdout: stdoutFile,
        stderr: stderrFile,
        workingDirectory: workingDirectory
    })
};
