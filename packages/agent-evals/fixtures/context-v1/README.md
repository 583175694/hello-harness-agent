# Context Eval Fixtures V1

这些材料只用于 `context-core-v1` 离线评测。API 仅在 `NODE_ENV=test` 且显式设置
`EVAL_FIXTURE_ROOT` 时加载 `manifest.json`；未命中的 Query 或 URL 不会回退真实网络。

Fixture 目录中的全部普通文件都会参与稳定 SHA-256；该目录 Hash 会写入每次 Experiment Manifest。
