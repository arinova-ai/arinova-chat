import { describe, it, expect } from "vitest";
import { scanFileContent, isScannable } from "./app-scanner";

describe("app-scanner", () => {
  describe("isScannable", () => {
    it("accepts .js files", () => {
      expect(isScannable("app.js")).toBe(true);
    });

    it("accepts .ts files", () => {
      expect(isScannable("app.ts")).toBe(true);
    });

    it("accepts .jsx files", () => {
      expect(isScannable("component.jsx")).toBe(true);
    });

    it("accepts .tsx files", () => {
      expect(isScannable("component.tsx")).toBe(true);
    });

    it("accepts .mjs files", () => {
      expect(isScannable("module.mjs")).toBe(true);
    });

    it("accepts .cjs files", () => {
      expect(isScannable("module.cjs")).toBe(true);
    });

    it("rejects .html files", () => {
      expect(isScannable("index.html")).toBe(false);
    });

    it("rejects .css files", () => {
      expect(isScannable("styles.css")).toBe(false);
    });

    it("rejects .json files", () => {
      expect(isScannable("manifest.json")).toBe(false);
    });

    it("rejects .png files", () => {
      expect(isScannable("icon.png")).toBe(false);
    });

    it("is case insensitive", () => {
      expect(isScannable("app.JS")).toBe(true);
      expect(isScannable("app.Ts")).toBe(true);
    });
  });

  describe("scanFileContent", () => {
    it("returns no violations for clean code", () => {
      const code = `
        const x = 1;
        function hello() { return "world"; }
        setTimeout(() => console.log("hi"), 1000);
        setInterval(() => tick(), 500);
      `;
      const violations = scanFileContent("clean.js", code);
      expect(violations).toHaveLength(0);
    });

    it("detects eval()", () => {
      const code = `const result = eval("1 + 2");`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("eval()");
      expect(violations[0].line).toBe(1);
      expect(violations[0].file).toBe("bad.js");
    });

    it("detects new Function()", () => {
      const code = `const fn = new Function("return 42");`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("new Function()");
    });

    it("detects dynamic import()", () => {
      const code = `const mod = import("./secret-module");`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("import()");
    });

    it("detects document.cookie", () => {
      const code = `const cookies = document.cookie;`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("document.cookie");
    });

    it("detects top.location", () => {
      const code = `top.location = "https://evil.com";`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("top.location");
    });

    it("detects parent.location", () => {
      const code = `parent.location.href = "https://evil.com";`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("parent.location");
    });

    it("detects window.open()", () => {
      const code = `window.open("https://evil.com");`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("window.open()");
    });

    it("detects setTimeout with string argument", () => {
      const code = `setTimeout("alert('xss')", 1000);`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("setTimeout");
    });

    it("detects setInterval with string argument", () => {
      const code = `setInterval("doEvil()", 500);`;
      const violations = scanFileContent("bad.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].pattern).toContain("setInterval");
    });

    it("detects multiple violations in one file", () => {
      const code = `
        eval("bad");
        const fn = new Function("worse");
        document.cookie = "stolen";
      `;
      const violations = scanFileContent("multi.js", code);
      expect(violations).toHaveLength(3);
    });

    it("detects multiple violations on same line", () => {
      const code = `eval("x"); document.cookie;`;
      const violations = scanFileContent("same-line.js", code);
      expect(violations).toHaveLength(2);
    });

    it("reports correct line numbers", () => {
      const code = `const ok = 1;\nconst bad = eval("2");\nconst fine = 3;`;
      const violations = scanFileContent("lines.js", code);
      expect(violations).toHaveLength(1);
      expect(violations[0].line).toBe(2);
    });

    it("truncates long snippets to 120 chars", () => {
      const longLine = `eval(${"a".repeat(200)});`;
      const violations = scanFileContent("long.js", longLine);
      expect(violations).toHaveLength(1);
      expect(violations[0].snippet.length).toBeLessThanOrEqual(120);
    });

    it("allows setTimeout with function argument", () => {
      const code = `setTimeout(() => console.log("ok"), 1000);`;
      const violations = scanFileContent("ok.js", code);
      expect(violations).toHaveLength(0);
    });

    it("allows setInterval with function argument", () => {
      const code = `setInterval(tick, 500);`;
      const violations = scanFileContent("ok.js", code);
      expect(violations).toHaveLength(0);
    });
  });
});
