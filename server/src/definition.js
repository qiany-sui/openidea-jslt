// jslt-js 0.3.1 未公开语法树接口；复用锁定版本的解析器，不调用 compile 的优化或执行阶段。
import { Lexer } from "../node_modules/jslt-js/src/parser/Lexer.js";
import { Parser } from "../node_modules/jslt-js/src/parser/Parser.js";
import { ParseContext } from "../node_modules/jslt-js/src/impl/ParseContext.js";
import { FunctionExpression } from "../node_modules/jslt-js/src/impl/FunctionExpression.js";
import { ExpressionImpl } from "../node_modules/jslt-js/src/impl/ExpressionImpl.js";
import { ScopeManager } from "../node_modules/jslt-js/src/impl/ScopeManager.js";

const positionKey = (loc) => `${loc.line}:${loc.column}`;

class DefinitionScope extends ScopeManager {
  constructor(parser) {
    super();
    this.parser = parser;
    this.definitions = new Map();
  }

  registerVariable(node) {
    const info = super.registerVariable(node);
    this.definitions.set(info, node.definition);
    return info;
  }

  registerParameter(name, loc) {
    const slot = super.registerParameter(name, loc);
    const info = this.current.at(-1).resolveVariable(name);
    this.definitions.set(info, this.parser.parameters.get(`${positionKey(loc)}:${name}`));
    return slot;
  }

  resolveVariable(node) {
    const info = super.resolveVariable(node);
    const token = this.parser.tokensByPosition.get(positionKey(node.getLocation()));
    this.parser.variables.set(token, this.definitions.get(info));
    return info;
  }
}

class DefinitionParser extends Parser {
  constructor(doc) {
    const tokens = new Lexer(doc.getText()).tokenize();
    for (const t of tokens) {
      t.from = doc.offsetAt({ line: t.line - 1, character: t.column - 1 });
      t.to = t.from + t.image.length;
    }
    super(tokens, ParseContext.root(doc.uri));
    this.imports = new Map();
    this.declarations = new Map();
    this.calls = new Set();
    this.variables = new Map();
    this.parameters = new Map();
    this.tokensByPosition = new Map(tokens.map(t => [positionKey(t), t]));
  }

  parseImports() {
    while (this.check("IMPORT")) {
      this.advance();
      const source = this.expect("STRING");
      const name = this.unescapeString(source);
      this.expect("AS");
      const alias = this.expect("IDENT");
      this.imports.set(alias.image, { name, source, alias });
      this.declarations.set(alias, alias);
    }
  }

  parseLet() {
    const name = this.peek(1);
    const node = super.parseLet();
    node.definition = name;
    this.declarations.set(name, name);
    return node;
  }

  parseFunctionDecl() {
    const name = this.peek(1);
    const parameters = [];
    for (let i = this.pos + 3; i < this.tokens.length && this.tokens[i].kind !== "RPAREN"; i++) {
      if (this.tokens[i].kind === "IDENT") parameters.push(this.tokens[i]);
    }
    super.parseFunctionDecl();
    const fn = this.ctx.getFunction(name.image);
    fn.definition = name;
    fn.location = this.locOf(name);
    for (const token of parameters) this.parameters.set(`${positionKey(name)}:${token.image}`, token);
    for (const token of [name, ...parameters]) this.declarations.set(token, token);
  }

  // 跳转只需要调用位置和参数语法；缺失模块、未知扩展函数不应阻断其他名称的解析。
  parseFunctionCall() {
    const token = this.advance();
    this.calls.add(token);
    this.expect("LPAREN");
    const args = [];
    if (!this.check("RPAREN")) {
      args.push(this.parseExpr());
      while (this.check("COMMA")) { this.advance(); args.push(this.parseExpr()); }
    }
    this.expect("RPAREN");
    return new FunctionExpression(token.image, args, this.locOf(token));
  }

  index() {
    this.parseImports();
    const lets = this.parseLetsAndDefs();
    const body = this.check("EOF") ? null : this.parseExpr();
    this.expect("EOF");
    const expression = new ExpressionImpl(lets, this.ctx.getDeclaredFunctions(), body);
    expression.prepare({ scope: new DefinitionScope(this) });
    return this;
  }
}

function index(doc) {
  try { return new DefinitionParser(doc).index(); }
  catch { return null; } // 编辑中的不完整语法没有可靠的作用域时，不猜测同名声明。
}

function location(doc, token) {
  return {
    uri: doc.uri,
    range: { start: doc.positionAt(token?.from ?? 0), end: doc.positionAt(token?.to ?? 0) },
  };
}

export function definition(doc, position, readImport) {
  const symbols = index(doc);
  if (!symbols) return null;
  const offset = doc.offsetAt(position);
  const token = symbols.tokens.find(t => ["IDENT", "PIDENT", "VARIABLE"].includes(t.kind) && t.from <= offset && offset <= t.to)
    || symbols.tokens.find(t => t.from <= offset && offset < t.to);
  if (!token) return null;
  const declaration = symbols.declarations.get(token) || symbols.variables.get(token);
  if (declaration) return location(doc, declaration);

  for (const imp of symbols.imports.values()) {
    if (imp.source === token) {
      const imported = readImport(imp.name);
      return imported ? location(imported) : null;
    }
  }
  if (!symbols.calls.has(token)) return null;
  const colon = token.image.indexOf(":");
  if (colon < 0) {
    if (symbols.ctx.getMacro(token.image)) return null;
    const fn = symbols.ctx.getDeclaredFunctions().get(token.image);
    if (fn) return location(doc, fn.definition);
  }
  const alias = colon < 0 ? token.image : token.image.slice(0, colon);
  const imp = symbols.imports.get(alias);
  if (!imp) return null;
  if (colon >= 0 && offset < token.from + colon) return location(doc, imp.alias);
  const imported = readImport(imp.name);
  if (!imported) return null;
  if (colon < 0) return location(imported);
  const module = index(imported);
  const name = token.image.slice(colon + 1);
  const target = module?.ctx.getDeclaredFunctions().get(name)?.definition || module?.imports.get(name)?.alias;
  return target ? location(imported, target) : null;
}
