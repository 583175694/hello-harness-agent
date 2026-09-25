# Hello Harness Agent 运维手册

本文档面向 `hello-harness-agent` 的服务端日常启动、更新、检查和故障处理。

## 1. 当前部署信息

| 项目 | 配置 |
| --- | --- |
| 服务器 | `ubuntu@175.178.23.83` |
| 项目目录 | `/www/hello-harness-agent` |
| Web 入口 | `http://175.178.23.83:4317/agent` |
| Web/API 健康检查 | `http://175.178.23.83:4317/readyz` |
| API 内部地址 | `127.0.0.1:4318` |
| OpenSandbox | `127.0.0.1:28473` |
| 数据库 | PostgreSQL `hello_harness_agent` |
| API 服务 | `hello-harness-agent.service` |
| 沙箱服务 | `opensandbox.service` |
| Web 反向代理 | Nginx `/etc/nginx/conf.d/hello-harness-agent.conf` |

项目使用独立目录、独立 PostgreSQL 数据库和独立 systemd 服务。不要对服务器执行全局 Docker 清理、全局 PostgreSQL 重置或 Nginx 配置覆盖。

核对日期：2026-09-24。当前线上基于 main `b99273f`，并包含公网 HTTP UUID 兼容修复；后续发布必须保留该兼容逻辑，否则 HTTP 入口发送消息会失败。
运行时使用 `/home/ubuntu/.local/node-v22/bin/node`（22.22.2）、pnpm 10.11.0、OpenSandbox 0.2.3。服务器默认 Node 20 不用于本项目。

## 2. 登录与日常检查

```bash
ssh -p 22 ubuntu@175.178.23.83

sudo systemctl status hello-harness-agent opensandbox nginx --no-pager
curl -fsS http://127.0.0.1:4317/readyz
curl -fsS http://175.178.23.83:4317/readyz
ss -ltn | grep -E ':(4317|4318|28473)\b'
```

`readyz` 应返回 `status=ok`，并且 `database`、`artifactStore` 都为 `ok`。

### 2.1 鉴权与 Cookie

生产环境 `.env` 必须设置 `AUTH_MODE=required`，并配置 `WEB_ORIGIN` 与 Nginx 同源反代（当前 `4317` 反代 `/api` 到 `4318`），以便浏览器携带 `HttpOnly` Cookie（`AUTH_COOKIE_NAME`，默认 `harness_session`）。

| 变量 | 说明 |
| --- | --- |
| `AUTH_MODE` | `required`（生产）或 `local`（仅开发/单用户） |
| `AUTH_SESSION_TTL_DAYS` | 登录 Session 有效期，默认 30 天 |
| `WEB_ORIGIN` | 必须与前端页面 Origin 一致，且 API 启用 CORS `credentials` |
| SMTP / 腾讯云 SMS | 生产发码；未配置时非 production 会在 API 日志打印验证码 |

HTTPS 入口需保证 Cookie `Secure` 生效（Nginx 需转发 `X-Forwarded-Proto: https`）。用户封禁后现有 Session 会被撤销，需重新登录。

### 2.2 账号模型与测试习惯

- 一个 Harness 账号可同时绑定邮箱与手机号，两种方式登录**同一用户数据**（`users.email` / `users.phone` 全局唯一）。
- 若用户先用邮箱、再用手机各登录一次，会创建**两个账号**；在设置里绑定冲突时会返回 `IDENTITY_ALREADY_BOUND`，前端会引导用户改用已注册的方式登录并在原账号内绑定。**当前不提供账号合并**，勿在工单中承诺「后台帮合并」除非已排期开发。
- 内部验收与 dogfood：**不要**用同一邮箱/手机各登一次当 A/B 隔离测试号；应「账号 A 登录 → 设置绑定另一种方式」，或使用两个不同的邮箱/手机号。
- 管理员 bootstrap（`AUTH_BOOTSTRAP_ADMIN_EMAIL` / `AUTH_BOOTSTRAP_ADMIN_PHONE`）仅对**首次**以该标识登录创建的账号生效；请固定一种管理员登录方式，避免误用另一种标识注册成普通新用户。

公网访问还需要同时满足：

1. 腾讯云安全组入站允许来源 `0.0.0.0/0`、协议 `TCP`、端口 `4317`。
2. 服务器 UFW 允许 `4317/tcp`：

```bash
sudo ufw status
sudo ufw allow 4317/tcp comment 'Hello Harness Agent'
```

## 3. 启动、停止和重启

```bash
# 启动
sudo systemctl start opensandbox hello-harness-agent
sudo systemctl reload nginx

# 重启 API（代码或 .env 变更后）
sudo systemctl restart hello-harness-agent

# 重启 OpenSandbox（只在沙箱服务异常时）
sudo systemctl restart opensandbox
sudo systemctl start hello-harness-agent

# 停止项目 API
sudo systemctl stop hello-harness-agent
```

服务已经设置开机自启。确认：

API 的 systemd 单元依赖 OpenSandbox；停止或重启 OpenSandbox 可能连带停止 API，之后必须检查并启动 API。重启前确认没有重要的运行中任务；不保证任务跨进程重启后自动续跑。

```bash
sudo systemctl is-enabled hello-harness-agent opensandbox nginx
```

不要通过 `npm start`、`pnpm dev` 另起一份生产 API，否则会造成端口冲突或运行多个 Worker。

## 4. 查看日志

```bash
sudo journalctl -u hello-harness-agent -n 100 --no-pager
sudo journalctl -u hello-harness-agent -f

sudo journalctl -u opensandbox -n 100 --no-pager
sudo journalctl -u opensandbox -f

sudo tail -n 100 /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/access.log
```

API 日志中的 `API 服务已启动` 表示进程已监听；`readyz` 失败时先看数据库和 Artifact Store 检查结果，再看 API 日志中的具体错误。

## 5. 发布新版本

以下是有短暂停机的维护窗口发布流程。在上传覆盖代码之前先执行第 5.2 节的备份命令；确认无重要运行中的任务后停止 API，再上传、安装、迁移和构建。构建失败时保持维护状态并排查，不启动未验证的产物。涉及不兼容 schema 的迁移需单独评估回滚方式。

### 5.1 本地上传

在本地仓库根目录执行。`--exclude='/artifacts/'` 的斜杠很重要，避免误排除 `apps/api/src/artifacts` 源码目录。

```bash
rsync -az --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.env' \
  --exclude='/artifacts/' \
  --exclude='dist/' \
  --exclude='.DS_Store' \
  --exclude='/dev/opensandbox-local/' \
  -e 'ssh -p 22' \
  ./ ubuntu@175.178.23.83:/www/hello-harness-agent/
```

`--delete` 只允许用于确认过目标目录就是 `/www/hello-harness-agent` 的场景；不要把目标写成 `/www` 或服务器根目录。
这里保留服务器专用的 OpenSandbox Dockerfile（含镜像源适配）；需要更新沙箱时单独合并和发布。该命令上传当前工作区，上传前用 `git status` 和 `git log -1` 确认版本。

### 5.2 服务端构建和迁移

```bash
cd /www/hello-harness-agent
export PATH=/home/ubuntu/.local/node-v22/bin:$PATH

corepack pnpm install --frozen-lockfile
corepack pnpm --filter @harness/api db:generate
```

以下备份应在第 5.1 节上传之前执行。先停 API 保持数据库与本地文件快照一致；数据库、代码、配置和文件均需备份：

```bash
mkdir -p /www/hello-harness-agent-backups
chmod 700 /www/hello-harness-agent-backups
umask 077
sudo systemctl stop hello-harness-agent
backup_stamp=$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dump -Fc hello_harness_agent \
  > "/www/hello-harness-agent-backups/pre-$backup_stamp.dump"
tar --exclude=node_modules -czf "/www/hello-harness-agent-backups/pre-$backup_stamp.tar.gz" \
  -C /www/hello-harness-agent .
sudo -u postgres pg_restore --list < "/www/hello-harness-agent-backups/pre-$backup_stamp.dump" > /dev/null
```

然后执行：

```bash
corepack pnpm --filter @harness/api db:deploy
corepack pnpm build
sudo systemctl restart hello-harness-agent
curl -fsS http://127.0.0.1:4317/readyz
```

如果迁移失败，不要继续重启服务；保留终端错误和 API 日志，先确认失败的 migration 是否已部分执行。
备份压缩包包含密钥，须限制访问并定期复制到受控的异地存储。COS 对象和 OpenSandbox 工作区不在此压缩包内；重要 COS 对象应使用独立的版本保留/备份策略。长期业务数据应通过 Artifact/COS 保存，不能依赖临时沙箱。

### 5.3 Nginx 配置变更

```bash
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` 失败时不要 reload。当前站点配置文件是 `/etc/nginx/conf.d/hello-harness-agent.conf`。

## 6. 环境变量和密钥

生产配置文件：`/www/hello-harness-agent/.env`，权限必须为 `600`：

```bash
chmod 600 /www/hello-harness-agent/.env
```

`.env` 至少包含：

- `NODE_ENV=production`
- `API_HOST=127.0.0.1`、`API_PORT=4318`
- `WEB_ORIGIN=http://175.178.23.83:4317`
- `DATABASE_URL`
- 模型 API Key 和搜索服务配置
- COS 四项生产存储配置
- `SANDBOX_ENABLED=true`
- `SANDBOX_DOMAIN=127.0.0.1:28473`
- `SANDBOX_API_KEY`
- 带 digest 的 `SANDBOX_IMAGE`
- `HARNESS_SECRETS_MASTER_KEY`：MCP 凭据加密主密钥；必须保留并随数据库一起备份，不要随意重新生成，否则已有密文可能无法解密。

修改 `.env` 后必须重启 API：

```bash
sudo systemctl restart hello-harness-agent
curl -fsS http://127.0.0.1:4317/readyz
```

不要把 `.env`、数据库 dump、OpenSandbox API Key 或模型 API Key 提交到 Git，也不要在聊天、工单或日志中打印完整密钥。

## 7. OpenSandbox 维护

OpenSandbox 的 Python 环境位于 `/home/ubuntu/opensandbox/.venv`，配置位于 `/home/ubuntu/opensandbox/sandbox.toml`。

```bash
sudo systemctl status opensandbox --no-pager
sudo journalctl -u opensandbox -n 100 --no-pager
curl -i http://127.0.0.1:28473/
```

未带 API Key 时返回 `401` 属于正常鉴权行为。不要直接删除 OpenSandbox 数据目录；其中的 SQLite 文件记录沙箱状态。

浏览器沙箱镜像更新：

以下 `APT_MIRROR` 参数依赖服务器 Dockerfile 中的对应实现；不要用未包含该实现的本地文件直接覆盖。Docker Hub 拉取失败时优先使用已核验的镜像缓存/镜像源，不要修改全局 Docker 配置或重启其他项目。

```bash
cd /www/hello-harness-agent
sudo docker build --network=host \
  --build-arg APT_MIRROR=mirrors.cloud.tencent.com \
  -f dev/opensandbox-local/Dockerfile.harness-sandbox-browser \
  -t harness-sandbox-browser:local dev/opensandbox-local
sudo docker image inspect harness-sandbox-browser:local --format '{{json .RepoDigests}}'
```

把实际 digest 写入 `.env` 的 `SANDBOX_IMAGE` 后重启 API。不要执行 `docker system prune`，那会影响服务器其他项目。

## 8. 发布后冒烟验证

服务端项目自带两个脚本：

```bash
cd /www/hello-harness-agent

# 创建临时沙箱，执行 Python 和 agent-browser，然后清理沙箱
/home/ubuntu/.local/node-v22/bin/node --env-file=.env deploy/smoke-sandbox.cjs

# 创建会话，调用真实模型并等待 completed
/home/ubuntu/.local/node-v22/bin/node deploy/smoke-chat.cjs
```

浏览器端验证建议使用公网 URL：

1. 打开 `http://175.178.23.83:4317/agent`。
2. 新建会话，发送“请只回复 DEPLOY_BROWSER_OK”。
3. 确认收到完整回复，刷新页面后消息仍在。
4. 打开浏览器控制台，确认没有 `crypto.randomUUID`、SSE 或 5xx 错误。

## 9. 常见故障

### 页面打不开或连接超时

```bash
sudo systemctl is-active nginx hello-harness-agent
ss -ltn | grep ':4317'
sudo ufw status
curl -fsS http://127.0.0.1:4317/readyz
```

服务器本机正常、外部超时：检查腾讯云安全组是否已关联到 `175.178.23.83` 实例，来源是否为 `0.0.0.0/0`，以及是否存在更高优先级拒绝规则。

### 页面能开但发送时报错

```bash
sudo journalctl -u hello-harness-agent -n 150 --no-pager
curl -fsS http://127.0.0.1:4317/readyz
```

浏览器控制台和 Network 面板重点检查 `/api/agent/sessions`、`/api/agent/sessions/<id>/runs` 和 `/events`。公网 HTTP 环境下不要假设 `crypto.randomUUID()` 一定存在；前端应使用项目的 `createClientId()`。

### `readyz` 显示数据库失败

```bash
sudo systemctl status postgresql --no-pager
sudo -u postgres psql -d hello_harness_agent -c 'select 1;'
```

确认 `.env` 中 `DATABASE_URL` 与服务器实际数据库角色一致；不要修改其他项目的数据库。

### 沙箱工具失败

```bash
sudo systemctl status opensandbox docker --no-pager
sudo journalctl -u opensandbox -n 150 --no-pager
sudo docker images | grep -E 'harness-sandbox|opensandbox/(execd|egress)'
```

确认 `SANDBOX_DOMAIN`、`SANDBOX_API_KEY`、`SANDBOX_IMAGE` 一致，且镜像 tag/digest 在本机存在。

### API 反复重启

```bash
sudo systemctl status hello-harness-agent --no-pager -l
sudo journalctl -u hello-harness-agent -b --no-pager
```

常见原因是生产环境缺少 COS 配置、数据库连接失败、端口 4318 被占用或 `.env` 格式错误。

## 10. 回滚

先确定旧代码是否兼容当前数据库 schema。兼容时可进行代码回滚；不兼容时先制定数据恢复方案，不能只启动旧代码。

```bash
sudo systemctl stop hello-harness-agent
# 此时备份当前代码、数据库和 artifacts，保留故障现场。
# 按第 5 节上传已验证版本，保留当前 .env 和 /artifacts/。
# 安装该版本依赖、生成 Prisma Client、完成构建后再启动。
```

数据库回滚只能在明确知道 migration 影响、并确认备份文件正确时进行；优先恢复代码并向前修复 migration，不要未经确认直接 `drop database`。
恢复备份会丢失备份之后的新数据，必须明确恢复时间点和影响范围。建议先把 dump 恢复到独立测试数据库验证，不在共享 PostgreSQL 上执行全局恢复。

## 11. 资源与存储维护

```bash
df -h /
free -h
du -sh /www/hello-harness-agent/artifacts /www/hello-harness-agent-backups
sudo docker system df
sudo docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'
```

上述 Docker 命令只做检查。清理时先确认具体容器/镜像属于本项目且没有使用者；不要批量删除所有停止容器或悬空镜像。数据库中存在的附件不能直接从 artifacts/COS 删除。备份保留至少一个已验证恢复点，删除前确认异地副本可用。
PDF 渲染另依赖 ubuntu 用户目录下的 Playwright Chromium（`/home/ubuntu/.cache/ms-playwright`）及系统动态库；这与沙箱内的 Chromium 是两套独立环境。缺失时可在 API 目录执行 `corepack pnpm exec playwright install chromium`，并按实际缺失库补齐依赖。

当前入口是公网 HTTP，且应用使用本地用户模型；不要把该部署当作具备多用户身份隔离的生产系统。需要限制访问时，在本项目入口配置身份验证或收窄安全组来源；使用域名和 HTTPS 后同步调整 `WEB_ORIGIN`。

## 12. 相关文件

- systemd：`deploy/hello-harness-agent.service`、`deploy/opensandbox.service`
- Nginx：`deploy/hello-harness-agent.nginx.conf`
- 沙箱验证：`deploy/smoke-sandbox.cjs`
- 对话验证：`deploy/smoke-chat.cjs`
- 环境模板：`.env.example`
