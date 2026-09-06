import { NextRequest, NextResponse } from "next/server";
import { assets, database, getOrCreateDevice, readWorkspace, withDeviceCookie, workspacePayload } from "../_lib/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const device = await getOrCreateDevice(request);
  const current = await readWorkspace(device.workspaceId);
  const now = Date.now();
  await database().prepare("UPDATE workspaces SET display_name = '', avatar_key = NULL, avatar_data = NULL, avatar_type = NULL, state_json = '{}', revision = revision + 1, updated_at = ? WHERE id = ?")
    .bind(now, device.workspaceId).run();
  if (current?.avatar_key) {
    try {
      await assets().delete(current.avatar_key);
    } catch (error) {
      console.error("Unable to remove legacy avatar", error);
    }
  }
  const updated = await readWorkspace(device.workspaceId);
  return withDeviceCookie(NextResponse.json(updated ? workspacePayload(updated) : null), device);
}
