import { z } from "zod";
import { BaseTool } from "./BaseTool.js";
import { GitHubService } from "../../services/GitHubService.js";
import { createChildLogger } from "../../services/logger.js";
import type { ToolResult } from "../../types/index.js";

const logger = createChildLogger("GetWorkflowLogsTool");

const paramsSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  runId: z.number().describe("Workflow run ID"),
});

type Params = z.infer<typeof paramsSchema>;

interface Result {
  logs: string;
  runId: number;
}

export class GetWorkflowLogsTool extends BaseTool<Params, Result> {
  readonly name = "get_workflow_logs";
  readonly description = `Fetch logs from failed jobs in a GitHub Actions workflow run.
Returns the last 200 lines of logs from up to 3 failed jobs.
Use this to understand why a workflow failed before deciding on next steps.`;
  readonly parameters = paramsSchema;

  async execute(params: Params): Promise<ToolResult<Result>> {
    const { owner, repo, runId } = params;
    const github = GitHubService.getInstance();

    try {
      const logs = await github.getFailedJobLogs(owner, repo, runId);
      
      logger.debug({ owner, repo, runId }, "Fetched workflow logs");

      return {
        success: true,
        data: {
          logs,
          runId,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ owner, repo, runId, error: errorMessage }, "Failed to get workflow logs");
      
      return {
        success: false,
        error: `Failed to get workflow logs: ${errorMessage}`,
      };
    }
  }
}
