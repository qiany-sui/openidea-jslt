# 协作约定

本项目是独立 OpenIDEA 插件，范围仅为 JSLT 编辑支持。公开项目名 openidea-jslt，插件 ID nc.jslt，当前公开版本 0.1.3。

公开源码仓库：https://github.com/qiany-sui/openidea-jslt；默认分支 main，Verify 工作流负责构建、测试及官方插件检查。

- src/lib.rs 高亮范围用 UTF-8 字节偏移；LSP 位置用 UTF-16。保留现有 jslt-js/jslt-editor 语言行为，不执行用户转换。
- 语言服务是 openidea-jslt-lsp 外部命令；分发为无运行依赖的 npm tgz。不得硬编码 OpenIDEA 应用标识、用户绝对路径或修改宿主授权文件。
- 不增加自动下载/安装逻辑。安装两步：npm 安装本地 tgz，然后安装 oiplugin，通过正常权限界面授权。
- Node.js 20+、Python 3.11+、Rust 1.91.1+。Rust SDK 来自 OpenIDEA v0.1.41，vendor/openidea-plugin 不随意修改。
- 版本同步 plugin.toml、Cargo.toml/Cargo.lock、package.json、server/package.json/package-lock.json 及安装说明。依赖锁定，npm resolved 使用 HTTPS 官方源。
- 修改后执行 cargo test --locked、npm run build、npm test；提交前 cargo fmt --package openidea-jslt --check、git diff --check。dist 不提交，由源码重建。
- npm test 会对真实离线安装的发行包重复运行 LSP 测试。新增行为先复现失败；测试使用临时目录，不修改业务项目或已有安装。
- 首轮只声明 macOS ARM64 桌面实测；其他平台经过实际验证后再更新支持范围。
- 分发必须保留 LICENSE、NOTICE 和上游来源。签名私钥不进仓库；上架前按 PUBLISHING.md 检查，未经用户明确要求不推送、发布或提交登记 PR。
- 提交消息格式为 [ai] <type>(<scope>): <中文说明>；只提交当前任务文件。

## 0.1.3 验证记录（2026-11-13）

- macOS 15.7.4 ARM64，官方 OpenIDEA 0.1.43（ai.l0ng.openidea），Plugin API ^1.5。
- 从本地包安装并通过正常 UI 授权 process:openidea-jslt-lsp；独立 npm prefix 下的脚本实际以 --stdio 运行。
- 临时 fixture 中高亮、string 补全、快速文档、嵌套对象缩进、无效函数报错和修正后清除全部通过。
- 本地函数跳到第 4 行定义，模块函数跳到 lib.jslt 第 1 行定义；源码/安装包 LSP 均覆盖更多作用域及 Unicode 场景。
- Rust 高亮 5/5，源码 LSP 15/15，离线分发测试 1/1（内部再运行已安装 LSP 15/15）通过。
- macOS 从插件包安装后，选择器可能沿用文件类型筛选；重启宿主后可选脚本。安装说明已记录。
- 测试后从官方版正常卸载，列表恢复“已安装 0”；定制版 0.1.2 未替换。Linux/Windows GUI 尚未执行；CI 结果以 GitHub Actions 中对应提交的记录为准。

## 0.1.3 发布记录（2026-11-13）

- 正式 Release：https://github.com/qiany-sui/openidea-jslt/releases/tag/v0.1.3；源码/tag 指向 `4dba1483eb7059b4f509ba26a1505c982f1f1435`。
- 对应源码 CI：https://github.com/qiany-sui/openidea-jslt/actions/runs/43390400108，已通过。
- 插件由 `nc` 发布者签名，官方 v0.1.43 检查器和公钥签名验证通过；公开下载的三个附件与本地发行文件逐字节一致。
- 签名插件 SHA-256：`d830e6fc279f02c0d1d7debd45225b8d9521a19b46632faf3ca98b37d4e241a0`；最终文件保存在忽略目录 `dist/releases/0.1.3/`。
- 市场登记 PR：https://github.com/l0ng-ai/openidea-plugins/pull/143；已提交，尚待维护者审核合并，不把 Release 发布当作市场已上架。
- 后续发布复用 `nc` 的现有签名密钥；私钥始终留在仓库外，不上传 CI、Release 或登记仓库。
