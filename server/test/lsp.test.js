import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { compile, toJS } from "jslt-js";
import { TextDocument } from "vscode-languageserver-textdocument";

async function client(t) {
  const entry = process.env.JSLT_SERVER || fileURLToPath(new URL("../src/server.js", import.meta.url));
  const child = spawn(process.execPath, [entry, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
  let bytes = Buffer.alloc(0), serial = 0, stderr = "";
  const pending = new Map(), notices = [], waiting = [];
  child.stderr.on("data", d => { stderr += d; });
  child.on("exit", code => {
    for (const p of pending.values()) p.reject(new Error(`server exited ${code}: ${stderr}`));
  });
  child.stdout.on("data", chunk => {
    bytes = Buffer.concat([bytes, chunk]);
    for (;;) {
      const split = bytes.indexOf("\r\n\r\n");
      if (split < 0) break;
      const length = Number(/Content-Length: (\d+)/i.exec(bytes.subarray(0, split).toString())[1]);
      if (bytes.length < split + 4 + length) break;
      const message = JSON.parse(bytes.subarray(split + 4, split + 4 + length));
      bytes = bytes.subarray(split + 4 + length);
      if (message.id !== undefined) {
        const p = pending.get(message.id);
        if (p) { pending.delete(message.id); message.error ? p.reject(message.error) : p.resolve(message.result); }
      } else {
        notices.push(message);
        for (const wake of waiting.splice(0)) wake();
      }
    }
  });
  const send = (method, params, id) => {
    const body = JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params });
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  };
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout: ${method}; ${stderr}`)); }, 5000);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    send(method, params, id);
  });
  t.after(() => { child.kill(); });
  const result = await request("initialize", { processId: process.pid, rootUri: null, capabilities: {} });
  send("initialized", {});
  const diagnostics = async (uri, predicate = () => true) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const i = notices.findIndex(m => m.method === "textDocument/publishDiagnostics" && m.params.uri === uri && predicate(m.params));
      if (i >= 0) return notices.splice(i, 1)[0].params.diagnostics;
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 50);
        waiting.push(() => { clearTimeout(timer); resolve(); });
      });
    }
    throw new Error(`no diagnostics for ${uri}; ${stderr}`);
  };
  return {
    request, send, diagnostics, capabilities: result.capabilities,
    open(uri, text) { send("textDocument/didOpen", { textDocument: { uri, languageId: "jslt", version: 1, text } }); },
    change(uri, text, version = 2) { send("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text }] }); },
  };
}

test("stdio provides diagnostics with UTF-16 positions and clears them after correction", async t => {
  const c = await client(t), uri = "file:///tmp/openidea-jslt-unicode.jslt";
  assert.equal(c.capabilities.hoverProvider, true);
  c.open(uri, '{"中文🦊": missing()}');
  const bad = await c.diagnostics(uri);
  assert.equal(bad.length, 1);
  assert.match(bad[0].message, /missing/);
  assert.deepEqual(bad[0].range.start, { line: 0, character: 9 });
  c.change(uri, '{"中文🦊": string(.value)}');
  assert.deepEqual(await c.diagnostics(uri), []);
});

test("completes variables and builtins and returns builtin hover documentation", async t => {
  const c = await client(t), uri = "file:///tmp/openidea-jslt-completion.jslt";
  c.open(uri, "let customer = .name\n$c");
  const vars = await c.request("textDocument/completion", { textDocument: { uri }, position: { line: 1, character: 2 } });
  const customer = vars.find(v => v.label === "customer");
  assert.ok(customer);
  assert.equal(customer.textEdit.range.start.character, 1);
  c.change(uri, "str");
  const functions = await c.request("textDocument/completion", { textDocument: { uri }, position: { line: 0, character: 3 } });
  assert.ok(functions.some(v => v.label === "string"));
  c.change(uri, "string(.value)", 3);
  const hover = await c.request("textDocument/hover", { textDocument: { uri }, position: { line: 0, character: 3 } });
  assert.match(hover.contents.value, /string\(/);
});

async function completeAtMarker(c, uri, input, label) {
  const offset = input.indexOf("|");
  assert.notEqual(offset, -1);
  const text = input.slice(0, offset) + input.slice(offset + 1);
  const doc = TextDocument.create(uri, "jslt", 1, text);
  c.open(uri, text);
  const items = await c.request("textDocument/completion", {
    textDocument: { uri }, position: doc.positionAt(offset),
  });
  const item = items.find(item => item.label === label);
  assert.ok(item, `missing completion: ${label}`);
  return TextDocument.applyEdits(doc, [item.textEdit]);
}

test("builtin completion reuses existing call parentheses and preserves arguments", async t => {
  const c = await client(t);
  const cases = [
    ["str|(42)", "string", "string(42)"],
    ["string|(42)", "string", "string(42)"],
    ["ran| ()", "random", "random ()"],
    ["str| \t (42)", "string", "string \t (42)"],
    ["str|\r\n(42)", "string", "string\r\n(42)"],
    ['{"中文🦊": str|(42)}', "string", '{"中文🦊": string(42)}'],
    ["ran|()", "random", "random()"],
    ["str|(size([1, 2]))", "string", "string(size([1, 2]))"],
  ];
  for (const [i, [input, label, expected]] of cases.entries()) {
    await t.test(input, async () => {
      const uri = `file:///tmp/jslt-completion-existing-${i}.jslt`;
      assert.equal(await completeAtMarker(c, uri, input, label), expected);
      c.change(uri, expected);
      assert.deepEqual(await c.diagnostics(uri, p => p.diagnostics.length === 0), []);
    });
  }
});

test("local and imported function completion reuses existing parentheses for either arity", async t => {
  const c = await client(t);
  c.open("file:///tmp/jslt-completion-library.jslt", "def twice(x) $x * 2\ndef answer() 42\n");
  const cases = [
    ["def twice(x) $x * 2\ntwi|(21)", "twice", "def twice(x) $x * 2\ntwice(21)"],
    ["def answer() 42\nans|()", "answer", "def answer() 42\nanswer()"],
    ['import "jslt-completion-library.jslt" as lib\nlib:twi|(21)', "twice", 'import "jslt-completion-library.jslt" as lib\nlib:twice(21)'],
    ['import "jslt-completion-library.jslt" as lib\nlib:ans| ()', "answer", 'import "jslt-completion-library.jslt" as lib\nlib:answer ()'],
  ];
  for (const [i, [input, label, expected]] of cases.entries()) {
    await t.test(label + i, async () => {
      const uri = `file:///tmp/jslt-completion-function-${i}.jslt`;
      assert.equal(await completeAtMarker(c, uri, input, label), expected);
      c.change(uri, expected);
      assert.deepEqual(await c.diagnostics(uri, p => p.diagnostics.length === 0), []);
    });
  }
});

test("completion still inserts call parentheses when there are none after the cursor", async t => {
  const c = await client(t);
  const cases = [
    ["str|", "string", "string("],
    ["ran|", "random", "random()"],
    ["def twice(x) $x * 2\ntwi|", "twice", "def twice(x) $x * 2\ntwice("],
    ["def answer() 42\nans|", "answer", "def answer() 42\nanswer()"],
    ["str| + (42)", "string", "string( + (42)"],
    ["str| // (comment)", "string", "string( // (comment)"],
  ];
  for (const [i, [input, label, expected]] of cases.entries()) {
    assert.equal(await completeAtMarker(c, `file:///tmp/jslt-completion-new-${i}.jslt`, input, label), expected);
  }
});

test("formatting uses the language defaults to match the IDEA sample layout", async t => {
  const config = fileURLToPath(new URL("../../languages/jslt.toml", import.meta.url));
  const defaults = JSON.parse(execFileSync("python3", ["-c",
    "import json,sys,tomllib; print(json.dumps(tomllib.load(open(sys.argv[1], 'rb'))['indent']))", config], { encoding: "utf8" }));
  const c = await client(t), uri = "file:///tmp/openidea-jslt-idea-layout.jslt";
  const expected = [
    'let payload = from-json(.headers.payload)',
    '',
    'let data = {',
    '    "name" : .headers.name, // 名称',
    '    "count" : $payload.count, //数量',
    '    "value" : $payload.value//保留注释间距',
    '}',
    '',
    '{',
    '    "properties" : {',
    '        "data" : $data,',
    '        "state" : $payload.state',
    '    }',
    '}',
    '',
  ].join("\n");
  c.open(uri, expected.replace(/^ +/gm, ""));
  const params = { textDocument: { uri }, options: { tabSize: defaults["tab-size"], insertSpaces: defaults["insert-spaces"] } };
  const edits = await c.request("textDocument/formatting", params);
  assert.equal(edits[0]?.newText, expected);
  c.change(uri, expected);
  assert.deepEqual(await c.request("textDocument/formatting", params), []);
});

test("formatting preserves absent, LF and CRLF final newlines", async t => {
  const c = await client(t);
  const cases = [
    ["", ""],
    ["   .", "."],
    ["   .\n", ".\n"],
    ["   .\r\n", ".\r\n"],
    ['{\r\n"value" : 1\r\n}', '{\r\n    "value" : 1\r\n}'],
    ['{\n"value" : 1\n}\n\n', '{\n    "value" : 1\n}\n\n'],
  ];
  for (const [i, [input, expected]] of cases.entries()) {
    const uri = `file:///tmp/openidea-jslt-line-ending-${i}.jslt`;
    c.open(uri, input);
    const params = { textDocument: { uri }, options: { tabSize: 4, insertSpaces: true } };
    const edits = await c.request("textDocument/formatting", params);
    assert.equal(edits[0]?.newText ?? input, expected);
    c.change(uri, expected);
    assert.deepEqual(await c.request("textDocument/formatting", params), []);
  }
});

test("formatting respects indentation options, keeps strings and comments, and is idempotent", async t => {
  const c = await client(t), uri = "file:///tmp/openidea-jslt-format.jslt";
  c.open(uri, '{\n"value": {\n"text": "} // 中文🦊" // retain\n}\n}');
  const params = { textDocument: { uri }, options: { tabSize: 4, insertSpaces: true } };
  const edits = await c.request("textDocument/formatting", params);
  assert.equal(edits[0].newText, '{\n    "value": {\n        "text": "} // 中文🦊" // retain\n    }\n}');
  c.change(uri, edits[0].newText);
  assert.deepEqual(await c.request("textDocument/formatting", params), []);
  const tabs = await c.request("textDocument/formatting", { ...params, options: { tabSize: 4, insertSpaces: false } });
  assert.ok(tabs[0].newText.includes('\n\t\t"text"'));
  const spaces = await c.request("textDocument/formatting", { ...params, options: { tabSize: 2, insertSpaces: true } });
  assert.equal(spaces[0].newText, '{\n  "value": {\n    "text": "} // 中文🦊" // retain\n  }\n}');
});

test("imports use unsaved text and closing an imported buffer restores disk diagnostics", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "openidea-jslt-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, "lib.jslt"), "def twice(x) $x * 2\n");
  const c = await client(t), uri = pathToFileURL(path.join(dir, "main.jslt")).href;
  const lib = pathToFileURL(path.join(dir, "lib.jslt")).href;
  c.open(uri, 'import "lib.jslt" as lib\nlib:twice(2)');
  assert.deepEqual(await c.diagnostics(uri), []);
  c.open(lib, "def other(x) $x\n");
  assert.equal((await c.diagnostics(uri, p => p.diagnostics.length > 0)).length, 1);
  c.send("textDocument/didClose", { textDocument: { uri: lib } });
  assert.deepEqual(await c.diagnostics(uri), []);
  c.change(uri, 'import "lib.jslt" as lib\nlib:');
  const items = await c.request("textDocument/completion", { textDocument: { uri }, position: { line: 1, character: 4 } });
  assert.ok(items.some(v => v.label === "twice"));
});

test("definition-only modules are valid while incomplete syntax and missing imports report errors", async t => {
  const c = await client(t), uri = "file:///tmp/openidea-jslt-module.jslt";
  c.open(uri, "def twice(x) $x * 2\n");
  assert.deepEqual(await c.diagnostics(uri), []);
  c.change(uri, '{\n "name":\n}');
  const syntax = await c.diagnostics(uri);
  assert.equal(syntax.length, 1);
  assert.equal(syntax[0].range.start.line, 2);
  c.change(uri, 'import "no-such-openidea-file.jslt" as lib\n.', 3);
  const missing = await c.diagnostics(uri);
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /cannot read imported file/);
});

test("formatting preserves multiline string values including spaces, braces and CRLF", async t => {
  const c = await client(t), uri = "file:///tmp/openidea-jslt-multiline.jslt";
  for (const [i, text] of [
    '   {\n"value": "first  \n  second } // literal\n  last"\n}',
    ' {\r\n"value": "first  \r\n  second\r\nlast"\r\n}',
  ].entries()) {
    if (i === 0) c.open(uri, text); else c.change(uri, text, 3);
    const params = { textDocument: { uri }, options: { tabSize: 4, insertSpaces: true } };
    const edits = await c.request("textDocument/formatting", params);
    const formatted = edits[0]?.newText ?? text;
    assert.deepEqual(toJS(compile(formatted).applyInput()), toJS(compile(text).applyInput()));
    assert.ok(formatted.startsWith('{'));
    c.change(uri, formatted, i === 0 ? 2 : 4);
    assert.deepEqual(await c.request("textDocument/formatting", params), []);
  }
});

const definition = (c, uri, line, character) => c.request("textDocument/definition", {
  textDocument: { uri }, position: { line, character },
});
const location = (uri, line, start, end) => ({
  uri, range: { start: { line, character: start }, end: { line, character: end } },
});

test("definition resolves forward and recursive functions, parameters and file variables", async t => {
  const c = await client(t), uri = "file:///tmp/jslt-definition.jslt";
  assert.equal(c.capabilities.definitionProvider, true);
  c.open(uri, [
    "let value = 3",
    "def first(value) second($value)",
    "def second(other) if ($other) first($other - 1) else $value",
    "first($value)",
  ].join("\n"));
  assert.deepEqual(await definition(c, uri, 1, 20), location(uri, 2, 4, 10));
  assert.deepEqual(await definition(c, uri, 1, 26), location(uri, 1, 10, 15));
  assert.deepEqual(await definition(c, uri, 2, 31), location(uri, 1, 4, 9));
  assert.deepEqual(await definition(c, uri, 2, 53), location(uri, 0, 4, 9));
  assert.deepEqual(await definition(c, uri, 3, 2), location(uri, 1, 4, 9));
  assert.deepEqual(await definition(c, uri, 3, 10), location(uri, 0, 4, 9));
  assert.deepEqual(await definition(c, uri, 1, 12), location(uri, 1, 10, 15));
});

test("definition keeps function, object, conditional and comprehension locals in scope", async t => {
  const c = await client(t), uri = "file:///tmp/jslt-definition-scopes.jslt";
  c.open(uri, [
    "let item = 1",
    "def a(item) let local = $item $local",
    "def b(item) $item",
    "{",
    '  "outer": $item,',
    '  "object": {let item = 2 "inner": $item},',
    '  "then": if (true) let item = 3 $item else $item,',
    '  "else": if (false) $item else let item = 4 $item,',
    '  "array": [for (.) let item = . $item if ($item)],',
    '  "map": {for (.) let item = 1 "key": $item},',
    '  "after": $item,',
    '  "unknown": $local',
    "}",
  ].join("\n"));
  for (const [line, column, targetLine, start, end] of [
    [1, 25, 1, 6, 10], [1, 32, 1, 16, 21], [2, 14, 2, 6, 10],
    [4, 13, 0, 4, 8], [5, 36, 5, 17, 21],
    [6, 34, 6, 24, 28], [6, 45, 0, 4, 8],
    [7, 22, 0, 4, 8], [7, 46, 7, 36, 40],
    [8, 34, 8, 24, 28], [8, 43, 8, 24, 28],
    [9, 38, 9, 22, 26], [10, 13, 0, 4, 8],
  ]) assert.deepEqual(await definition(c, uri, line, column), location(uri, targetLine, start, end), `at ${line}:${column}`);
  assert.equal(await definition(c, uri, 11, 17), null);
});

test("definition ignores strings, comments, properties, builtins and undeclared names", async t => {
  const c = await client(t), uri = "file:///tmp/jslt-definition-non-symbols.jslt";
  c.open(uri, [
    "def named(x) $x",
    "let value = 1",
    "// named($value)",
    '{"text": "named($value)\nlet fake = 1", "field": .value, "builtin": string($missing)}',
  ].join("\n"));
  for (const [line, column] of [[2, 5], [2, 11], [3, 14], [3, 19], [4, 6], [4, 30], [4, 50], [4, 58]]) {
    assert.equal(await definition(c, uri, line, column), null, `at ${line}:${column}`);
  }
  c.change(uri, "def string(x) $x\nstring(1)");
  assert.deepEqual(await definition(c, uri, 1, 3), location(uri, 0, 4, 10));
});

test("definition returns UTF-16 ranges for Unicode names, CRLF and adjacent emoji", async t => {
  const c = await client(t), uri = "file:///tmp/jslt-definition-unicode.jslt";
  c.open(uri, 'def 转换(参数) $参数\r\n{"🦊": {let 名称 = 1 "值": 转换($名称)}}');
  assert.deepEqual(await definition(c, uri, 0, 13), location(uri, 0, 7, 9));
  assert.deepEqual(await definition(c, uri, 1, 25), location(uri, 0, 4, 6));
  assert.deepEqual(await definition(c, uri, 1, 29), location(uri, 1, 12, 14));
});

test("definition follows local imports and module aliases using unsaved buffers", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "jslt-definition-中文 "));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, "lib"));
  await writeFile(path.join(dir, "lib", "工具.jslt"), "def twice(x) $x * 2\n.");
  const c = await client(t), uri = pathToFileURL(path.join(dir, "main.jslt")).href;
  const lib = pathToFileURL(path.join(dir, "lib", "工具.jslt")).href;
  c.open(uri, 'import "lib/工具.jslt" as lib\n[lib:twice(2), lib(.)]');
  assert.deepEqual(await definition(c, uri, 1, 7), location(lib, 0, 4, 9));
  assert.deepEqual(await definition(c, uri, 1, 3), location(uri, 0, 24, 27));
  assert.deepEqual(await definition(c, uri, 0, 12), location(lib, 0, 0, 0));
  assert.deepEqual(await definition(c, uri, 1, 15), location(lib, 0, 0, 0));
  c.open(lib, "// unsaved\n\ndef twice(x) $x * 3\n.");
  assert.deepEqual(await definition(c, uri, 1, 7), location(lib, 2, 4, 9));
  c.change(lib, "def other(x) $x\n.");
  assert.equal(await definition(c, uri, 1, 7), null);
  c.send("textDocument/didClose", { textDocument: { uri: lib } });
  assert.deepEqual(await definition(c, uri, 1, 7), location(lib, 0, 4, 9));
  c.change(uri, 'import "absent.jslt" as lib\nlib:twice(.)');
  assert.equal(await definition(c, uri, 1, 7), null);
  assert.equal(await definition(c, uri, 0, 10), null);
});

test("definition updates after incremental edits and handles incomplete code without exiting", async t => {
  const c = await client(t), uri = "file:///tmp/jslt-definition-edit.jslt";
  c.open(uri, "let value = 1\n$value");
  assert.deepEqual(await definition(c, uri, 1, 3), location(uri, 0, 4, 9));
  c.send("textDocument/didChange", { textDocument: { uri, version: 2 }, contentChanges: [{
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text: "// moved\n",
  }] });
  assert.deepEqual(await definition(c, uri, 2, 3), location(uri, 1, 4, 9));
  c.change(uri, "let value = 1\n{", 3);
  assert.equal(await definition(c, uri, 1, 1), null);
  c.change(uri, "let value = 1\n$value", 4);
  assert.deepEqual(await definition(c, uri, 1, 3), location(uri, 0, 4, 9));
});

test("definition follows JSLT declaration preparation order and builtin macro priority", async t => {
  const c = await client(t), uri = "file:///tmp/jslt-definition-binding.jslt";
  c.open(uri, "let first = $second\nlet second = 2\n$first");
  assert.deepEqual(await definition(c, uri, 0, 15), location(uri, 1, 4, 10));
  c.change(uri, 'let x = 1\n{let first = $x let x = 2 "result": $first}');
  assert.deepEqual(await definition(c, uri, 1, 14), location(uri, 1, 20, 21));
  c.change(uri, "let x = 1\ndef f() let x = $x $x\nf()", 3);
  assert.deepEqual(await definition(c, uri, 1, 17), location(uri, 1, 12, 13));
  c.change(uri, "let x = []\n[for ($x) let x = [] $x]", 4);
  assert.deepEqual(await definition(c, uri, 1, 7), location(uri, 1, 14, 15));
  c.change(uri, "def fallback(x,y) $x\nfallback(null,2)", 5);
  assert.equal(await definition(c, uri, 1, 3), null);
});

test("definition accepts a caret immediately after a symbol", async t => {
  const c = await client(t), uri = "file:///tmp/jslt-definition-boundary.jslt";
  c.open(uri, "let value = 1\ndef twice(x) $x * 2\n{\"result\": twice($value)}");
  assert.deepEqual(await definition(c, uri, 2, 16), location(uri, 1, 4, 9));
  assert.deepEqual(await definition(c, uri, 2, 23), location(uri, 0, 4, 9));
});

test("definition resolves an imported module exported as a callable alias", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "jslt-definition-reexport-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, "a.jslt"), 'import "b.jslt" as b\n.');
  await writeFile(path.join(dir, "b.jslt"), ".");
  const c = await client(t), uri = pathToFileURL(path.join(dir, "main.jslt")).href;
  const target = pathToFileURL(path.join(dir, "a.jslt")).href;
  c.open(uri, 'import "a.jslt" as a\na:b(.)');
  assert.deepEqual(await definition(c, uri, 1, 2), location(target, 0, 19, 20));
});
