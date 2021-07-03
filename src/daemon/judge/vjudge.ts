import { CompilationResult, OverallResult } from "../../interfaces";
import { JudgeTaskContent, ProblemType, TestData } from "../interfaces";
import axios from "axios";
import * as Socket from "socket.io-client";
import * as url from "url";
import FormData = require("form-data");
const jsondiffpatch = require("jsondiffpatch");

axios.interceptors.request.use(config => {
  if (config.data instanceof FormData) {
    Object.assign(config.headers, config.data.getHeaders());
  }
  return config;
});

async function internalDoVJudge(
  task: JudgeTaskContent,
  extraData: Buffer,
  testData: TestData,
  reportProgress: (p: OverallResult) => Promise<void>,
  reportCompileProgress: (p: CompilationResult) => Promise<void>,
): Promise<OverallResult> {
  const headers = { Login: testData.vjudgeInfo.login };

  const submitUrl = url.resolve(testData.vjudgeInfo.url, `problem/${testData.vjudgeInfo.id}/submit`) + '?json=1';
  const submitData = new FormData();
  if (task.type === ProblemType.AnswerSubmission)
    submitData.append('answer', extraData, 'answer.zip');
  else {
    submitData.append('answer', Buffer.from(task.param.code, "utf-8"), 'answer');
    submitData.append('language', task.param.language);;
  }
  const submitResponse = await axios.post(submitUrl, submitData, { headers });
  const submissionId = submitResponse.data.id;
  if (!submissionId) throw new Error(`Failed to get submission id: ${JSON.stringify(submitResponse.data)}`);

  async function getSubmission() {
    const getSubmissionUrl = url.resolve(testData.vjudgeInfo.url, `submission/${submissionId}`) + '?json=1';
    const getSubmissionResponse = await axios.get(getSubmissionUrl, { headers });
    return getSubmissionResponse.data;
  }

  let compile: CompilationResult = null;
  function update(result: OverallResult) {
    if (!compile && result.compile) {
      compile = result.compile;
      reportCompileProgress(compile);
    }
    if (result.judge)
      reportProgress(result);
  }

  while (1) {
    const submission = await getSubmission();

    if (!submission.socketToken) return submission.detailResult;

    const socket = Socket(url.resolve(testData.vjudgeInfo.url, "detail"));

    const result = await Promise.race([new Promise((resolve, reject) => {
      socket.on('error', e => {
        socket.close();
        reject();
      });

      let currentVersion = 0;
      let detailResult = {};

      socket.on('update', p => {
        if (p.from === currentVersion) {
          currentVersion = p.to;
          jsondiffpatch.patch(detailResult, p.delta);
          update(detailResult);
        } else { // ?
          console.log('??????');
          resolve(null);
          socket.close();
        }
      });

      socket.on('finish', p => {
        // console.log("Judge finished", p);
        resolve(p.result);
        socket.close();
      });

      socket.emit('join', submission.socketToken, data => {
        // console.log("join! ", data);
        if (data && data.ok) {
          if (data.finished) {
            // console.log("resolve in join", data);
            if (!data.result) resolve(null);
            else resolve(data.result);
            socket.close();
          } else {
            if (data.running) {
              detailResult = data.current.content || {};
              currentVersion = data.current.version;
              update(detailResult);
            }
          }
        } else {
          reject("ERROR: " + JSON.stringify(data));
          socket.close();
        }
      });
    }), new Promise((_, reject) => setTimeout(() => reject("VJudge polling result - timeout"), 60 * 10 * 1000))]);

    if (result) return result;
  }
}

export async function doVJudge(
  task: JudgeTaskContent,
  extraData: Buffer,
  testData: TestData,
  reportProgress: (p: OverallResult) => Promise<void>,
  reportCompileProgress: (p: CompilationResult) => Promise<void>,
): Promise<OverallResult> {
  let finished = false;
  try {
    return await internalDoVJudge(
      task,
      extraData,
      testData,
      (p: OverallResult) => finished ? null : reportProgress(p),
      (p: CompilationResult) => finished ? null : reportCompileProgress(p)
    );
  } catch (e) {
    if (e.isAxiosError) throw new Error(e.data.error ? e.data.error : e.message);
    throw e;
  } finally {
    finished = true;
  }
}
