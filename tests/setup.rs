use openidea_jslt::Jslt;
use openidea_plugin::{Plugin, mock::MockHost};

#[test]
fn missing_permission_has_actionable_setup_notification_and_keeps_plugin_active() {
    let host = MockHost::install().with_capabilities(&[]);
    Jslt.activate(&host.context("nc.jslt")).unwrap();
    let notices = host.notifications_with_actions();
    assert_eq!(notices.len(), 1, "missing LSP must not remain silent");
    assert!(
        notices[0]
            .actions
            .iter()
            .any(|a| a.command == "nc.jslt.setup")
    );
    assert!(
        notices[0]
            .actions
            .iter()
            .any(|a| a.command == "nc.jslt.check")
    );
    assert!(
        notices[0]
            .notification
            .body
            .contains("process:openidea-jslt-lsp")
    );
    Jslt.activate(&host.context("nc.jslt")).unwrap();
    assert_eq!(
        host.notifications_with_actions().len(),
        1,
        "idle reload must not repeat the notice"
    );
}

#[test]
fn setup_command_opens_the_versioned_installation_guide() {
    let host = MockHost::install().with_capabilities(&[]);
    Jslt.run_command("nc.jslt.setup", &host.invocation(), None)
        .unwrap();
    let urls = host.opened_urls();
    assert_eq!(urls.len(), 1);
    assert!(urls[0].starts_with("https://github.com/qiany-sui/openidea-jslt/blob/v"));
    assert!(urls[0].ends_with("README.md#install"));
}

#[test]
fn healthy_service_is_silent_and_manual_check_reports_readiness() {
    let host = MockHost::install().with_capabilities(&["process:openidea-jslt-lsp"]);
    host.on_process("openidea-jslt-lsp", |args, stdin| {
        assert_eq!(args, ["--version"]);
        assert_eq!(stdin, None);
        Ok(openidea_plugin::ProcessOutput {
            status: Some(0),
            stdout: format!("{}\n", env!("CARGO_PKG_VERSION")),
            stderr: String::new(),
        })
    });
    Jslt.activate(&host.context("nc.jslt")).unwrap();
    assert!(host.notifications_with_actions().is_empty());
    Jslt.run_command("nc.jslt.check", &host.invocation(), None)
        .unwrap();
    assert_eq!(host.notifications().len(), 1);
    assert_eq!(
        host.notifications()[0].level,
        openidea_plugin::NotificationLevel::Info
    );
}

#[test]
fn failed_or_wrong_service_never_reports_ready() {
    for (status, stdout) in [
        (Some(1), env!("CARGO_PKG_VERSION")),
        (None, ""),
        (Some(0), ""),
        (Some(0), "another tool"),
        (Some(0), "0.1.4"),
    ] {
        let host = MockHost::install().with_capabilities(&["process:openidea-jslt-lsp"]);
        host.on_process("openidea-jslt-lsp", move |_, _| {
            Ok(openidea_plugin::ProcessOutput {
                status,
                stdout: stdout.into(),
                stderr: "fixture failure".into(),
            })
        });
        Jslt.activate(&host.context("nc.jslt")).unwrap();
        assert_eq!(
            host.notifications_with_actions().len(),
            1,
            "status={status:?}, stdout={stdout}"
        );
        assert_eq!(
            host.notifications_with_actions()[0].notification.level,
            openidea_plugin::NotificationLevel::Warning
        );
    }
}

#[test]
fn process_errors_are_actionable_and_do_not_disable_highlighting() {
    use openidea_plugin::syntax::SyntaxProvider;
    for error in [
        openidea_plugin::Error::NotFound("fixture".into()),
        openidea_plugin::Error::Failed("timed out".into()),
    ] {
        let host = MockHost::install().with_capabilities(&["process:openidea-jslt-lsp"]);
        host.on_process("openidea-jslt-lsp", move |_, _| Err(error.clone()));
        Jslt.activate(&host.context("nc.jslt")).unwrap();
        assert_eq!(host.notifications_with_actions().len(), 1);
        assert!(!Jslt.highlights("jslt", "def greet(name) $name").is_empty());
        Jslt.run_command("nc.jslt.check", &host.invocation(), None)
            .unwrap();
        assert_eq!(host.notifications_with_actions().len(), 2);
    }
}

#[test]
fn a_new_failure_is_reported_after_recovery() {
    let host = MockHost::install().with_capabilities(&["process:openidea-jslt-lsp"]);
    Jslt.activate(&host.context("nc.jslt")).unwrap();
    assert_eq!(host.notifications_with_actions().len(), 1);
    host.on_process("openidea-jslt-lsp", |_, _| {
        Ok(openidea_plugin::ProcessOutput {
            status: Some(0),
            stdout: env!("CARGO_PKG_VERSION").into(),
            stderr: String::new(),
        })
    });
    Jslt.run_command("nc.jslt.check", &host.invocation(), None)
        .unwrap();
    host.on_process("openidea-jslt-lsp", |_, _| {
        Err(openidea_plugin::Error::Denied(
            "process:openidea-jslt-lsp".into(),
        ))
    });
    Jslt.activate(&host.context("nc.jslt")).unwrap();
    assert_eq!(host.notifications_with_actions().len(), 2);
}
