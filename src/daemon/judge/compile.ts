import { Language } from '../../languages';
import * as redis from '../redis';
import * as rmq from '../rmq';
import { codeFingerprint } from '../../utils';
import { CompileResult, TaskResult, RPCTaskType, RPCRequest, CompileTask, FileContent } from '../../interfaces';

export async function compile(
    code: string, language: Language, extraFiles: FileContent[] = [], priority: number
): Promise<[string, CompileResult]> {
    const fingerprint = codeFingerprint(code, language.name);
    let result: CompileResult;
    const unlock = await redis.getCompileLock(fingerprint);
    try {
        if (await redis.checkBinaryExistance(fingerprint)) {
            result = { status: 0 };
        } else {
            const task: CompileTask = {
                code: code,
                language: language.name,
                extraFiles: extraFiles,
                binaryName: fingerprint
            };
            result = await rmq.runTask({ type: RPCTaskType.Compile, task: task }, priority);
        }
        return [fingerprint, result];
    } finally {
        unlock();
    }
}