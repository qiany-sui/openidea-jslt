# 协作约定

本项目是独立 OpenIDEA 插件，范围仅为 JSLT 编辑支持。公开项目名 openidea-jslt，插件 ID nc.jslt，当前开发及公开发行版本 0.1.4；市场更新见下方登记记录。

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
- 市场登记 PR：https://github.com/l0ng-ai/openidea-plugins/pull/143；2026-11-13 16:40（北京时间）已合并，合并提交 `bef84cd31a54b34dcce38c29760b7290354baf79`。
- 合并后登记 CI：https://github.com/l0ng-ai/openidea-plugins/actions/runs/43395042955，已通过并发布索引。当天已直接核对社区 `index.json` 及官方 v0.1.43 的 `plugins-index.json`，两者均包含 `nc.jslt` 0.1.3；此项为索引核验，未重复执行市场 GUI 安装。
- 后续发布复用 `nc` 的现有签名密钥；私钥始终留在仓库外，不上传 CI、Release 或登记仓库。

## 0.1.4 修复方案与验证计划

目标：市场安装后，语言服务缺失或未授权时提供可操作的提示，用户能按引导安装、选择可执行文件并恢复语言功能。
沿用两步安装；不添加自动下载、自动授权、宿主改动或新权限。仅改提示文档无法覆盖未阅读 README 的用户，因此在插件激活时检查服务，并提供检查/安装说明命令。

- [x] 在 `tests/setup.rs` 复现缺少权限时静默失败；在离线分发测试覆盖 CLI `--path`，确认修改前失败。
- [x] `src/setup.rs` 负责限时探测、配置通知和提示去重；`src/lib.rs` 仅接入生命周期/命令。通过宿主批准的命令调用 `--version`，不执行用户 JSLT。
- [x] 私有数据目录仅保存提示状态；缺失、拒绝、超时、异常输出或版本不匹配均提示配置，已就绪时清除提示。手动检查始终显示结果。
- [x] CLI 新增 `--path` 输出实际脚本路径；同步版本、清单和中英文安装说明，说明升级后重新授权及重开项目。
- [x] 运行 Rust、源码 LSP、离线安装包测试、格式检查和官方检查器；在临时 fixture 验证新提示和恢复路径。
- [x] 复用发布者密钥，CI 通过后签名发布 v0.1.4，公开下载核验摘要，提交市场版本更新 PR。

## 0.1.4 验证与发布记录（2026-11-13）

- 正式 Release：https://github.com/qiany-sui/openidea-jslt/releases/tag/v0.1.4；源码/tag 指向 `28e787ed343417b121e61689a64290945c20f07b`。
- 对应源码 CI：https://github.com/qiany-sui/openidea-jslt/actions/runs/43402522964，已通过。
- Rust 11/11（含配置检查 6 项）、源码 LSP 15/15、离线分发 1/1（内部已安装 LSP 15/15）通过。覆盖 CLI `--path`、Node 20 版本门槛和含中文/空格的安装路径；Rust 格式与 diff 检查通过。
- macOS ARM64 官方 OpenIDEA 0.1.43 中验证：未授权时自动显示配置通知，通过正常 UI 选择并批准临时语言服务后，“重新检查”报告已安装且获准运行，状态栏显示 `openidea-jslt`。
- 同一临时 fixture 的高亮、补全、快速文档、格式化、无效函数诊断及修正后清除、本地和跨文件定义跳转全部通过。运行统计为 0 错误、0 崩溃；测试插件及临时 npm 服务已卸载，官方测试应用已退出。
- Nc 的定制版已安装插件和语言服务仍为 0.1.3，本次未替换。Windows/Linux GUI 尚未验证。
- 复用 `nc` 发布者密钥；官方 v0.1.43 检查器与公钥签名验证通过。三个公开下载附件与本地最终发行文件逐字节一致，文件保存在忽略目录 `dist/releases/0.1.4/`。
- 签名插件 SHA-256：`fcc0b02b302cf717134c0253cf71349c8d1a4f3948563bb23942fd25db3710f5`；语言服务 tgz SHA-256：`f46c49e768dfc7d4b0d0ac6344a2f23236fcd46f5d667b7d95a344e7690a5f0a`。
- 市场更新 PR：https://github.com/l0ng-ai/openidea-plugins/pull/145；保留 0.1.3 条目。登记 CI：https://github.com/l0ng-ai/openidea-plugins/actions/runs/43404174985；仍需维护者审核合并，不把 GitHub Release 发布等同于市场索引已更新。
