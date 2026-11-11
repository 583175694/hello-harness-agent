# 事故复盘：createRun BAD_REQUEST 峰值

## 时间线

| 时间 (UTC+8) | 事件 |
| --- | --- |
| 14:02 | 监控：4xx 比例 > 15% |
| 14:18 | 定位：`encodeDefaults` 写入 null 数组字段 |
| 14:35 | 热修：撤销全局 defaults + 单测 |
| 15:00 | 错误率恢复基线 |

## 根因

客户端 JSON 出现 `"skillNames": null`，服务端 Zod **拒绝可选 null**。

> **教训**：协议字段「省略」与「显式 null」在移动端序列化层必须单测覆盖。

## 行动项

- [x] 增加 `CreateRunBodyJsonTest`
- [x] Toast 替代顶栏常驻 Problem
- [ ] 服务端 OpenAPI 标注 optional vs nullable

影响：**约 38 分钟** 发送不可用；无数据丢失。
