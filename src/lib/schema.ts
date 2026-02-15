import { z } from "zod";

export const PhaseStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "skipped",
]);

export type PhaseStatus = z.infer<typeof PhaseStatus>;

export const SessionStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

export type SessionStatus = z.infer<typeof SessionStatus>;

export const DownstreamContext = z.object({
  key_interfaces_introduced: z.array(z.string()),
  patterns_established: z.array(z.string()),
  integration_points: z.array(z.string()),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type DownstreamContext = z.infer<typeof DownstreamContext>;

export const SessionError = z.object({
  agent: z.string(),
  timestamp: z.string(),
  type: z.enum([
    "validation",
    "timeout",
    "file_conflict",
    "runtime",
    "dependency",
  ]),
  message: z.string(),
  resolution: z.string(),
  resolved: z.boolean(),
});

export type SessionError = z.infer<typeof SessionError>;

export const TokenUsageByAgent = z.record(
  z.string(),
  z.object({
    input: z.number(),
    output: z.number(),
    cached: z.number(),
  }),
);

export const TokenUsage = z.object({
  total_input: z.number(),
  total_output: z.number(),
  total_cached: z.number(),
  by_agent: TokenUsageByAgent,
});

export type TokenUsage = z.infer<typeof TokenUsage>;

export const Phase = z.object({
  id: z.number(),
  name: z.string(),
  status: PhaseStatus,
  agents: z.array(z.string()),
  parallel: z.boolean(),
  started: z.string().nullable(),
  completed: z.string().nullable(),
  blocked_by: z.array(z.number()),
  files_created: z.array(z.string()),
  files_modified: z.array(z.string()),
  files_deleted: z.array(z.string()),
  downstream_context: DownstreamContext,
  errors: z.array(SessionError),
  retry_count: z.number(),
});

export type Phase = z.infer<typeof Phase>;

export const SessionState = z.object({
  session_id: z.string(),
  created: z.string(),
  updated: z.string(),
  status: SessionStatus,
  design_document: z.string(),
  implementation_plan: z.string(),
  current_phase: z.number(),
  execution_mode: z.enum(["parallel", "sequential"]).nullable(),
  total_phases: z.number(),
  token_usage: TokenUsage,
  phases: z.array(Phase),
});

export type SessionState = z.infer<typeof SessionState>;

export const SessionReadInput = z.object({
  section: z
    .enum(["metadata", "phases", "errors", "files", "full"])
    .optional()
    .default("full"),
});

export const SessionWriteInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    task: z.string(),
    execution_mode: z.enum(["parallel", "sequential"]).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_phase"),
    phase_id: z.number(),
    phase_status: PhaseStatus,
  }),
  z.object({
    action: z.literal("add_error"),
    error: z.object({
      phase: z.string(),
      agent: z.string(),
      type: SessionError.shape.type,
      message: z.string(),
      retry_count: z.number(),
    }),
  }),
  z.object({
    action: z.literal("add_files"),
    phase_id: z.number(),
    files: z.object({
      created: z.array(z.string()).optional().default([]),
      modified: z.array(z.string()).optional().default([]),
      deleted: z.array(z.string()).optional().default([]),
    }),
  }),
  z.object({
    action: z.literal("complete"),
    summary: z.string().optional(),
  }),
]);

export type SessionWriteInput = z.infer<typeof SessionWriteInput>;

export const ProgressStatus = z.enum([
  "dispatched",
  "running",
  "completed",
  "failed",
  "retrying",
]);

export const ProgressInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    phase_id: z.string(),
    agent: z.string().optional(),
    status: ProgressStatus,
    message: z.string().optional(),
  }),
  z.object({ action: z.literal("report") }),
  z.object({ action: z.literal("summary") }),
]);

export type ProgressInput = z.infer<typeof ProgressInput>;

export const ProgressEntry = z.object({
  timestamp: z.string(),
  phase_id: z.string(),
  agent: z.string().optional(),
  status: ProgressStatus,
  message: z.string().optional(),
});

export type ProgressEntry = z.infer<typeof ProgressEntry>;

export const ValidatePlanInput = z.object({
  plan_path: z.string(),
});

export const PlanPhase = z.object({
  id: z.number().or(z.string()),
  title: z.string().optional(),
  name: z.string().optional(),
  agent: z.string().or(z.array(z.string())).optional(),
  agents: z.string().or(z.array(z.string())).optional(),
  description: z.string().optional(),
  blocked_by: z.array(z.number().or(z.string())).optional().default([]),
  files_created: z.array(z.string()).optional().default([]),
  files_modified: z.array(z.string()).optional().default([]),
  validation_criteria: z.string().optional(),
  validation: z.string().optional(),
  parallel: z.boolean().optional(),
});

export type PlanPhase = z.infer<typeof PlanPhase>;

export const PlanFrontmatter = z.object({
  title: z.string(),
  design_ref: z.string().optional(),
  created: z.string().optional(),
  status: z.string().optional(),
  total_phases: z.number().optional(),
  estimated_files: z.number().optional(),
  phases: z.array(PlanPhase).optional(),
});

export const DispatchStatusInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list_batches") }),
  z.object({
    action: z.literal("batch_status"),
    batch_id: z.string(),
  }),
  z.object({
    action: z.literal("agent_result"),
    batch_id: z.string(),
    agent: z.string(),
  }),
]);

export type DispatchStatusInput = z.infer<typeof DispatchStatusInput>;

export const ContextChainInput = z.object({
  phase_id: z.string(),
  plan_path: z.string(),
});

export const BatchSummary = z.object({
  batch_status: z.string(),
  total_agents: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  wall_time_seconds: z.number(),
  agents: z.array(
    z.object({
      name: z.string(),
      exit_code: z.number(),
      status: z.string(),
    }),
  ),
});

export type BatchSummary = z.infer<typeof BatchSummary>;
