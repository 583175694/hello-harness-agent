# 服务端部署与运维

完整说明见 [运维手册 OPERATIONS.md](./OPERATIONS.md)，包含启动、发布、备份、回滚、配置和故障排查。

入口：`http://175.178.23.83:4317/agent`。
服务器：`ubuntu@175.178.23.83`，项目目录：`/www/hello-harness-agent`。

```bash
ssh -p 22 ubuntu@175.178.23.83
sudo systemctl status hello-harness-agent opensandbox --no-pager
curl -fsS http://127.0.0.1:4317/readyz
sudo journalctl -u hello-harness-agent -n 100 --no-pager
```

发布前先阅读运维手册的备份和维护窗口流程，保留生产 `.env`、artifacts 与服务器沙箱配置。不要执行全局 Docker 清理或修改其他项目。
