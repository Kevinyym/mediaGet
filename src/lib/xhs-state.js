import { parseExpressionAt } from "acorn";

/** 仅提取状态对象；忽略同一 script 中赋值之后的代码，绝不执行页面脚本。 */
export function extractInitialStateJson(html) {
  const match = /window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script\s*>/i.exec(html);
  if (!match) return null;
  const source = match[1].trim();
  if (source[0] !== "{" && source[0] !== "[") return source;

  const stack = [];
  let quote = "";
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") {
      const opening = stack.pop();
      if ((char === "}" && opening !== "{") || (char === "]" && opening !== "[")) {
        return source;
      }
      if (!stack.length) return source.slice(0, i + 1);
    }
  }
  // 不完整对象保留原文，交由 JSON.parse 拒绝并记录安全诊断。
  return source;
}

/** 只替换字符串外的裸 undefined，保留正文和 URL 中的同名文本。 */
export function prepareInitialStateJson(raw) {
  const source = String(raw || "").trim().replace(/;\s*$/, "");
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (source.startsWith("undefined", i)) {
      const before = source[i - 1] || "";
      const after = source[i + 9] || "";
      if (!/[\w$]/.test(before) && !/[\w$]/.test(after)) {
        output += "null";
        i += 8;
        continue;
      }
    }
    output += char;
  }
  return output;
}

/** JSON 优先；JS 字面量降级只遍历数据节点，不执行函数、属性访问或任意表达式。 */
export function parseInitialState(raw) {
  const source = String(raw || "").trim().replace(/;\s*$/, "");
  try {
    return JSON.parse(prepareInitialStateJson(source));
  } catch {
    // 赋值右侧可能采用 JavaScript 字面量语法（单引号、未加引号的键、void 0 等）。
  }
  const expression = parseExpressionAt(source, 0, { ecmaVersion: 2022, locations: true });
  if (source.slice(expression.end).trim()) {
    const error = new SyntaxError("Unsupported trailing state content");
    error.pos = expression.end;
    throw error;
  }

  function reject(node) {
    const error = new SyntaxError("Unsupported state syntax");
    error.code = "XHS_STATE_UNSUPPORTED";
    error.pos = node.start;
    error.loc = node.loc.start;
    error.nodeType = node.type;
    throw error;
  }

  function read(node, depth = 0) {
    if (depth > 128) return reject(node);
    switch (node.type) {
      case "Literal":
        if (node.regex || node.bigint) return reject(node);
        return typeof node.value === "number" && !Number.isFinite(node.value) ? null : node.value;
      case "Identifier":
        if (["undefined", "NaN", "Infinity"].includes(node.name)) return null;
        return reject(node);
      case "ArrayExpression":
        return node.elements.map((item) => item ? read(item, depth + 1) : null);
      case "NewExpression": {
        // 仅解释已知集合的数据载荷，不调用页面指定的构造器。
        if (node.callee.type !== "Identifier" || !["Set", "Map"].includes(node.callee.name) ||
            node.arguments.length > 1 || (node.arguments.length && node.arguments[0].type !== "ArrayExpression")) {
          return reject(node);
        }
        const entries = node.arguments.length ? read(node.arguments[0], depth + 1) : [];
        if (node.callee.name === "Set") return [...new Set(entries)];
        const result = {};
        for (const entry of entries) {
          if (!Array.isArray(entry) || entry.length !== 2 ||
              !["string", "number"].includes(typeof entry[0])) return reject(node);
          Object.defineProperty(result, String(entry[0]), {
            value: entry[1], enumerable: true, writable: true, configurable: true,
          });
        }
        return result;
      }
      case "ObjectExpression": {
        const result = {};
        for (const property of node.properties) {
          if (property.type !== "Property" || property.kind !== "init" ||
              property.method || property.computed || property.shorthand) return reject(property);
          const key = property.key.type === "Identifier" ? property.key.name
            : property.key.type === "Literal" && !property.key.regex && !property.key.bigint
              ? String(property.key.value) : null;
          if (key === null) return reject(property.key);
          // __proto__ 也作为普通数据键处理，不调用对象原型 setter。
          Object.defineProperty(result, key, {
            value: read(property.value, depth + 1), enumerable: true, writable: true, configurable: true,
          });
        }
        return result;
      }
      case "UnaryExpression": {
        if (node.operator === "void" && node.argument.type === "Literal" && node.argument.value === 0) return null;
        if (!["!", "+", "-"].includes(node.operator)) return reject(node);
        const value = read(node.argument, depth + 1);
        if (node.operator === "!" && (typeof value === "boolean" || typeof value === "number")) return !value;
        if (node.argument.type === "Identifier" && ["Infinity", "NaN"].includes(node.argument.name)) return null;
        if (typeof value !== "number") return reject(node);
        return node.operator === "-" ? -value : value;
      }
      default:
        return reject(node);
    }
  }
  if (!["ObjectExpression", "ArrayExpression"].includes(expression.type)) return reject(expression);
  return read(expression);
}

/** V8 错误文案可能包含状态数据片段；只输出固定类别与数字位置。 */
export function initialStateParseDiagnostic(error, source) {
  const message = error instanceof Error ? error.message : "";
  const reason = error?.code === "XHS_STATE_UNSUPPORTED" ? "unsupported-state-syntax"
    : /unexpected end|unterminated/i.test(message) ? "incomplete-data"
    : /after JSON|non-whitespace/i.test(message) ? "trailing-content"
    : /property name/i.test(message) ? "invalid-property"
    : /unexpected token|not valid JSON/i.test(message) ? "unexpected-token"
    : "invalid-json";
  const position = message.match(/position\s+(\d+)/i)?.[1];
  const line = message.match(/line\s+(\d+)/i)?.[1];
  const column = message.match(/column\s+(\d+)/i)?.[1];
  const token = message.match(/Unexpected token ['"](.)['"]/i)?.[1];
  const format = source.startsWith("{") ? "object"
    : source.startsWith("[") ? "array"
    : /^JSON\.parse\s*\(/.test(source) ? "json-parse-expression"
    : source.startsWith("(") ? "parenthesized-expression" : "other";
  return {
    reason, format, stateLength: source.length,
    position: Number.isInteger(error?.pos) ? error.pos : position ? Number(position) : "unknown",
    line: Number.isInteger(error?.loc?.line) ? error.loc.line : line ? Number(line) : "unknown",
    column: Number.isInteger(error?.loc?.column) ? error.loc.column : column ? Number(column) : "unknown",
    nodeType: error?.code === "XHS_STATE_UNSUPPORTED" ? error.nodeType : "unknown",
    tokenCodePoint: token ? token.codePointAt(0) : "unknown",
  };
}
