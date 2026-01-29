import { z } from "zod";
import { BaseTool } from "./BaseTool.js";
import { GitHubService } from "../../services/GitHubService.js";
import { createChildLogger } from "../../services/logger.js";
import type { ToolResult } from "../../types/index.js";

const logger = createChildLogger("RetryWorkflowTool");

const paramsSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  runId: z.number().describe("Workflow run ID to retry"),
  failedOnly: z.boolean().default(true).describe("Only retry failed jobs (default: true)"),
});

type Params = z.infer<typeof paramsSchema>;

interface Result {
  message: string;
  runId: number;
  retriedAt: string;
}

export class RetryWorkflowTool extends BaseTool<Params, Result> {
  readonly name = "retry_workflow";
  readonly description = `Retry a failed GitHub Actions workflow run. By default, only retries failed jobs. 
Set failedOnly to false to retry the entire workflow.
Use this when you've determined a workflow failure is transient or a known issue has been resolved.`;
  readonly parameters = paramsSchema;

  async execute(params: Params): Promise<ToolResult<Result>> {
    const { owner, repo, runId, failedOnly } = params;
    const github = GitHubService.getInstance();

    try {
      // Check current attempt count
      const attempts = await github.getWorkflowRunAttempts(owner, repo, runId);
      
      if (attempts >= 3) {
        return {
          success: false,
          error: `Workflow has already been retried ${attempts} times. Consider investigating further before retrying.`,
        };
      }

      if (failedOnly) {
        await github.rerunFailedJobs(owner, repo, runId);
      } else {
        await github.rerunWorkflow(owner, repo, runId);
      }

      const message = failedOnly
        ? `Successfully triggered re-run of failed jobs for workflow run ${runId}`
        : `Successfully triggered full re-run of workflow run ${runId}`;

      logger.info({ owner, repo, runId, failedOnly }, message);

      return {
        success: true,
        data: {
          message,
          runId,
          retriedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ owner, repo, runId, error: errorMessage }, "Failed to retry workflow");
      
      return {
        success: false,
        error: `Failed to retry workflow: ${errorMessage}`,
      };
    }
  }
}
