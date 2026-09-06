// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  avatarKey: text("avatar_key"),
  avatarData: text("avatar_data"),
  avatarType: text("avatar_type"),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    pairAttempts: integer("pair_attempts").notNull().default(0),
    pairWindowStartedAt: integer("pair_window_started_at").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => [index("devices_workspace_idx").on(table.workspaceId)]
);

export const pairCodes = sqliteTable(
  "pair_codes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    createdByDeviceId: text("created_by_device_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("pair_codes_workspace_idx").on(table.workspaceId),
    index("pair_codes_expiry_idx").on(table.expiresAt),
  ]
);
