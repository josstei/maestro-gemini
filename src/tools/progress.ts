import { ProgressInput, ProgressEntry } from "../lib/schema.js";
import {
  resolveStateDir,
  resolveStatePath,
  appendToFile,
  readFileContent,
  fileExists,
} from "../lib/state.js";
import { createLogger } from "../lib/logger.js";
import { join } from "node:path";

const logger = createLogger("progress");

function getProgressPath(): string {
  const stateDir = resolveStateDir();
  return resolveStatePath(join(stateDir, "state", "progress.jsonl"));
}

async function readProgressEntries(): Promise<ProgressEntry[]> {
  const progressPath = getProgressPath();
  if (!(await fileExists(progressPath))) {
    return [];
  }

  const content = await readFileContent(progressPath);
  const lines = content.trim().split("\n").filter(Boolean);

  return lines.flatMap((line) => {
    const result = ProgressEntry.safeParse(JSON.parse(line));
    if (result.success) {
      return [result.data];
    }
    return [];
  });
}

export async function progress(
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = ProgressInput.parse(rawInput);

  switch (input.action) {
    case "update": {
      const entry: ProgressEntry = {
        timestamp: new Date().toISOString(),
        phase_id: input.phase_id,
        agent: input.agent,
        status: input.status,
        message: input.message,
      };

      const progressPath = getProgressPath();
      await appendToFile(progressPath, JSON.stringify(entry) + "\n");
      logger.info("Progress updated", {
        phase_id: input.phase_id,
        status: input.status,
      });
      return { success: true, entry };
    }

    case "report": {
      const entries = await readProgressEntries();

      const phaseMap = new Map<
        string,
        { latest_status: string; agent: string | undefined; entries: number; first: string; last: string }
      >();

      for (const entry of entries) {
        const existing = phaseMap.get(entry.phase_id);
        if (!existing) {
          phaseMap.set(entry.phase_id, {
            latest_status: entry.status,
            agent: entry.agent,
            entries: 1,
            first: entry.timestamp,
            last: entry.timestamp,
          });
        } else {
          existing.latest_status = entry.status;
          if (entry.agent) existing.agent = entry.agent;
          existing.entries += 1;
          existing.last = entry.timestamp;
        }
      }

      const phases = Array.from(phaseMap.entries()).map(([id, data]) => ({
        phase_id: id,
        ...data,
      }));

      return { phases, total_entries: entries.length };
    }

    case "summary": {
      const entries = await readProgressEntries();

      const phases = new Set(entries.map((e) => e.phase_id));
      const completed = entries.filter((e) => e.status === "completed");
      const failed = entries.filter((e) => e.status === "failed");
      const completedPhases = new Set(completed.map((e) => e.phase_id));

      let wallTime = 0;
      if (entries.length > 0) {
        const first = new Date(entries[0]!.timestamp).getTime();
        const last = new Date(entries[entries.length - 1]!.timestamp).getTime();
        wallTime = Math.round((last - first) / 1000);
      }

      return {
        total_phases: phases.size,
        completed_phases: completedPhases.size,
        failed_phases: failed.length,
        wall_time_seconds: wallTime,
        total_entries: entries.length,
      };
    }
  }
}

export const PROGRESS_TOOL = {
  name: "maestro_progress",
  description:
    "Track orchestration progress in real-time. Actions: update (log phase/agent status change), report (current status of all phases), summary (condensed overview with counts and timing).",
  inputSchema: ProgressInput,
  handler: progress,
};
