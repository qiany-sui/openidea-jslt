# OpenIDEA JSLT

为 OpenIDEA 提供 JSLT 高亮、补全、诊断、悬停、缩进格式化和定义跳转。插件 ID 为 `nc.jslt`。

[English](README.md) · [上架说明](PUBLISHING.md) · [CI](https://github.com/qiany-sui/openidea-jslt/actions/workflows/ci.yml)

## 安装

需要支持 Plugin API 1.5 的 OpenIDEA，以及 Node.js 20+、npm。
已在 macOS ARM64 的官方 OpenIDEA 0.1.43 完成桌面实测；Linux、Windows 尚未完成桌面集成验证。
**市场只安装插件，不会同时安装语言服务。** 请先完成下面第 1 步，再从市场安装/更新 JSLT，或从本地插件包安装。
语言服务通过 GitHub Release 附件分发，未注册 npm 包。

从 [v0.1.5 Release](https://github.com/qiany-sui/openidea-jslt/releases/tag/v0.1.5) 取得版本匹配的两个文件，或者按下文自行构建：

1. 在下载目录安装语言服务：

   ```sh
   npm install --global --offline --ignore-scripts ./openidea-jslt-language-server-0.1.5.tgz
   openidea-jslt-lsp --version
   openidea-jslt-lsp --path
   ```

   包内已包含运行依赖，无需联网下载依赖，不运行安装脚本。
   如果 npm 全局目录不可写，使用用户可写的 npm prefix 或 Node 版本管理器，不用 sudo 绕过。

2. 在 OpenIDEA **设置 → 插件 → 管理插件 → 从插件包文件安装** 中选择
   `nc.jslt-0.1.5.oiplugin`。本地构建的包尚未签名。安装后退出并重新启动 OpenIDEA。
   macOS 0.1.43 的文件选择器可能沿用插件包筛选，导致下一步脚本文件变灰；重启可恢复。
3. 在 **设置 → 插件 → 已安装 → JSLT** 中允许 `process:openidea-jslt-lsp`。
   若未绑定可执行文件，点 **选择可执行文件**，选择 `openidea-jslt-lsp --path` 输出的实际脚本，
   再通过 OpenIDEA 的正常对话框批准运行。安装插件时若服务不存在，只勾选权限还不够。
   若终端找不到命令，将 npm prefix 下的 `bin` 加入 PATH（Windows 使用 prefix 本身）；
   自定义 prefix 可运行 `<prefix>/bin/openidea-jslt-lsp --path` 查询脚本位置。
4. 关闭并重新打开项目，再打开 `examples/demo.jslt`。只重启语言服务可能仍保留旧配置。

服务通过独立命令启动，不读取应用标识、不写应用数据目录；普通版与定制版使用同一套发行包。
使用时不需要 Rust、Python、源码目录或 node_modules。

## 显示“没有可用的语言服务器”时

从 0.1.4 起，插件激活时会检查已批准的语言服务。缺少权限、程序缺失、启动失败或版本不匹配时，
通知提供“安装与授权说明”和“重新检查”按钮；空闲重载不重复弹同一提示。
命令面板中的 **JSLT: Check language server / 检查语言服务** 可随时再次检查。
可执行文件检查通过不等于已打开项目的 LSP 配置已刷新，必要时仍须关闭后重开项目。

若先装了市场插件，请补做上面的第 1、3、4 步。插件与服务都升级到 0.1.5；0.1.4 之前的服务没有 `--path` 命令。
插件只在自己的私有数据目录保存提示状态，不增加权限，不自动下载、安装或批准进程。

## 功能与边界

- 补全内置函数、当前文件函数/变量和导入函数；悬停显示函数说明。
- 检查语法、函数、参数和导入错误，支持只有函数定义的模块。
- 定义跳转支持本地函数、变量、参数、导入函数、模块别名及 import 路径，优先读取未保存内容。
- 默认使用 4 空格缩进，尊重编辑器的显式覆盖；格式化保留字符串、注释及文件末尾有无换行的状态，不会把单行表达式自动拆成多行。
- 内置函数、运行时注入变量和 JSON 字段没有本地定义目标；未完成的语法可能阻止跳转。
- 诊断基于 jslt-js，只显示首个编译错误，不能替代业务中的 Java JSLT 校验。
- 不加载 Java 扩展函数或 Maven classpath 导入；import 相对当前文档解析。
- 不监听外部文件；外部修改导入文件后，编辑或重新打开入口文件刷新。
- 名称高亮、补全和悬停目前只支持 ASCII；定义跳转另支持 Unicode 名称。

## 权限、升级与卸载

`process:openidea-jslt-lsp` 用于启动本地 Node 服务。拒绝后仍可识别文件和高亮。
服务使用 stdio 通信、读取本地 import，不把源码传到网络，也不提供转换执行入口。
Node 进程拥有当前用户权限，不在 WASM 沙箱内；安装包不修改 OpenIDEA 的授权记录。

升级时安装匹配版本的两个包并重开项目。OpenIDEA 会固定授权程序的路径和摘要，
升级服务或 Node 后可能需要通过正常界面重新确认或选择路径。
旧定制版 0.1.2 使用 `process:node`，0.1.3 起改为独立命令权限，不迁移或修改旧授权。
回退时重新安装旧版本的两个包；原定制版的旧服务目录保持独立。

卸载插件后可执行 `npm uninstall --global openidea-jslt-language-server` 移除服务。

## 开发

依赖 Node.js 20+、Python 3.11+、Rust 1.91.1+：

```sh
rustup target add wasm32-wasip2
npm --prefix server ci --ignore-scripts --registry https://registry.npmjs.org
cargo test --locked
npm run build
npm test
```

产物和校验和写入 `dist/`。测试涵盖源码 LSP，以及真实离线安装后的完整 LSP 回归。
锁定依赖，保留 SDK、上游来源和许可证；详细边界见 [英文说明](README.md)。
