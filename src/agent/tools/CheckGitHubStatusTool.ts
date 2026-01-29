import { z } from "zod";
import { BaseTool } from "./BaseTool.js";
import { StatusService } from "../../services/StatusService.js";
import type { ToolResult } from "../../types/index.js";

const paramsSchema = z.object({
  checkActionsOnly: z.boolean().default(false).describe("Only check GitHub Actions status"),
});

type Params = z.infer<typeof paramsSchema>;

interface Result {
  summary: string;
  actionsHealthy: boolean;
  hasIncidents: boolean;
}

export class CheckGitHubStatusTool extends BaseTool<Params, Result> {
  readonly name = "check_github_status";
  readonly description = `Check the current GitHub system status for outages or incidents.
Use this before retrying workflows or when failures seem infrastructure-related.
Helps determine if a failure is due to GitHub issues vs actual code problems.`;
  readonly parameters = paramsSchema;

  async execute(params: Params): Promise<ToolResult<Result>> {
    const { checkActionsOnly } = params;
    const statusService = StatusService.getInstance();

    try {
      const actionsHealth = await statusService.isActionsHealthy();
      
      if (checkActionsOnly) {
        return {
          success: true,
          data: {
            summary: actionsHealth.details,
            actionsHealthy: actionsHealth.healthy,
            hasIncidents: false,
          },
        };
      }

      const summary = await statusService.getStatusSummary();
      const status = await statusService.getStatus();

      return {
        success: true,
        data: {
          summary,
          actionsHealthy: actionsHealth.healthy,
          hasIncidents: status.incidents.length > 0,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      return {
        success: false,
        error: `Failed to check GitHub status: ${errorMessage}`,
      };
    }
  }
}
