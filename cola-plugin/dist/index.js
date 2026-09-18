// src/index.ts
import { createServer } from "node:http";

// node_modules/.pnpm/@marswave+cola-plugin-sdk@0.0.5/node_modules/@marswave/cola-plugin-sdk/distribution/source/index.js
function defineChannel(def) {
  const { id, commands, ...channel } = def;
  return {
    id,
    meta: { label: channel.meta.label, description: channel.meta.description },
    channel,
    commands
  };
}

// src/index.ts
var PORT = 43127;
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set(["http://127.0.0.1:8765", "http://localhost:8765"]);
var SENDER_ID = "summer-workbench-local";
var MAX_BODY_SIZE = 12e4;
function writeJson(response, status, body, origin = "") {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "null";
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("\u7ECF\u5386\u5361\u592A\u5927\u4E86\uFF0C\u8BF7\u5220\u51CF\u540E\u518D\u53D1\u9001"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
function cardMessage(card) {
  return [
    "\u3010Summer \u5DE5\u4F5C\u53F0\uFF5C\u4ECA\u65E5\u7ECF\u5386\u5361\u3011",
    `\u65E5\u671F\uFF1A${card.date}`,
    "",
    "\u8BF7\u628A\u8FD9\u5F20\u7ECF\u5386\u5361\u4F5C\u4E3A\u4E00\u6761\u65B0\u7684\u771F\u5B9E\u7ECF\u5386\uFF1A\u5148\u66F4\u65B0\u4F60\u7684\u89C9\u77E5\uFF0C\u518D\u7ED9\u6211 3 \u4E2A\u4E0D\u91CD\u590D\u7684\u5185\u5BB9\u9009\u9898\u3002\u4E0D\u8981\u76F4\u63A5\u5199\u5168\u6587\uFF0C\u9664\u975E\u6211\u7EE7\u7EED\u786E\u8BA4\u3002",
    "",
    "\u4ECA\u65E5\u4E8B\u5B9E\uFF1A",
    ...card.facts.map((item) => `- ${item}`),
    "",
    `\u6709\u611F\u89C9\u7684\u4E00\u523B\uFF1A${card.feeling || "\uFF08\u4ECA\u5929\u8DF3\u8FC7\uFF09"}`,
    `\u4E3A\u4EC0\u4E48\u5728\u610F\uFF1A${card.why || "\uFF08\u4ECA\u5929\u8DF3\u8FC7\uFF09"}`,
    `\u660E\u5929\u7B2C\u4E00\u6B65\uFF1A${card.tomorrow || "\uFF08\u672A\u586B\u5199\uFF09"}`,
    `\u5185\u5BB9\u4FE1\u53F7\uFF1A${card.signals.length ? card.signals.join("\u3001") : "\u6682\u672A\u8BC6\u522B"}`,
    "",
    "\u8FD9\u662F\u7528\u6237\u786E\u8BA4\u540E\u53D1\u9001\u7684\u5185\u5BB9\uFF0C\u53EA\u628A\u5B83\u5F53\u4F5C\u771F\u5B9E\u7ECF\u5386\u4F7F\u7528\uFF0C\u4E0D\u8981\u8865\u5199\u4E0D\u5B58\u5728\u7684\u7EC6\u8282\u3002"
  ].join("\n");
}
var index_default = defineChannel({
  id: "summer-workbench",
  meta: {
    label: "Summer \u5DE5\u4F5C\u53F0",
    description: "\u628A\u786E\u8BA4\u540E\u7684\u4ECA\u65E5\u7ECF\u5386\u5361\u9001\u8FDB Cola \u4E3B\u5BF9\u8BDD",
    markdownCapable: true
  },
  capabilities: {
    receive: { text: true },
    send: { text: true, markdown: true }
  },
  sessionBinding: "shared-primary",
  gateway: {
    async start(ctx) {
      await ctx.runtime.identity.bind(SENDER_ID);
      ctx.state.server = createServer(async (request, response) => {
        const origin = String(request.headers.origin || "");
        if (request.method === "OPTIONS") {
          writeJson(response, 204, {}, origin);
          return;
        }
        if (origin && !ALLOWED_ORIGINS.has(origin)) {
          writeJson(response, 403, { error: "\u53EA\u5141\u8BB8\u672C\u673A Summer \u5DE5\u4F5C\u53F0\u8FDE\u63A5" }, origin);
          return;
        }
        if (request.method === "GET" && request.url === "/health") {
          writeJson(response, 200, { ok: true, plugin: "summer-workbench", port: PORT }, origin);
          return;
        }
        if (request.method !== "POST" || request.url !== "/deliver") {
          writeJson(response, 404, { error: "Not found" }, origin);
          return;
        }
        try {
          const payload = JSON.parse(await readBody(request));
          if (payload.type !== "daily-experience" || !payload.card?.id) {
            writeJson(response, 400, { error: "\u65E0\u6548\u7684\u4ECA\u65E5\u7ECF\u5386\u5361" }, origin);
            return;
          }
          await ctx.deliver({
            sessionId: ["dm", SENDER_ID],
            sender: { id: SENDER_ID, name: "Summer \u5DE5\u4F5C\u53F0" },
            deliveryContext: { to: SENDER_ID, messageId: payload.card.id },
            message: cardMessage(payload.card)
          });
          writeJson(response, 202, { ok: true, delivered: true, id: payload.card.id }, origin);
        } catch (error) {
          ctx.logger.error(`Unable to deliver workbench card: ${String(error)}`);
          writeJson(response, 400, { error: error instanceof Error ? error.message : "\u7ECF\u5386\u5361\u53D1\u9001\u5931\u8D25" }, origin);
        }
      });
      await new Promise((resolve, reject) => {
        ctx.state.server?.once("error", reject);
        ctx.state.server?.listen(PORT, "127.0.0.1", () => resolve());
      });
      ctx.logger.info(`Summer Workbench bridge listening on 127.0.0.1:${PORT}`);
    },
    async stop(ctx) {
      await new Promise((resolve) => {
        if (!ctx.state.server) return resolve();
        ctx.state.server.close(() => resolve());
      });
      ctx.state.server = void 0;
    },
    getStatus() {
      return { connected: true, configured: true };
    }
  },
  outbound: {
    async sendText(ctx) {
      ctx.logger.info(`Cola replied in the shared Summer Workbench session: ${ctx.text.slice(0, 120)}`);
    }
  }
});
export {
  index_default as default
};
