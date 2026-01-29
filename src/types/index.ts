import { z } from "zod";

// ============================================================================
// Webhook Event Types
// ============================================================================

export const workflowRunConclusionSchema = z.enum([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "stale",
  "neutral",
  "startup_failure",
]);

export type WorkflowRunConclusion = z.infer<typeof workflowRunConclusionSchema>;

export const workflowRunEventSchema = z.object({
  action: z.enum(["completed", "requested", "in_progress", "queued", "pending", "waiting"]),
  workflow_run: z.object({
    id: z.number(),
    name: z.string().nullable(),
    head_branch: z.string().nullable(),
    head_sha: z.string(),
    run_number: z.number(),
    run_attempt: z.number(),
    status: z.string().nullable(),
    conclusion: workflowRunConclusionSchema.nullable(),
    workflow_id: z.number(),
    html_url: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    actor: z.object({
      login: z.string(),
      avatar_url: z.string(),
    }).nullable(),
    triggering_actor: z.object({
      login: z.string(),
    }).nullable(),
    repository: z.object({
      id: z.number(),
      name: z.string(),
      full_name: z.string(),
      owner: z.object({
        login: z.string(),
      }),
    }),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  sender: z.object({
    login: z.string(),
  }),
});

export type WorkflowRunEvent = z.infer<typeof workflowRunEventSchema>;

// ============================================================================
// Repository Configuration Types
// ============================================================================

export const repoConfigSchema = z.object({
  version: z.number().default(1),
  enabled: z.boolean().default(true),
  
  instructions: z.string().optional(),
  
  actions: z.object({
    retry: z.object({
      enabled: z.boolean().default(true),
      maxAttempts: z.number().min(1).max(10).default(3),
    }).default({ enabled: true, maxAttempts: 3 }),
    
    createIssue: z.object({
      enabled: z.boolean().default(true),
      labels: z.array(z.string()).default(["sre-agent", "automated"]),
      assignees: z.array(z.string()).default([]),
    }).default({ enabled: true, labels: ["sre-agent", "automated"], assignees: [] }),
  }).default({ 
    retry: { enabled: true, maxAttempts: 3 }, 
    createIssue: { enabled: true, labels: ["sre-agent", "automated"], assignees: [] } 
  }),
  
  workflows: z.array(z.string()).default([]),
  
  ignore: z.object({
    conclusions: z.array(workflowRunConclusionSchema).default([]),
    branches: z.array(z.string()).default([]),
  }).default({ conclusions: [], branches: [] }),
});

export type RepoConfig = z.infer<typeof repoConfigSchema>;

// ============================================================================
// SRE Notes Types
// ============================================================================

export interface SRENote {
  id: string;
  repoFullName: string;
  workflowId?: number;
  runId?: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  content: string;
  tags: string[];
  resolved: boolean;
}

export interface NoteQuery {
  repoFullName?: string;
  workflowId?: number;
  runId?: number;
  resolved?: boolean;
  tags?: string[];
  limit?: number;
}

// ============================================================================
// GitHub Status Types
// ============================================================================

export interface GitHubStatusComponent {
  id: string;
  name: string;
  status: "operational" | "degraded_performance" | "partial_outage" | "major_outage";
  description: string | null;
}

export interface GitHubStatusIncident {
  id: string;
  name: string;
  status: string;
  impact: string;
  created_at: string;
  updated_at: string;
  shortlink: string;
}

export interface GitHubStatus {
  status: {
    indicator: "none" | "minor" | "major" | "critical";
    description: string;
  };
  components: GitHubStatusComponent[];
  incidents: GitHubStatusIncident[];
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentContext {
  event: WorkflowRunEvent;
  repoConfig: RepoConfig;
  timestamp: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
