// ==============================================================================
// src/worker/pipeline-worker.ts — High-Performance Worker Entry Point & Façade
// ==============================================================================

import { PipelineTaskPayload, CadWorkerTaskPayload } from '../types/worker.js';
import { processPipelineTask, ProgressCallback } from './pipeline-executor.js';
import { runCadMcpTask } from './mcp-task-runner.js';

export { processPipelineTask, type ProgressCallback } from './pipeline-executor.js';
export { runCadMcpTask, type CadWorkerTaskPayload, type CadTaskType } from './mcp-task-runner.js';

/**
 * Piscina worker thread entry point.
 * Multiplexes between full 7-stage conversion pipeline tasks and granular MCP CAD tools.
 */
export default async function workerEntry(
  payload: PipelineTaskPayload | CadWorkerTaskPayload
): Promise<any> {
  if ('taskType' in payload && payload.taskType) {
    return runCadMcpTask(payload as CadWorkerTaskPayload);
  }
  return processPipelineTask(payload as PipelineTaskPayload);
}
