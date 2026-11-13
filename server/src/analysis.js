// Derived from jslt-language-server 0.3.0 (Apache-2.0), Anton Kraev.
import { compile } from "jslt-js";
import { scan, tokenRange } from "jslt-editor/core";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Compile errors as [{from, to, message}] offsets. readImport(name) -> text | null resolves `import "name"`.
// An error inside an imported file is shown on the import statement that names it.
export function diagnose(text, name, readImport) {
  const resolver = { resolve(n) {
    const t = n === name ? text : readImport(n);
    if (t == null) throw new Error(`cannot read imported file ${n}`);
    return t;
  } };
  try {
    // 按模块编译也接受只有 def/let 的库文件；不调用 apply 执行转换。
    compile(`import ${JSON.stringify(name)} as editor_check\n.`, "<openidea:check>", { resolver });
    return [];
  } catch (e) {
    const line = typeof e.getLine === "function" ? e.getLine() : -1;
    const col = typeof e.getColumn === "function" ? e.getColumn() : -1;
    const msg = typeof e.getMessageWithoutLocation === "function" ? e.getMessageWithoutLocation() : e.message;
    const src = typeof e.getSource === "function" ? e.getSource() : null;
    if (line > 0 && (src == null || src === name)) {
      const r = tokenRange(text, line, col, msg);
      if (r) return [{ from: r.from, to: r.to, message: msg }];
    }
    const imp = src && src !== name ? new RegExp(`import\\s+"${escapeRegExp(src)}"`).exec(text) : null;
    const from = imp ? imp.index : 0;
    const to = imp ? imp.index + imp[0].length : Math.max(text.indexOf("\n"), Math.min(text.length, 1));
    return [{ from, to: Math.max(to, from), message: imp && line > 0 ? `${src}:${line}:${col}: ${msg}` : msg }];
  }
}

// name -> text of every file the program imports (for `alias:` completion).
export function importedFiles(text, readImport) {
  const files = new Map();
  for (const p of scan(text).imports.values()) {
    const t = readImport(p);
    if (t != null) files.set(p, t);
  }
  return files;
}
