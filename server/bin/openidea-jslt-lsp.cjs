#!/usr/bin/env node
"use strict";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--path") {
  console.log(__filename);
} else if (args.length === 1 && args[0] === "--help") {
  console.log("Usage: openidea-jslt-lsp [--stdio | --version | --path | --help]\nJSLT language server for OpenIDEA. Requires Node.js 20+.");
} else if (args.length > 1 || (args.length === 1 && args[0] !== "--stdio" && args[0] !== "--version")) {
  console.error(`Unknown argument: ${args.join(" ")}. Use --help for usage.`);
  process.exitCode = 2;
} else if (Number(process.versions.node.split(".")[0]) < 20) {
  console.error("openidea-jslt-lsp requires Node.js 20 or newer.");
  process.exitCode = 1;
} else if (args.length === 1 && args[0] === "--version") {
  console.log(require("../package.json").version);
} else {
  if (!args.length) process.argv.push("--stdio");
  require("../server.cjs");
}
