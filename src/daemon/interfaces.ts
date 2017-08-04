import { Language } from '../languages';
import { FileContent, TaskStatus, TaskResult } from '../interfaces';

export enum ProblemType {
    Standard = 1,
    AnswerSubmission = 2,
    Interaction = 3
}

export interface JudgeTask {
    taskId: number;
    testData: string;
    type: ProblemType;
    priority: number;
    param: StandardJudgeParameter | AnswerSubmissionJudgeParameter | InteractionJudgeParameter;
}

export interface StandardJudgeParameter {
    language: string;
    code: string;
    timeLimit: number;
    memoryLimit: number;
    fileIOInput?: string;  // Null indicates stdio.
    fileIOOutput?: string;
}

export interface AnswerSubmissionJudgeParameter {
    answerFile: Buffer;
}

export interface InteractionJudgeParameter {
    timeLimit: number;
    memoryLimit: number;
    language: string;
    code: string;
}

export enum SubtaskScoringType {
    Summation,
    Minimum,
    Multiple
}

export interface TestCaseJudge {
    input?: string;
    output?: string;
    userOutputFile?: string;
    name: string;
}

export interface SubtaskJudge {
    type: SubtaskScoringType;
    score: number;
    cases: TestCaseJudge[];
}

export interface Executable {
    language: Language;
    sourceCode: string;
}

export interface TestData {
    name: string;
    subtasks: SubtaskJudge[];
    spj?: Executable;
    interactor?: Executable;
    extraSourceFiles: { [language: string]: FileContent[] };
}


export function mergeStatus(ps: TaskStatus[]): TaskStatus {
    if (ps.every(c => c === TaskStatus.Waiting)) {
        return TaskStatus.Waiting;
    } else if (ps.some(c => c === TaskStatus.Running)) {
        return TaskStatus.Running;
    } else if (ps.some(c => c === TaskStatus.Failed)) {
        return TaskStatus.Failed;
    } else {
        return TaskStatus.Done;
    }
}