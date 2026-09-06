import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

export const DEVICE_COOKIE = "summer_lite_device";

export type WorkspaceState = Record<string, unknown>;
export type WorkspaceRow = {
  id: string;
  display_name: string;
  avatar_key: string | null;
  avatar_data: string | null;
  avatar_type: string | null;
  state_json: string;
  revision: number;
  updated_at: number;
};
export type DeviceContext = { id: string; workspaceId: string; token: string; isNew: boolean };

const defaultState: WorkspaceState = {};

export function database(): D1Database {
  if (!env.DB) throw new Error("D1 database binding DB is unavailable");
  return env.DB;
}

export function assets(): R2Bucket {
  if (!env.ASSETS) throw new Error("R2 bucket binding ASSETS is unavailable");
  return env.ASSETS;
}

export async function ensureSchema() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL DEFAULT '', avatar_key TEXT,
      avatar_data TEXT, avatar_type TEXT, state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, pair_attempts INTEGER NOT NULL DEFAULT 0,
      pair_window_started_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS devices_workspace_idx ON devices(workspace_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS pair_codes (
      id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL UNIQUE, created_by_device_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
      used_at INTEGER, created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS pair_codes_workspace_idx ON pair_codes(workspace_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS pair_codes_expiry_idx ON pair_codes(expires_at)"),
  ]);
  let columns = await db.prepare("PRAGMA table_info(workspaces)").all<{ name: string }>();
  for (const [name, sql] of [
    ["avatar_key", "ALTER TABLE workspaces ADD COLUMN avatar_key TEXT"],
    ["avatar_data", "ALTER TABLE workspaces ADD COLUMN avatar_data TEXT"],
    ["avatar_type", "ALTER TABLE workspaces ADD COLUMN avatar_type TEXT"],
  ] as const) {
    if (columns.results.some((column) => column.name === name)) continue;
    try {
      await db.prepare(sql).run();
    } catch (error) {
      columns = await db.prepare("PRAGMA table_info(workspaces)").all<{ name: string }>();
      if (!columns.results.some((column) => column.name === name)) throw error;
    }
  }
}

function randomToken(bytes = 32) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getOrCreateDevice(request: NextRequest): Promise<DeviceContext> {
  await ensureSchema();
  const db = database();
  const token = request.cookies.get(DEVICE_COOKIE)?.value;
  if (token) {
    const existing = await db.prepare("SELECT id, workspace_id FROM devices WHERE token_hash = ? LIMIT 1")
      .bind(await hash(token)).first<{ id: string; workspace_id: string }>();
    if (existing) {
      await db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").bind(Date.now(), existing.id).run();
      return { id: existing.id, workspaceId: existing.workspace_id, token, isNew: false };
    }
  }

  const now = Date.now();
  const nextToken = randomToken();
  const workspaceId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO workspaces (id, display_name, state_json, revision, created_at, updated_at) VALUES (?, '', ?, 1, ?, ?)")
      .bind(workspaceId, JSON.stringify(defaultState), now, now),
    db.prepare("INSERT INTO devices (id, workspace_id, token_hash, pair_attempts, pair_window_started_at, created_at, last_seen_at) VALUES (?, ?, ?, 0, 0, ?, ?)")
      .bind(deviceId, workspaceId, await hash(nextToken), now, now),
  ]);
  return { id: deviceId, workspaceId, token: nextToken, isNew: true };
}

export async function readWorkspace(workspaceId: string) {
  return database().prepare("SELECT id, display_name, avatar_key, avatar_data, avatar_type, state_json, revision, updated_at FROM workspaces WHERE id = ? LIMIT 1")
    .bind(workspaceId).first<WorkspaceRow>();
}

export function parseState(value: string): WorkspaceState {
  try {
    const parsed = JSON.parse(value) as Partial<WorkspaceState>;
    return cleanState(parsed);
  } catch {
    return defaultState;
  }
}

export function workspacePayload(row: WorkspaceRow) {
  return {
    displayName: row.display_name,
    avatarUrl: row.avatar_data || row.avatar_key ? `/api/avatar?v=${row.updated_at}` : "/avatar.png",
    state: parseState(row.state_json),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export function withDeviceCookie(response: NextResponse, device: DeviceContext) {
  if (device.isNew) {
    response.cookies.set(DEVICE_COOKIE, device.token, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, 16) : "";
}

export function cleanState(value: unknown): WorkspaceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > 250_000) throw new Error("Workspace state is too large");
  return JSON.parse(json) as WorkspaceState;
}
