import { z } from "zod";
import { BaseTool } from "./BaseTool.js";
import { GitHubService } from "../../services/GitHubService.js";
import { createChildLogger } from "../../services/logger.js";
import type { ToolResult } from "../../types/index.js";

const logger = createChildLogger("CreateIssueTool");

const paramsSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  title: z.string().describe("Issue title"),
  body: z.string().describe("Issue body in markdown format"),
  labels: z.array(z.string()).default([]).describe("Labels to apply to the issue"),
  assignees: z.array(z.string()).default([]).describe("GitHub usernames to assign"),
  relatedRunId: z.number().optional().describe("Related workflow run ID for linking"),
});

type Params = z.infer<typeof paramsSchema>;

interface Result {
  issueNumber: number;
  issueUrl: string;
  message: string;
}

export class CreateIssueTool extends BaseTool<Params, Result> {
  readonly name = "create_issue";
  readonly description = `Create a GitHub issue to track a workflow problem or required action.
Use this when:
- A workflow failure requires human intervention
- There's a recurring issue that needs investigation
- You want to document a pattern of failures
Include relevant context like workflow run links, error messages, and your analysis.`;
  readonly parameters = paramsSchema;

  async execute(params: Params): Promise<ToolResult<Result>> {
    const { owner, repo, title, body, labels, assignees, relatedRunId } = params;
    const github = GitHubService.getInstance();

    try {
      // Check for duplicate issues
      const searchQuery = `"${title.slice(0, 50)}" in:title`;
      const existingIssues = await github.searchIssues(owner, repo, searchQuery);
      
      const openDuplicates = existingIssues.filter(i => i.state === "open");
      if (openDuplicates.length > 0) {
        // Add comment to existing issue instead
        const existingIssue = openDuplicates[0];
        const comment = `## New occurrence detected\n\n${body}`;
        await github.addIssueComment(owner, repo, existingIssue.number, comment);
        
        return {
          success: true,
          data: {
            issueNumber: existingIssue.number,
            issueUrl: `https://github.com/${owner}/${repo}/issues/${existingIssue.number}`,
            message: `Added comment to existing issue #${existingIssue.number} instead of creating duplicate`,
          },
        };
      }

      // Build issue body with metadata
      let fullBody = body;
      
      if (relatedRunId) {
        fullBody += `\n\n---\n**Related Workflow Run:** https://github.com/${owner}/${repo}/actions/runs/${relatedRunId}`;
      }
      
      fullBody += `\n\n---\n_This issue was automatically created by the SRE Agent_`;

      const issueNumber = await github.createIssue(
        owner,
        repo,
        title,
        fullBody,
        labels,
        assignees
      );

      const issueUrl = `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
      logger.info({ owner, repo, issueNumber, title }, "Issue created");

      return {
        success: true,
        data: {
          issueNumber,
          issueUrl,
          message: `Created issue #${issueNumber}: ${title}`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ owner, repo, title, error: errorMessage }, "Failed to create issue");
      
      return {
        success: false,
        error: `Failed to create issue: ${errorMessage}`,
      };
    }
  }
}
