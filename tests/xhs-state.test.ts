import { describe, expect, it } from "vitest";
import { extractInitialStateJson, prepareInitialStateJson, initialStateParseDiagnostic } from "@/lib/xhs-state";

describe("小红书页面状态提取", () => {
  it("忽略状态对象后面的脚本，正确处理正文中的括号、引号和反斜杠", () => {
    const state = { note: { desc: '括号 } ]、引号 "、反斜杠 \\、undefined' }, list: [{ id: 1 }] };
    const html = `<script>window.__INITIAL_STATE__=${JSON.stringify(state)};window.afterState = true;</script>`;
    expect(JSON.parse(prepareInitialStateJson(extractInitialStateJson(html)))).toEqual(state);
  });

  it("保留字符串里的 undefined，只处理裸值", () => {
    const html = '<script>window.__INITIAL_STATE__={"desc":"undefined","optional":undefined};</script>';
    expect(JSON.parse(prepareInitialStateJson(extractInitialStateJson(html)))).toEqual({ desc: "undefined", optional: null });
  });

  it("不执行非 JSON 表达式，也不掩盖不完整数据", () => {
    for (const script of ['JSON.parse("{}")', '{"note":']) {
      const raw = extractInitialStateJson(`<script>window.__INITIAL_STATE__=${script}</script>`);
      expect(() => JSON.parse(prepareInitialStateJson(raw))).toThrow();
    }
    expect(extractInitialStateJson("<script>window.other={}</script>")).toBeNull();
  });

  it("解析诊断仅包含固定类别和数字，不含错误中的页面片段", () => {
    const error = new SyntaxError('Unexpected token \'N\', "private-session-fragment" is not valid JSON');
    const diagnostic = initialStateParseDiagnostic(error, '{"value":NaN}');
    expect(diagnostic).toMatchObject({ reason: "unexpected-token", format: "object", tokenCodePoint: 78 });
    expect(JSON.stringify(diagnostic)).not.toContain("private-session-fragment");
  });
});
