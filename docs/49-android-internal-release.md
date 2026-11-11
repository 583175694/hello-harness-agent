# Android 内测发布 Runbook

目标：给内测用户一个**可安装、可覆盖升级、版本可追踪**的签名 APK。本文只覆盖 Android 内测 APK，不包含 Google Play 正式发布。

## 1. 发布前必须确认

以下四项任一不满足，就不要发链接：

| 项目 | 检查方式 | 责任方 |
| --- | --- | --- |
| 线上 API 健康 | `curl -fsS https://pipishrimp.cn/readyz` 返回 `status=ok` | 后端 / 运维 |
| 短信登录可用 | 用一个真实手机号在 productionRelease 包上完成“发码 → 登录 → 发一条消息” | 产品 / QA |
| 版本号递增 | 新 `versionCode` 大于所有已分发版本 | 发布同学 |
| 签名一致 | 新 APK 能覆盖安装上一版，不需卸载 | 发布同学 |

签名 keystore 一旦丢失，已安装用户无法覆盖升级，只能卸载重装。`apps/android/internal-release.jks` 与 `keystore.properties` 必须放在团队密码库中备份，禁止提交到 git。

## 2. 本地生成内测包

首次在新机器发布时：

```bash
cd apps/android
bash scripts/setup-internal-signing.sh
```

如果已有正式的内测 keystore，恢复 `keystore.properties` 即可，不要重新生成。

生成发布包：

```bash
cd apps/android
HARNESS_VERSION_CODE=2 HARNESS_VERSION_NAME=0.1.1 \
  bash scripts/release-internal.sh
```

产物：

- `artifacts/android-internal/harness-<versionName>-<versionCode>.apk`
- 同名 `.sha256` 校验文件

脚本会拒绝 unsigned 产物；构建成功但没有签名时会直接失败。

## 3. 安装验收

先在至少一台真机上做覆盖安装，再发给内测用户：

```bash
adb install -r artifacts/android-internal/harness-0.1.1-2.apk
```

如果报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`，说明签名与已安装版本不一致。不要用“卸载重装”掩盖问题：先确认是否拿错 keystore。只有明确接受清空该用户数据时，才执行 `adb uninstall com.harness.agent`。

冷启动后按下面最小链路验收：

1. 未登录时发送消息，出现“登录后即可开始对话”。
2. 手机号收验证码，登录成功。
3. 发送一条消息并收到流式回答。
4. 杀进程重开，登录态仍在。
5. 设置 → 退出登录，再重新登录。

## 4. CI 出包

仓库提供 `.github/workflows/android-internal.yml`，在 GitHub Actions 手动触发，输入递增的 `versionCode` 和 `versionName`。

首次使用前配置四个 Repository secrets：

| Secret | 内容 |
| --- | --- |
| `ANDROID_INTERNAL_KEYSTORE_BASE64` | `base64 < apps/android/internal-release.jks` 的完整输出 |
| `ANDROID_INTERNAL_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_INTERNAL_KEY_ALIAS` | 默认 `harness-internal` |
| `ANDROID_INTERNAL_KEY_PASSWORD` | key 密码 |

生成 base64（macOS）：

```bash
base64 -i apps/android/internal-release.jks | pbcopy
```

CI 产物只保留在 Actions artifact 中，不上传公开商店。

## 5. 分发方式

内测阶段建议使用**受控下载链接 + 邀请码/白名单**，不要公开到应用商店。可选方案：

- 飞书 / 钉钉 / 企业微信内测群直接发 APK 与 SHA-256。
- 内部对象存储（COS/S3）生成 7 天有效链接。
- Firebase App Distribution 或类似服务，记录测试人员与安装版本。

无论哪种方式，下载页至少提供：版本号、更新时间、SHA-256、最低 Android 版本、反馈入口。

## 6. 内测版仍缺的产品/合规项

代码侧阻塞项已处理完；以下必须由产品/法务/运营提供，不能由客户端代码替代：

- 隐私政策与用户协议正式文本，以及公网可访问的 URL。
- 登录页勾选同意协议（文本确定后即可接入）。
- 账号注销入口与后端注销接口。当前只有“退出登录”，没有账号删除能力。
- 崩溃与性能监控（Sentry / Firebase Crashlytics / Bugly 任选），以及对应隐私声明。
- 用户反馈渠道与内测群里明确的响应人。
- 应用名称、图标、签名证书的最终确认。当前名称仍是 `Harness`。
- 若面向中国大陆公开分发：APP 备案、隐私合规检测、渠道资质。内测群小范围分发可先于商店上架，但不等于豁免。

## 7. 已知风险

- R8 已开启，但没有真机全链路回归时，不要跳过本文第 3 节。
- 当前仅覆盖大陆手机号登录；接口会拒绝非 11 位 `1` 开头号码。
- 客户端固定连接 `https://pipishrimp.cn`，没有切换环境的入口；内测包即连生产环境。
- 版本号默认仍是 `1 / 0.1.0`；发布时必须显式传入新版本，否则会得到“同版本不同内容”的安装包。
