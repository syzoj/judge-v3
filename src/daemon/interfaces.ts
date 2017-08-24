import { Language } from '../languages';
import { FileContent, TaskStatus, TestcaseResult } from '../interfaces';

export enum ProblemType {
    Standard = 1,
    AnswerSubmission = 2,
    Interaction = 3
}

export interface JudgeTaskContent {
    taskId: string;
    testData: string;
    type: ProblemType;
    priority: number;
    param: StandardJudgeParameter | InteractionJudgeParameter;
}

export interface JudgeTask {
    content: JudgeTaskContent;
    extraData?: Buffer;
}

export interface StandardJudgeParameter {
    language: string;
    code: string;
    timeLimit: number;
    memoryLimit: number;
    fileIOInput?: string;  // Null indicates stdio.
    fileIOOutput?: string;
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

export interface TestcaseJudge {
    input?: string;
    output?: string;
    userOutputFile?: string;
    name: string;
}

export interface SubtaskJudge {
    type: SubtaskScoringType;
    score: number;
    cases: TestcaseJudge[];
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