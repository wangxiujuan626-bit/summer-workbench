import workbench from "./workbench.html?raw";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(workbench, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}
