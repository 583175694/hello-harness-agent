# `@harness/deepseek-tokenizer`

DeepSeek V3/V4 本地 Token 计数边界。包内资源来自用户从 DeepSeek 官方获取的
`deepseek_v3_tokenizer.zip`，只纳入运行所需的 Hugging Face Tokenizer JSON，不包含
Python 示例、`.DS_Store` 或 `__MACOSX` 元数据。

资源在加载时校验 SHA-256：

- `tokenizer.json`: `ecb6f9fc369894346f0511f4074ca75cee5cd5f3b06d02f1ba35fcd39f8e121d`
- `tokenizer_config.json`: `144a6d92b6012baeb4f2ac41d48ed3458e758f977a0fb5caf75ff07698fc844c`

原始 ZIP SHA-256：
`c954ca6f6e54281d72d3c27e2430cea7663f81292b39982e2f97890c66c302de`。

当前 ZIP 未附带独立许可证文件；对外分发此资源前应再次核对 DeepSeek 官方许可。

`DeepSeekTokenizer.load()` 使用进程级强缓存。首次调用懒加载并完成文件读取、SHA-256、
JSON 解析和 native Tokenizer 初始化；并发及后续调用共享同一个 Promise 和实例，不会重复
加载约 7.8 MB 的资源。具体文本的 Token ID 不做无界缓存，避免长上下文结果常驻内存。
