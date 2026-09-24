# Mobile 开发 Git Worktree

与主目录 `hello-harness-agent`（例如 `feature/mcp`）并行，Mobile 在独立 worktree 中开发，避免切换分支污染未提交改动。

## 路径与分支

| 项 | 值 |
| --- | --- |
| Worktree | `../hello-harness-agent-mobile` |
| 分支 | `feature/mobile-agent`（跟踪 `origin/main`） |
| 方案文档 | [docs/36-mobile-agent-frontend.md](../docs/36-mobile-agent-frontend.md) |

## 初始化

```bash
cd /path/to/hello-harness-agent
git fetch origin
git worktree add ../hello-harness-agent-mobile -b feature/mobile-agent origin/main
cd ../hello-harness-agent-mobile
pnpm install
```

`.env` 可从主目录复制；勿覆盖主目录正在编辑的文件。Mobile 线 **不改 Prisma schema**，共用本机 PostgreSQL。

## 联调 API

- 在主目录启动 API：`pnpm dev` 或仅 API（端口 **4318**）。
- Mobile worktree **只跑 Expo**：`pnpm dev:mobile`。
- 模拟器/真机 Settings 填写 Mac **局域网 IP**，例如 `http://192.168.x.x:4318`（不要用 `127.0.0.1` 除非 iOS 模拟器且 API 在本机）。

## 双 Cursor 窗口

1. 主仓：MCP / API 等功能。
2. Worktree 目录：Mobile + 共享 packages 抽取。

## 合并与 rebase

- Mobile PR 目标：`main`，建议小步（P0 包 → 脚手架 → 功能）。
- `feature/mcp` 合并 `main` 后，主目录 `git pull`；Mobile 线 `git rebase origin/main`。
- 需要 MCP 未进 main 的 API 时：cherry-pick 已提交 commit，勿依赖主目录未提交 WIP。

## 移除 worktree（可选）

```bash
git worktree remove ../hello-harness-agent-mobile
git branch -d feature/mobile-agent  # 已合并后
```
