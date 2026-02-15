import {
  SessionReadInput,
  SessionWriteInput,
  SessionState,
  Phase,
} from "../lib/schema.js";
import {
  readSessionState,
  writeSessionState,
} from "../lib/state.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("session");

export async function sessionRead(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = SessionReadInput.parse(rawInput);
  const state = await readSessionState();

  if (!state) {
    return { exists: false };
  }

  switch (input.section) {
    case "metadata":
      return {
        exists: true,
        session: {
          session_id: state.session_id,
          created: state.created,
          updated: state.updated,
          status: state.status,
          current_phase: state.current_phase,
          total_phases: state.total_phases,
          execution_mode: state.execution_mode,
          design_document: state.design_document,
          implementation_plan: state.implementation_plan,
        },
      };
    case "phases":
      return {
        exists: true,
        phases: state.phases.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          agents: p.agents,
          parallel: p.parallel,
          started: p.started,
          completed: p.completed,
          blocked_by: p.blocked_by,
          retry_count: p.retry_count,
        })),
      };
    case "errors":
      return {
        exists: true,
        errors: state.phases.flatMap((p) =>
          p.errors.map((e) => ({ ...e, phase_id: p.id, phase_name: p.name })),
        ),
      };
    case "files":
      return {
        exists: true,
        files: {
          created: state.phases.flatMap((p) => p.files_created),
          modified: state.phases.flatMap((p) => p.files_modified),
          deleted: state.phases.flatMap((p) => p.files_deleted),
        },
      };
    case "full":
    default:
      return { exists: true, session: state };
  }
}

function createEmptyPhase(id: number, name: string): Phase {
  return {
    id,
    name,
    status: "pending",
    agents: [],
    parallel: false,
    started: null,
    completed: null,
    blocked_by: [],
    files_created: [],
    files_modified: [],
    files_deleted: [],
    downstream_context: {
      key_interfaces_introduced: [],
      patterns_established: [],
      integration_points: [],
      assumptions: [],
      warnings: [],
    },
    errors: [],
    retry_count: 0,
  };
}

export async function sessionWrite(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = SessionWriteInput.parse(rawInput);
  const now = new Date().toISOString();

  switch (input.action) {
    case "create": {
      const slug = input.task
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);
      const dateStr = now.slice(0, 10);
      const sessionId = `${dateStr}-${slug}`;

      const state: SessionState = {
        session_id: sessionId,
        created: now,
        updated: now,
        status: "in_progress",
        design_document: "",
        implementation_plan: "",
        current_phase: 1,
        execution_mode: input.execution_mode ?? null,
        total_phases: 0,
        token_usage: {
          total_input: 0,
          total_output: 0,
          total_cached: 0,
          by_agent: {},
        },
        phases: [createEmptyPhase(1, "initial")],
      };

      const body = `# ${input.task} Orchestration Log\n`;
      await writeSessionState(state, body);
      logger.info("Session created", { sessionId });
      return { success: true, session_id: sessionId, state };
    }

    case "update_phase": {
      const state = await readSessionState();
      if (!state) {
        return { success: false, error: "No active session found" };
      }

      const phase = state.phases.find((p) => p.id === input.phase_id);
      if (!phase) {
        return {
          success: false,
          error: `Phase ${input.phase_id} not found`,
        };
      }

      phase.status = input.phase_status;
      if (input.phase_status === "in_progress" && !phase.started) {
        phase.started = now;
      }
      if (
        input.phase_status === "completed" ||
        input.phase_status === "failed"
      ) {
        phase.completed = now;
      }
      state.updated = now;
      state.current_phase = input.phase_id;

      const body = `# Orchestration Log\n`;
      await writeSessionState(state, body);
      logger.info("Phase updated", {
        phase_id: input.phase_id,
        status: input.phase_status,
      });
      return { success: true, phase };
    }

    case "add_error": {
      const state = await readSessionState();
      if (!state) {
        return { success: false, error: "No active session found" };
      }

      const phaseId = Number(input.error.phase);
      const phase = state.phases.find((p) => p.id === phaseId);
      if (!phase) {
        return {
          success: false,
          error: `Phase ${input.error.phase} not found`,
        };
      }

      phase.errors.push({
        agent: input.error.agent,
        timestamp: now,
        type: input.error.type,
        message: input.error.message,
        resolution: "pending",
        resolved: false,
      });
      phase.retry_count = input.error.retry_count;
      state.updated = now;

      const body = `# Orchestration Log\n`;
      await writeSessionState(state, body);
      logger.info("Error recorded", { phase: input.error.phase });
      return { success: true };
    }

    case "add_files": {
      const state = await readSessionState();
      if (!state) {
        return { success: false, error: "No active session found" };
      }

      const phase = state.phases.find((p) => p.id === input.phase_id);
      if (!phase) {
        return {
          success: false,
          error: `Phase ${input.phase_id} not found`,
        };
      }

      phase.files_created.push(...input.files.created);
      phase.files_modified.push(...input.files.modified);
      phase.files_deleted.push(...input.files.deleted);
      state.updated = now;

      const body = `# Orchestration Log\n`;
      await writeSessionState(state, body);
      return { success: true };
    }

    case "complete": {
      const state = await readSessionState();
      if (!state) {
        return { success: false, error: "No active session found" };
      }

      state.status = "completed";
      state.updated = now;

      const body = `# Orchestration Log\n\n## Summary\n${input.summary ?? "Session completed."}\n`;
      await writeSessionState(state, body);
      logger.info("Session completed", {
        session_id: state.session_id,
      });
      return { success: true, session_id: state.session_id };
    }
  }
}

export const SESSION_READ_TOOL = {
  name: "maestro_session_read",
  description:
    "Read current Maestro orchestration session state. Returns structured JSON instead of raw YAML. Use 'section' to request only metadata, phases, errors, or files to save context tokens.",
  inputSchema: SessionReadInput,
  handler: sessionRead,
};

export const SESSION_WRITE_TOOL = {
  name: "maestro_session_write",
  description:
    "Update Maestro orchestration session state with schema validation and atomic writes. Actions: create (new session), update_phase (change phase status), add_error (record error), add_files (update file manifest), complete (finish session).",
  inputSchema: SessionWriteInput,
  handler: sessionWrite,
};
