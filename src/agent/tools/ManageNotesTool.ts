import { z } from "zod";
import { BaseTool } from "./BaseTool.js";
import { NoteStore } from "../../services/NoteStore.js";
import { createChildLogger } from "../../services/logger.js";
import type { ToolResult, SRENote } from "../../types/index.js";

const logger = createChildLogger("ManageNotesTool");

const paramsSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    repoFullName: z.string().describe("Full repository name (owner/repo)"),
    title: z.string().describe("Note title"),
    content: z.string().describe("Note content"),
    tags: z.array(z.string()).default([]).describe("Tags for categorization"),
    workflowId: z.number().optional().describe("Related workflow ID"),
    runId: z.number().optional().describe("Related run ID"),
  }),
  z.object({
    action: z.literal("update"),
    noteId: z.string().describe("ID of the note to update"),
    content: z.string().optional().describe("Updated content"),
    tags: z.array(z.string()).optional().describe("Updated tags"),
    resolved: z.boolean().optional().describe("Mark as resolved"),
  }),
  z.object({
    action: z.literal("query"),
    repoFullName: z.string().optional().describe("Filter by repository"),
    resolved: z.boolean().optional().describe("Filter by resolved status"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    limit: z.number().default(10).describe("Max notes to return"),
  }),
  z.object({
    action: z.literal("get_summary"),
    repoFullName: z.string().describe("Repository to get summary for"),
  }),
  z.object({
    action: z.literal("resolve"),
    noteId: z.string().describe("ID of the note to resolve"),
  }),
]);

type Params = z.infer<typeof paramsSchema>;

interface Result {
  message: string;
  notes?: SRENote[];
  note?: SRENote;
  summary?: string;
}

export class ManageNotesTool extends BaseTool<Params, Result> {
  readonly name = "manage_notes";
  readonly description = `Manage SRE notes for tracking debugging context and ongoing issues.
Actions:
- create: Create a new note for tracking an issue
- update: Update an existing note with new information
- query: Search for existing notes
- get_summary: Get a summary of notes for a repository
- resolve: Mark a note as resolved

Use notes to:
- Track patterns of failures
- Document debugging progress
- Remember context between workflow runs
- Record root causes and solutions`;
  readonly parameters = paramsSchema;

  async execute(params: Params): Promise<ToolResult<Result>> {
    const noteStore = NoteStore.getInstance();

    try {
      switch (params.action) {
        case "create": {
          const note = await noteStore.create({
            repoFullName: params.repoFullName,
            title: params.title,
            content: params.content,
            tags: params.tags,
            workflowId: params.workflowId,
            runId: params.runId,
            resolved: false,
          });
          
          logger.info({ noteId: note.id, title: note.title }, "Created SRE note");
          
          return {
            success: true,
            data: {
              message: `Created note: ${note.title}`,
              note,
            },
          };
        }

        case "update": {
          const note = await noteStore.update(params.noteId, {
            content: params.content,
            tags: params.tags,
            resolved: params.resolved,
          });
          
          if (!note) {
            return {
              success: false,
              error: `Note not found: ${params.noteId}`,
            };
          }
          
          return {
            success: true,
            data: {
              message: `Updated note: ${note.title}`,
              note,
            },
          };
        }

        case "query": {
          const notes = await noteStore.query({
            repoFullName: params.repoFullName,
            resolved: params.resolved,
            tags: params.tags,
            limit: params.limit,
          });
          
          return {
            success: true,
            data: {
              message: `Found ${notes.length} notes`,
              notes,
            },
          };
        }

        case "get_summary": {
          const summary = await noteStore.getRepoSummary(params.repoFullName);
          
          return {
            success: true,
            data: {
              message: "Retrieved summary",
              summary,
            },
          };
        }

        case "resolve": {
          const note = await noteStore.resolve(params.noteId);
          
          if (!note) {
            return {
              success: false,
              error: `Note not found: ${params.noteId}`,
            };
          }
          
          return {
            success: true,
            data: {
              message: `Resolved note: ${note.title}`,
              note,
            },
          };
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: errorMessage, action: params.action }, "Failed to manage notes");
      
      return {
        success: false,
        error: `Failed to manage notes: ${errorMessage}`,
      };
    }
  }
}
