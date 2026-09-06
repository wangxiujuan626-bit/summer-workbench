import { NextRequest, NextResponse } from "next/server";
import { assets, database, getOrCreateDevice, readWorkspace, withDeviceCookie, workspacePayload } from "../_lib/workspace";

export const dynamic = "force-dynamic";

function encodeBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function GET(request: NextRequest) {
  const device = await getOrCreateDevice(request);
  const row = await readWorkspace(device.workspaceId);
  if (!row) return NextResponse.redirect(new URL("/avatar.png", request.url));
  if (row.avatar_data) {
    const headers = new Headers({
      "content-type": row.avatar_type || "image/webp",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    });
    return withDeviceCookie(new NextResponse(decodeBase64(row.avatar_data), { headers }), device);
  }
  if (row.avatar_key) {
    try {
      const object = await assets().get(row.avatar_key);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("cache-control", "private, max-age=300");
        return withDeviceCookie(new NextResponse(object.body, { headers }), device);
      }
    } catch (error) {
      console.error("Unable to read legacy avatar", error);
    }
  }
  return NextResponse.redirect(new URL("/avatar.png", request.url));
}

export async function POST(request: NextRequest) {
  try {
    const device = await getOrCreateDevice(request);
    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择头像图片" }, { status: 400 });
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return NextResponse.json({ error: "请使用 JPG、PNG 或 WebP 图片" }, { status: 400 });
    }
    if (file.size > 800_000) return NextResponse.json({ error: "头像处理后仍然过大，请换一张图片" }, { status: 400 });

    const current = await readWorkspace(device.workspaceId);
    if (!current) return NextResponse.json({ error: "工作台不存在" }, { status: 404 });
    const bytes = await file.arrayBuffer();
    const avatarData = encodeBase64(bytes);
    const now = Date.now();
    await database().prepare("UPDATE workspaces SET avatar_data = ?, avatar_type = ?, avatar_key = NULL, revision = revision + 1, updated_at = ? WHERE id = ?")
      .bind(avatarData, file.type, now, device.workspaceId).run();
    if (current.avatar_key) {
      try {
        await assets().delete(current.avatar_key);
      } catch (error) {
        console.error("Unable to remove the previous avatar", error);
      }
    }
    const updated = await readWorkspace(device.workspaceId);
    return withDeviceCookie(NextResponse.json(updated ? workspacePayload(updated) : null), device);
  } catch (error) {
    console.error("Avatar upload failed", error);
    return NextResponse.json({ error: "头像上传失败，请稍后再试" }, { status: 500 });
  }
}
