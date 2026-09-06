import { NextRequest, NextResponse } from "next/server";
import { cleanName, cleanState, database, getOrCreateDevice, readWorkspace, withDeviceCookie, workspacePayload } from "../_lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const device = await getOrCreateDevice(request);
  const row = await readWorkspace(device.workspaceId);
  if (!row) return NextResponse.json({ error: "工作台暂时不可用" }, { status: 404 });
  return withDeviceCookie(NextResponse.json(workspacePayload(row)), device);
}

export async function PUT(request: NextRequest) {
  const device = await getOrCreateDevice(request);
  const body = (await request.json()) as { displayName?: unknown; state?: unknown; revision?: unknown };
  const revision = Number.isInteger(body.revision) ? Number(body.revision) : 0;
  const result = await database().prepare(
    "UPDATE workspaces SET display_name = ?, state_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?"
  ).bind(cleanName(body.displayName), JSON.stringify(cleanState(body.state)), revision + 1, Date.now(), device.workspaceId, revision).run();

  if (!result.meta.changes) {
    const current = await readWorkspace(device.workspaceId);
    return withDeviceCookie(NextResponse.json({ error: "工作台已在另一台设备更新", workspace: current ? workspacePayload(current) : null }, { status: 409 }), device);
  }
  const updated = await readWorkspace(device.workspaceId);
  return withDeviceCookie(NextResponse.json(updated ? workspacePayload(updated) : null), device);
}
