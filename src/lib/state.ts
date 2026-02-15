import { readFile, writeFile, rename, readdir, appendFile as fsAppendFile, access, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { SessionState } from "./schema.js";
import { createLogger } from "./logger.js";

const logger = createLogger("state");

interface ParsedFrontmatter<T> {
  frontmatter: T;
  body: string;
}

export function parseFrontmatter<T>(content: string): ParsedFrontmatter<T> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("No YAML frontmatter found (expected --- delimiters)");
  }
  const [, yamlContent, body] = match;
  const frontmatter = parseYaml(yamlContent!) as T;
  return { frontmatter, body: body ?? "" };
}

export function serializeFrontmatter<T>(
  frontmatter: T,
  body: string,
): string {
  const yamlStr = stringifyYaml(frontmatter, { lineWidth: 0 });
  return `---\n${yamlStr}---\n${body}`;
}

export function resolveStateDir(): string {
  return process.env["MAESTRO_STATE_DIR"] ?? ".gemini";
}

export function resolveStatePath(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

interface SessionStateWithBody {
  state: SessionState;
  body: string;
}

export async function readSessionStateRaw(): Promise<SessionStateWithBody | null> {
  const stateDir = resolveStateDir();
  const sessionPath = resolveStatePath(
    join(stateDir, "state", "active-session.md"),
  );

  if (!(await fileExists(sessionPath))) {
    return null;
  }

  const content = await readFile(sessionPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter<unknown>(content);
  const result = SessionState.safeParse(frontmatter);

  if (!result.success) {
    logger.error("Session state parse failed", {
      path: sessionPath,
      errors: result.error.issues,
    });
    return null;
  }

  return { state: result.data, body };
}

export async function readSessionState(): Promise<SessionState | null> {
  const raw = await readSessionStateRaw();
  return raw?.state ?? null;
}

export async function writeSessionState(
  state: SessionState,
  body: string,
): Promise<void> {
  const stateDir = resolveStateDir();
  const sessionPath = resolveStatePath(
    join(stateDir, "state", "active-session.md"),
  );

  const parentDir = dirname(sessionPath);
  await mkdir(parentDir, { recursive: true });

  const content = serializeFrontmatter(state, body);

  const tempFile = join(parentDir, `.write-state-${Date.now()}`);
  await writeFile(tempFile, content, "utf-8");
  await rename(tempFile, sessionPath);
}

export async function readFileContent(absolutePath: string): Promise<string> {
  return readFile(absolutePath, "utf-8");
}

export async function appendToFile(
  absolutePath: string,
  content: string,
): Promise<void> {
  const parentDir = dirname(absolutePath);
  await mkdir(parentDir, { recursive: true });
  await fsAppendFile(absolutePath, content, "utf-8");
}

export async function listDirectories(dirPath: string): Promise<string[]> {
  if (!(await fileExists(dirPath))) {
    return [];
  }
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}
