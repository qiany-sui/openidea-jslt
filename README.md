# OpenIDEA JSLT

JSLT editing support for OpenIDEA: syntax highlighting, completion, diagnostics,
hover documentation, formatting and go to definition. Plugin ID: `nc.jslt`.

[中文说明](README.zh-CN.md) · [Publishing](PUBLISHING.md) · [CI](https://github.com/qiany-sui/openidea-jslt/actions/workflows/ci.yml)

## Requirements

- OpenIDEA compatible with Plugin API 1.5 (`engines.openidea = "^1.5"`).
- Node.js 20 or newer and npm for the language server.
- Verified with official OpenIDEA 0.1.43 on macOS ARM64. Linux and Windows
  desktop integration is not yet verified; do not infer support from the portable JavaScript alone.

## Install

Download both matching files from [v0.1.6](https://github.com/qiany-sui/openidea-jslt/releases/tag/v0.1.6) (or build them locally):
`nc.jslt-0.1.6.oiplugin` and `openidea-jslt-language-server-0.1.6.tgz`.
The marketplace plugin **does not install the language server**. Install the server first,
then install/update JSLT in **Settings → Plugins → Available** (or use the local package below).
Release archives are provided on GitHub; this is not an npm registry package.

1. Install the downloaded language server archive:

   ```sh
   npm install --global --offline --ignore-scripts ./openidea-jslt-language-server-0.1.6.tgz
   openidea-jslt-lsp --version
   openidea-jslt-lsp --path
   ```

   The archive includes its runtime dependencies. It needs no registry access,
   installation scripts, Rust, Python or build tools on the user's machine.
   Use a user-writable npm prefix or a Node version manager if the global prefix
   is not writable; do not use `sudo` to work around this.

2. In **Settings → Plugins → Manage Plugins → Install from Plugin Package File**,
   select the `.oiplugin` file. Local development packages are unsigned. Quit and
   restart OpenIDEA after installation. On macOS 0.1.43 the file chooser can retain
   the plugin-package filter and disable script files in the next step; restarting clears it.
3. In **Settings → Plugins → Installed → JSLT**, allow `process:openidea-jslt-lsp`.
   If no executable is bound, choose **Select executable** and select the **actual script**
   printed by `openidea-jslt-lsp --path`, then approve it in OpenIDEA's normal dialog.
   Enabling the permission alone is not sufficient when the server was missing during installation.
   If the shell cannot find the command, add the npm prefix's `bin` directory to PATH on macOS/Linux
   (the prefix itself on Windows). For a custom prefix, run `<prefix>/bin/openidea-jslt-lsp --path`.
4. Close and reopen the project, then open `examples/demo.jslt`.
   Existing projects can keep an earlier language-server configuration;
   restarting only the server does not refresh that configuration.

The server is an independent command. It does not inspect OpenIDEA's application
identifier or write into an application's data directory. Official and custom
builds use the same package. The two installation steps follow OpenIDEA's
[external language-server model](https://openidea.sh/zh/plugins/guides/language-features).

## When no language server is available

Since 0.1.4, the plugin checks the approved server when activated. Missing permission, a missing or failing
executable, and a different server version show a notification with **Installation and permissions**
and **Check again** buttons. The same warning is not repeated on idle reload; the command palette's
**JSLT: Check language server** command always checks again. A successful executable check does not
prove that an already-open project's LSP configuration has refreshed: close and reopen that project.

If you installed the marketplace plugin first, complete steps 1, 3 and 4 above. Upgrade **both** packages
to 0.1.6; servers older than 0.1.4 have no `--path` command. Permission approval stays under your control.
The plugin stores only notification state in its private data directory and adds no new permissions.

## Features and limits

- Highlight keywords, variables, function calls, strings, numbers and comments.
- Complete builtins, local functions/variables and imported functions; show function documentation. Function completion reuses existing call parentheses and preserves arguments.
- Report syntax, function, argument and import errors; support definition-only modules.
- Go to local functions, variables, parameters, imported functions, aliases and import paths.
  Definitions respect JSLT scope and unsaved imported buffers, with UTF-16 positions.
- Format indentation using four spaces by default, respecting explicit editor overrides and preserving strings, comments and final newlines (including their absence). Single-line expressions are not expanded.

Use the editor's completion, hover, format and **Declaration or Usages** commands.
Builtins, injected variables and JSON fields have no local definition target.
Incomplete syntax may prevent definition lookup until corrected.

Diagnostics use `jslt-js`, a JavaScript port of Java JSLT, and report the first
compiler error. They do not replace validation by your Java runtime. Java custom
functions and Maven classpath imports are not loaded. Imports resolve relative
to the source file, using unsaved editor buffers first. No external file watcher
is registered; edit or reopen the importer after changing an imported file on disk.
Completion/highlighting/hover for names currently support ASCII identifiers;
definition navigation additionally supports Unicode names. JSON input fields
are not inferred, and builtin documentation is in upstream English.

## Permissions and privacy

`process:openidea-jslt-lsp` is needed to start the local Node language server.
Declining it keeps file recognition and highlighting, but disables LSP features.
The server communicates over stdio and reads local imports; it does not send source
files to a network service or provide a transformation execution command.
Node runs with the current user's process permissions, outside the WASM sandbox.
No OpenIDEA grants or application settings are edited by the package.

## Update, rollback and uninstall

Install matching server/plugin versions, then reopen the project. OpenIDEA pins
approved executable paths and content hashes, so a changed server or Node version
may require normal permission confirmation or selecting the new executable.
The local 0.1.2 build used `process:node`; 0.1.3 and newer use the separate
`process:openidea-jslt-lsp` permission. Do not copy or edit permission records.

To roll back, reinstall both files from the earlier release. To remove the server:

```sh
npm uninstall --global openidea-jslt-language-server
```

Also uninstall the plugin from OpenIDEA. This does not remove earlier custom
0.1.1/0.1.2 runtime directories, which are separate installations.

## Build and test

Development needs Node.js 20+, Python 3.11+, Rust 1.91.1+ and the `wasm32-wasip2` target.
The Rust SDK is vendored from OpenIDEA v0.1.41. Dependency versions are locked.

```sh
rustup target add wasm32-wasip2
npm --prefix server ci --ignore-scripts --registry https://registry.npmjs.org
cargo test --locked
npm run build
npm test
```

`dist/` contains the WASM component, bundled server, unsigned `.oiplugin`,
installable `.tgz`, and `SHA256SUMS`. Build dependencies need network access on
first use; installing the finished `.tgz` does not. `npm test` tests source LSP
behavior, installs the release into a temporary path containing spaces and Unicode,
runs the complete LSP suite through that installation, and uninstalls it.

Definition navigation uses the pinned `jslt-js 0.3.1` parser and name-binding
phase without optimization or transformation execution. Run all LSP tests before
upgrading that dependency. Run `cargo fmt --package openidea-jslt --check` and `git diff --check`
before submitting changes. See [AGENTS.md](AGENTS.md) for contributor conventions.

## License and attribution

Apache-2.0. The language server adapts
[Anton Kraev's jslt-language-server](https://github.com/amkraev697642/jslt-language-server).
All dependency licenses and source/version attribution are retained in [NOTICE](NOTICE)
and `licenses/`. The public project continues the local 0.1.2 implementation;
0.1.3 introduced portable distribution; 0.1.4 improves setup checks and guidance, not the JSLT language semantics.
