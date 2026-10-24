import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // 测试文件：mock / 桩 / 第三方响应形状大量依赖 `any` 与 `@ts-nocheck`，
    // 强行类型化会把样板放大数倍、且把注意力从被测行为挪到类型体操上。
    // 这里降级为 warn（仍可见、不计入失败），「未使用变量」这类真错误保持 error。
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
];

export default eslintConfig;
