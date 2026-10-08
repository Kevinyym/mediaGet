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

/** V8 错误文案可能包含状态数据片段；只输出固定类别与数字位置。 */
export function initialStateParseDiagnostic(error, source) {
  const message = error instanceof Error ? error.message : "";
  const reason = /unexpected end|unterminated/i.test(message) ? "incomplete-data"
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
    position: position ? Number(position) : "unknown",
    line: line ? Number(line) : "unknown",
    column: column ? Number(column) : "unknown",
    tokenCodePoint: token ? token.codePointAt(0) : "unknown",
  };
}
