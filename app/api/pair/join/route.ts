import { NextRequest, NextResponse } from "next/server";
import { database, getOrCreateDevice, hash, readWorkspace, withDeviceCookie, workspacePayload } from "../../_lib/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const device = await getOrCreateDevice(request);
  const db = database();
  const now = Date.now();
  const deviceRow = await db.prepare("SELECT pair_attempts, pair_window_started_at FROM devices WHERE id = ?")
    .bind(device.id).first<{ pair_attempts: number; pair_window_started_at: number }>();
  const withinWindow = Boolean(deviceRow && now - deviceRow.pair_window_started_at < 10 * 60 * 1000);
  const attempts = withinWindow && deviceRow ? deviceRow.pair_attempts : 0;
  if (attempts >= 8) return withDeviceCookie(NextResponse.json({ error: "尝试次数过多，请10分钟后再试" }, { status: 429 }), device);
  await db.prepare("UPDATE devices SET pair_attempts = ?, pair_window_started_at = ? WHERE id = ?")
    .bind(attempts + 1, withinWindow && deviceRow ? deviceRow.pair_window_started_at : now, device.id).run();

  const body = (await request.json()) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : "";
  if (code.length !== 6) return withDeviceCookie(NextResponse.json({ error: "请输入6位同步码" }, { status: 400 }), device);
  const pair = await db.prepare("SELECT id, workspace_id, expires_at, used_at FROM pair_codes WHERE code_hash = ? LIMIT 1")
    .bind(await hash(code)).first<{ id: string; workspace_id: string; expires_at: number; used_at: number | null }>();
  if (!pair || pair.used_at || pair.expires_at < now) return withDeviceCookie(NextResponse.json({ error: "同步码无效或已过期" }, { status: 400 }), device);
  if (pair.workspace_id === device.workspaceId) return withDeviceCookie(NextResponse.json({ error: "这台设备已经连接好了" }, { status: 400 }), device);

  await db.batch([
    db.prepare("UPDATE devices SET workspace_id = ?, pair_attempts = 0, pair_window_started_at = 0 WHERE id = ?").bind(pair.workspace_id, device.id),
    db.prepare("UPDATE pair_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, pair.id),
  ]);
  const row = await readWorkspace(pair.workspace_id);
  return withDeviceCookie(NextResponse.json({ workspace: row ? workspacePayload(row) : null }), device);
}
