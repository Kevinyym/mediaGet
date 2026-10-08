import { describe, expect, it } from "vitest";
import { extractInitialStateJson, prepareInitialStateJson, parseInitialState, initialStateParseDiagnostic } from "@/lib/xhs-state";

describe("小红书页面状态提取", () => {
  it("兼容会触发 Unexpected token e 的 Set 和 Map 字面量", () => {
    const raw = '{note:{tags:new Set(["video","video"]), details:new Map([["id",1]]), empty:new Set()}}';
    expect(() => JSON.parse(raw)).toThrow();
    expect(parseInitialState(raw)).toEqual({ note: { tags: ["video"], details: { id: 1 }, empty: [] } });
  });

  it("兼容 JavaScript 数据字面量并保留笔记文本", () => {
    const raw = `{note: {desc: 'undefined 和引号 \\'', optional: undefined,
      empty: void 0, enabled: !0, disabled: !1, score: NaN, max: -Infinity,
      items: [1, -2,],},}`;
    expect(parseInitialState(raw)).toEqual({ note: {
      desc: "undefined 和引号 '", optional: null, empty: null,
      enabled: true, disabled: false, score: null, max: null, items: [1, -2],
    } });
  });

  it("拒绝代码执行并提供位置，安全处理 __proto__ 数据键", () => {
    for (const raw of [
      '{note: globalThis.secret}', '{note: process.env}', '{note: run()}',
      '{get note() { return 1; }}', '{[run()]: 1}', '{note: (globalThis.changed = true)}',
      '{note: (() => 1)()}', '{note: unknownVariable}', '{...other}',
      '{note: new Function("return 1")}', '{note: new Date()}',
      '{note: new Set(run())}', '{note: new Map([[{}, 1]])}',
    ]) {
      try {
        parseInitialState(raw);
        throw new Error("expected rejection");
      } catch (error) {
        expect(initialStateParseDiagnostic(error, raw)).toMatchObject({
          reason: "unsupported-state-syntax", position: expect.any(Number),
        });
      }
    }
    const parsed = parseInitialState('{"__proto__": {"polluted": true}, trailing: 1,}');
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("不完整状态通过语法解析器返回准确位置", () => {
    try {
      parseInitialState('{note:');
      throw new Error("expected rejection");
    } catch (error) {
      expect(initialStateParseDiagnostic(error, '{note:')).toMatchObject({ position: 6, line: 1, column: 6 });
    }
  });

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
