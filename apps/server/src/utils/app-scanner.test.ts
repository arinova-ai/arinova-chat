import { describe, it, expect } from "vitest";
import { scanFileContent, isScannable } from "./app-scanner.js";

describe("scanFileContent", () => {
  it("returns an empty array for clean code with no forbidden patterns", () => {
    const code = `
function add(a, b) {
  return a + b;
}
const result = add(1, 2);
console.log(result);
`.trim();

    const violations = scanFileContent("clean.js", code);
    expect(violations).toEqual([]);
  });

  it("detects eval() usage", () => {
    const code = `const result = eval("1 + 1");`;
    const violations = scanFileContent("evil.js", code);
    expect(violations.length).toBeGreaterThan(0);
    const patterns = violations.map((v) => v.pattern);
    expect(patterns.some((p) => /eval/i.test(p))).toBe(true);
  });

  it("includes the correct file name, line number, and snippet in the violation", () => {
    const code = `// first line\nconst x = eval("bad");`;
    const violations = scanFileContent("test-file.js", code);
    expect(violations.length).toBeGreaterThan(0);
    const v = violations[0];
    expect(v.file).toBe("test-file.js");
    expect(v.line).toBe(2);
    expect(v.snippet).toContain("eval");
  });

  it("detects new Function() usage", () => {
    const code = `const fn = new Function("return 1");`;
    const violations = scanFileContent("fn.js", code);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /Function/i.test(v.pattern))).toBe(true);
  });

  it("detects dynamic import() usage", () => {
    const code = `const mod = await import("some-module");`;
    const violations = scanFileContent("dyn.js", code);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /import/i.test(v.pattern))).toBe(true);
  });

  it("detects document.cookie access", () => {
    const code = `const cookies = document.cookie;`;
    const violations = scanFileContent("cookies.js", code);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /document\.cookie/i.test(v.pattern))).toBe(true);
  });

  it("detects top.location usage", () => {
    const code = `top.location.href = "https://evil.com";`;
    const violations = scanFileContent("redirect.js", code);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /top\.location/i.test(v.pattern))).toBe(true);
  });

  it("detects parent.location usage", () => {
    const code = `parent.location = "https://evil.com";`;
    const violations = scanFileContent("redirect2.js", code);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /parent\.location/i.test(v.pattern))).toBe(true);
  });

  it("detects window.open() usage", () => {
    const code = `window.open("https://ads.example.com");`;
    const violations = scanFileContent("popup.js", code);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /window\.open/i.test(v.pattern))).toBe(true);
  });

  it("detects setTimeout with a string argument", () => {
    const code = `setTimeout("alert(1)", 1000);`;
    const violations = scanFileContent("timer.js", code);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /setTimeout/i.test(v.pattern))).toBe(true);
  });

  it("detects setInterval with a string argument", () => {
    const code = `setInterval("doEvil()", 500);`;
    const violations = scanFileContent("interval.js", code);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /setInterval/i.test(v.pattern))).toBe(true);
  });

  it("can detect multiple violations in a single file", () => {
    const code = `eval("bad");\ndocument.cookie = "x=1";`;
    const violations = scanFileContent("multi.js", code);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });
});

describe("isScannable", () => {
  it("returns true for .js files", () => {
    expect(isScannable("index.js")).toBe(true);
  });

  it("returns true for .ts files", () => {
    expect(isScannable("utils.ts")).toBe(true);
  });

  it("returns true for .tsx files", () => {
    expect(isScannable("Component.tsx")).toBe(true);
  });

  it("returns true for .mjs files", () => {
    expect(isScannable("module.mjs")).toBe(true);
  });

  it("returns true for .cjs files", () => {
    expect(isScannable("legacy.cjs")).toBe(true);
  });

  it("returns false for .css files", () => {
    expect(isScannable("styles.css")).toBe(false);
  });

  it("returns false for .json files", () => {
    expect(isScannable("config.json")).toBe(false);
  });

  it("returns false for .md files", () => {
    expect(isScannable("README.md")).toBe(false);
  });

  it("returns false for .png files", () => {
    expect(isScannable("image.png")).toBe(false);
  });
});
