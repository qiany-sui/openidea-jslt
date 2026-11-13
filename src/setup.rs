use openidea_plugin::{Error, NotificationAction, NotificationLevel, host};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const PROGRAM: &str = "openidea-jslt-lsp";

fn text<'a>(zh: &'a str, en: &'a str) -> &'a str {
    if host::locale().starts_with("zh") {
        zh
    } else {
        en
    }
}

pub fn guide() -> Result<(), Error> {
    let page = text("README.zh-CN.md#安装", "README.md#install");
    host::open_url(&format!(
        "https://github.com/qiany-sui/openidea-jslt/blob/v{VERSION}/{page}"
    ))
}

pub fn check(manual: bool) {
    // 宿主限制进程执行时间；失败不能导致插件激活失败或影响语法高亮。
    let result = host::run_process(PROGRAM, &["--version".into()], None);
    let (state, detail) = match result {
        Ok(output) if output.status == Some(0) && output.stdout.trim() == VERSION => ("ready", String::new()),
        Ok(output) if output.status == Some(0) => ("version", format!("{} {VERSION}", text("语言服务版本不匹配或输出无效，请安装", "Server version differs or its output is invalid; install"))),
        Ok(_) => ("failed", text("语言服务启动失败，请检查 Node.js 20+ 和脚本路径。", "The server failed to start. Check Node.js 20+ and the script path.").into()),
        Err(Error::Denied(_)) => ("denied", text("语言服务尚未授权，或已批准的可执行文件需要重新确认。", "The server is not authorized, or its approved executable needs confirmation.").into()),
        Err(_) => ("missing", text("语言服务不可用，可能尚未安装、路径失效或启动超时。", "The server is unavailable: it may be missing, have an invalid path, or have timed out.").into()),
    };
    let marker = host::fs::plugin_dir()
        .ok()
        .map(|dir| format!("{dir}/setup-notice.txt"));
    let key = format!("{VERSION}:{state}");
    let previous = marker
        .as_ref()
        .and_then(|path| host::fs::read_file(path).ok());
    if state == "ready" {
        if manual {
            host::notify(
                NotificationLevel::Info,
                "JSLT",
                text(
                    "语言服务已安装并获准运行。若编辑器仍显示没有可用的语言服务器，请关闭后重新打开项目。",
                    "The language server is installed and approved to run. If the editor still shows no available language server, close and reopen the project.",
                ),
            );
        }
    } else if manual || previous.as_deref() != Some(&key) {
        let body = format!(
            "{detail}\n{}",
            text(
                "市场插件需要单独安装语言服务。在设置 → 插件 → 已安装 → JSLT 中允许 process:openidea-jslt-lsp，并选择 openidea-jslt-lsp --path 输出的脚本；之后重开项目。命令面板可随时运行 JSLT：检查语言服务。",
                "The marketplace plugin needs a separate language-server install. In Settings → Plugins → Installed → JSLT, allow process:openidea-jslt-lsp and select the script printed by openidea-jslt-lsp --path; then reopen the project. Run JSLT: Check language server from the command palette at any time.",
            )
        );
        if host::notify_with_actions(
            NotificationLevel::Warning,
            text("JSLT 需要完成配置", "JSLT setup needs attention"),
            &body,
            &[
                NotificationAction::new(
                    text("安装与授权说明", "Installation and permissions"),
                    "nc.jslt.setup",
                ),
                NotificationAction::new(text("重新检查", "Check again"), "nc.jslt.check"),
            ],
        )
        .is_err()
        {
            host::notify(NotificationLevel::Warning, "JSLT", &body);
        }
    }
    if let Some(path) = marker {
        let _ = host::fs::write_file(&path, &key);
    }
}
