# 本地 OpenSandbox + Docker

Harness **C3-A** 本地调试：在本机用 Docker 作为 runtime，运行 OpenSandbox Server；Harness API 通过 `127.0.0.1:28473` 创建 Sandbox 并执行 `execute_command`。

权威进度与验收记录见 [`docs/33-c3-agent-sandbox-cloud-execution.md`](../../docs/33-c3-agent-sandbox-cloud-execution.md) §1.4–1.5。

## 前置

- **Docker Desktop**（或 Docker Engine）已启动。
- **`uv` / `uvx`** 可用（安装 `opensandbox-server@0.2.3`）。
- 建议预拉镜像（与 `sandbox.toml` 一致）：
  - `python:3.12-slim`（Harness `SANDBOX_IMAGE` digest 见下文）
  - `opensandbox/execd:v1.0.22`
  - `opensandbox/egress:v1.1.7`

## 启动 OpenSandbox Server

在仓库根目录：

```bash
./dev/opensandbox-local/start.sh
```

或：

```bash
cd dev/opensandbox-local
uvx opensandbox-server@0.2.3 --config sandbox.toml
```

- 监听：`http://127.0.0.1:28473`
- 配置：`sandbox.toml`（端口、`api_key`、Docker/execd/egress、SQLite 库 `./opensandbox.db`）
- 健康检查：`curl http://127.0.0.1:28473/health`

Server 需单独占一个终端；停止时在该终端 Ctrl+C。

## Harness 配置（仓库根 `.env`）

```env
SANDBOX_ENABLED=true
SANDBOX_DOMAIN=127.0.0.1:28473
SANDBOX_API_KEY=<与 sandbox.toml [server].api_key 相同>
SANDBOX_IMAGE=python:3.12-slim@sha256:2f17fc044b579bab302c2e8054d3a686e2cb9a83de48e70534b94cd8ebbe06a9
```

修改后**重启** `pnpm dev`。未配齐时 `execute_command` 不会出现在模型工具列表中。

## 自动化验收

```bash
pnpm --filter @harness/api test:sandbox-live
node apps/api/c3a-sandbox-live.mjs
pnpm exec dotenv -e ../../.env -- node apps/api/scripts/sandbox-live-timeout.mjs
```

## UI 冒烟（需审批）

在对话中让模型调用 `execute_command`，例如：

- `echo sandbox-ok`
- `exit 42`（验证 Tool 成功且 exitCode=42）
- 同 Run 内写文件再 `cat`（验证工作区保留）
- 上传文件 + `inputFiles` Stage + `output` Collect（须在同一消息带附件并约束必须用 Stage）

## 腾讯云（可选，非本机必需）

| 场景 | `SANDBOX_DOMAIN` |
| --- | --- |
| 本机（默认） | `127.0.0.1:28473` |
| Harness 与 OpenSandbox 同 VPC | `10.1.24.2:28473` |
| 公网（安全组放行，HTTP + Key 风险） | `175.178.23.83:28473` |

Harness 与 Server 不在同一台机器时不要填 `127.0.0.1`。
