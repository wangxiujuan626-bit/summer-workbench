# Summer 工作台通用连接器

这是工作台的通用 AI 连接器，不绑定某一个 AI 平台。

它使用 MCP（Model Context Protocol，模型上下文协议）提供标准工具。支持 MCP 的 AI 客户端可以读取工作台上下文，也可以把收件内容、待确认任务和 AI 结果写回工作台。

## 能做什么

- `get_workbench_context`：读取今天或最近 7 天的工作记录
- `get_handoff_card`：生成可复制给任意 AI 的交接卡
- `search_workbench`：搜索工作台历史记录
- `add_to_workbench_inbox`：把灵感放回收件箱
- `create_task_draft`：创建待确认任务草稿
- `save_ai_result`：把 AI 结果保存到工作台的“已保存资料”

## 安装

先在工作台里启动“AI 连接器”，按提示复制标准配置。然后在支持 MCP 的 AI 工具中新增一个本地 MCP 服务：

```text
命令：node
参数：/你的完整路径/Summer工作台-Lite/workbench-connector/src/mcp-server.mjs
工作目录：/你的完整路径/Summer工作台-Lite/workbench-connector
```

如果 AI 工具要求先安装依赖，再在本目录执行：

```bash
pnpm install
```

不同 AI 的设置入口名称可能不同，但都只需要配置一次。连接器使用标准 MCP 协议，不绑定某一个 AI 平台。

连接器使用标准输入输出和 AI 客户端通信，日志只写到标准错误，不会污染协议数据。

## 本地桥接

工作台本地版会把脱敏后的记录同步到 `data/state.json`，并从 `data/actions.json` 读取 AI 请求。桥接服务只监听 `127.0.0.1:43128`，不会把数据暴露到公网。

```bash
node src/bridge.mjs
```

在线版不会连接这个本地桥接服务。Cola 仍然使用现有的 `cola-plugin`，两者互不覆盖。
