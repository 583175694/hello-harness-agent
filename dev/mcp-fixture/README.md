# MCP HTTP fixture (C4-A)

Minimal Streamable HTTP MCP server exposing tool `ping`.

```bash
cd dev/mcp-fixture
pnpm install
pnpm start
```

In Workbench **设置 → MCP**，添加：

- `serverName`: `demo`
- `URL`: `http://127.0.0.1:8765/mcp`

模型可见工具名：`mcp__demo__ping`。
