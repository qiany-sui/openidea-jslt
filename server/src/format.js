// Adapted from jslt-editor 0.3.0 core/format (Apache-2.0), Anton Kraev.
// 跨行保留字符串状态，避免格式化改变字符串内的缩进、尾空格和换行。
export function formatJslt(text, indent) {
  let depth = 0, quoted = false;
  const out = text.split(/(?<=\n)/).map(raw => {
    const eol = raw.endsWith("\r\n") ? "\r\n" : raw.endsWith("\n") ? "\n" : "";
    const line = eol ? raw.slice(0, -eol.length) : raw;
    const startsQuoted = quoted;
    let body = startsQuoted ? line : line.replace(/^[\t ]+/, "");
    let net = 0, lead = 0, seen = startsQuoted;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (quoted) {
        if (c === "\\") i++;
        else if (c === '"') quoted = false;
      } else if (c === '"') {
        quoted = true;
        seen = true;
      } else if (c === "/" && body[i + 1] === "/") {
        break;
      } else if ("{[(".includes(c)) {
        net++;
        seen = true;
      } else if ("}])".includes(c)) {
        net--;
        if (!seen) lead++;
      } else if (!/\s/.test(c)) {
        seen = true;
      }
    }
    if (!quoted) body = body.replace(/[\t ]+$/, "");
    const prefix = startsQuoted || !body ? "" : indent.repeat(Math.max(depth - lead, 0));
    depth = Math.max(depth + net, 0);
    return prefix + body + eol;
  }).join("");
  return out;
}
