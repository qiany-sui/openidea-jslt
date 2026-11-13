# 发布到 OpenIDEA 插件市场

源码仓库：[qiany-sui/openidea-jslt](https://github.com/qiany-sui/openidea-jslt)。
当前公开版本为 [0.1.3](https://github.com/qiany-sui/openidea-jslt/releases/tag/v0.1.3)。
市场登记需维护者审核；语言服务通过 Release 分发，未注册 npm 包。
本地代码审查、自动测试和 macOS 官方版桌面验证已通过，记录见 [AGENTS.md](AGENTS.md)。
构建与测试通过 [GitHub Actions](https://github.com/qiany-sui/openidea-jslt/actions/workflows/ci.yml) 持续检查，以目标提交的运行结果为准。
每次发布都先确认目标提交的 CI 通过，再用仓库外保存的发布者密钥签名；已有密钥应复用，不重新生成。

## 发行内容

- `nc.jslt-0.1.3.oiplugin`：语言识别、高亮组件与语言服务命令声明。
- `openidea-jslt-language-server-0.1.3.tgz`：供 npm 离线安装的独立服务及全部依赖，无安装脚本。
- `SHA256SUMS`：最终发行文件的 SHA-256。

语言服务 tgz 随 GitHub Release 分发即可，无需先在 npm registry 发布同名包。
发布页明确安装需要上述两个包和 Node.js 20+；市场安装插件不会自动安装语言服务。

## 验证与签名

1. 从干净 checkout 按 README 构建，并运行 Rust、源码 LSP、真实安装包 LSP 测试。
2. 用目标 OpenIDEA 普通版验证安装、权限、文件识别、高亮、补全、悬停、诊断/清除、格式化和定义跳转。
   在尚未验证的平台上不宣称支持。记录版本、系统与结果。
3. 安装官方 `openidea-plugin` CLI，使用最新正式 release 的检查器检查产物。
   CLI 的安装、命令和密钥管理以[官方文档](https://openidea.sh/zh/plugins/publishing/marketplace)为准。
4. 首次发布时确定发布者身份。`nc.jslt` 要求登记 `nc` 发布者；若前缀不可用，
   必须先统一变更插件 ID、产物名和文档，不能冒用其他发布者。
5. 在仓库外生成并保管生产密钥，将真实密钥路径放入本机环境变量 `JSLT_PUBLISHER_KEY`。
   私钥不得提交、写入日志或作为发行附件。密钥创建命令为 `openidea-plugin keygen <仓库外路径>`。
6. 在项目根目录运行：

   ```sh
   openidea-plugin check dist/nc.jslt-0.1.3.oiplugin
   openidea-plugin pack . --key "$JSLT_PUBLISHER_KEY" --publisher nc --out dist/nc.jslt-0.1.3.oiplugin
   openidea-plugin check dist/nc.jslt-0.1.3.oiplugin
   ```

   官方 pack 会收集清单引用的文件及 LICENSE、NOTICE、README。签名后不要再运行
   `npm run package` 或 `npm test`（安装测试会重新打未签名包），也不要修改包内任何文件。
7. 签名后重新计算两个包的摘要，替换构建时的校验和：

   ```sh
   cd dist
   shasum -a 256 nc.jslt-0.1.3.oiplugin openidea-jslt-language-server-0.1.3.tgz > SHA256SUMS
   shasum -a 256 -c SHA256SUMS
   ```

## 登记

在作者公开源码仓库创建对应 tag/Release，上传两个包和最终 SHA256SUMS。
源码应能构建该包；README 说明 `process:openidea-jslt-lsp` 的用途、Node 权限边界和两步安装。

向 [l0ng-ai/openidea-plugins](https://github.com/l0ng-ai/openidea-plugins) 提交 PR：

- 首次新增 `publishers/nc.toml`，填写显示名、实际 GitHub owner 及公钥。
- 新增 `plugins/nc.jslt.toml`，填写已存在的公开源码仓库 URL、版本、签名插件包的 Release URL 和 SHA-256。
- 不提交私钥，不伪造仓库地址。等待 CI 的 check、摘要和签名校验，以及维护者审核。

后续版本保留旧 IDE 仍需要的版本条目。登记规则要求对新版宿主检查失败的插件在 30 天内提供修复，
否则可能下架。详见[登记仓库规则](https://github.com/l0ng-ai/openidea-plugins/blob/main/README.md)。
