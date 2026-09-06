import { NextRequest, NextResponse } from "next/server";
import { database, getOrCreateDevice, hash, withDeviceCookie } from "../../_lib/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const device = await getOrCreateDevice(request);
  const db = database();
  const now = Date.now();
  await db.prepare("DELETE FROM pair_codes WHERE expires_at < ? OR used_at IS NOT NULL").bind(now).run();
  let code = "";
  let codeHash = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    code = String(values[0] % 1_000_000).padStart(6, "0");
    codeHash = await hash(code);
    if (!(await db.prepare("SELECT 1 FROM pair_codes WHERE code_hash = ? LIMIT 1").bind(codeHash).first())) break;
  }
  const expiresAt = now + 5 * 60 * 1000;
  await db.prepare("INSERT INTO pair_codes (id, workspace_id, code_hash, created_by_device_id, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)")
    .bind(crypto.randomUUID(), device.workspaceId, codeHash, device.id, expiresAt, now).run();
  return withDeviceCookie(NextResponse.json({ code, expiresAt }), device);
}
