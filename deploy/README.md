# 服务端部署

目标：`ubuntu@175.178.23.83`，目录 `/www/hello-harness-agent`。
本次部署使用任务开始时 `a89d654` 工作区快照（含当时 styles.css 修改），不是部署期间本地后来切换到的 C4-B 提交。
Web：`http://175.178.23.83:4317/agent`，Nginx 静态文件与 SSE 反代。
API：`127.0.0.1:4318`，OpenSandbox：`127.0.0.1:28473`。
公网访问需同时放行 UFW 和腾讯云安全组 TCP 4317。

项目使用独立 PostgreSQL 数据库和角色 `hello_harness_agent`，凭据保存在服务器项目 `.env`（0600）。
独立 Node 22.22.2 位于 `/home/ubuntu/.local/node-v22`，pnpm 固定 10.11.0。
OpenSandbox 0.2.3 安装于 `/home/ubuntu/opensandbox/.venv`，使用项目兼容版本。
不要覆盖其他项目目录，不要执行 Docker 全局清理或重启已有数据库。

## 运维

```sh
sudo systemctl restart hello-harness-agent
sudo journalctl -u hello-harness-agent -n 100 --no-pager
sudo systemctl status opensandbox hello-harness-agent
curl -fsS http://127.0.0.1:4317/readyz
```

## 更新代码

从本地仓库上传，排除项 `/artifacts/` 必须锚定根目录，否则会误排除 API 源码。

```sh
rsync -az --exclude='.git/' --exclude='node_modules/' --exclude='.env' \
  --exclude='/artifacts/' --exclude='dist/' --exclude='.DS_Store' \
  ./ ubuntu@175.178.23.83:/www/hello-harness-agent/
```

服务器执行（迁移前备份本项目数据库）：

```sh
cd /www/hello-harness-agent
export PATH=/home/ubuntu/.local/node-v22/bin:$PATH
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @harness/api db:generate
corepack pnpm --filter @harness/api db:deploy
corepack pnpm build
sudo systemctl restart hello-harness-agent
```

Nginx 配置：`/etc/nginx/conf.d/hello-harness-agent.conf`。
修改后先 `sudo nginx -t`，通过后 `sudo systemctl reload nginx`。

## 浏览器沙箱

服务器 Dockerfile 已增加可选 `APT_MIRROR` 参数与强制 IPv4 下载；当前本地 Dockerfile 如无该参数，需先保留/合并服务器对应配置。镜像构建使用服务器已有 Node 20 Bookworm 镜像缓存。

```sh
sudo docker build --network=host --build-arg APT_MIRROR=mirrors.cloud.tencent.com \
  -f dev/opensandbox-local/Dockerfile.harness-sandbox-browser \
  -t harness-sandbox-browser:local dev/opensandbox-local
sudo docker image inspect harness-sandbox-browser:local --format '{{json .RepoDigests}}'
```

将实际 RepoDigest 填入服务器 `.env` 的 `SANDBOX_IMAGE` 后重启 API。
`SANDBOX_DOMAIN=127.0.0.1:28473` 不带协议前缀；API Key 与 OpenSandbox 配置一致。

```sh
node --env-file=.env deploy/smoke-sandbox.cjs
node deploy/smoke-chat.cjs
```

沙箱测试会创建并清理测试容器；对话测试调用真实模型并保留一条测试会话。
2026-09-24 验证：23 项数据库迁移、生产构建、readiness、真实模型回复、沙箱 Python 和 Chromium 启停通过。
