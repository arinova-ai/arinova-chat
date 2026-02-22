import { describe, it, expect } from "vitest";
import { executeJavaScript } from "./executor.js";

describe("executeJavaScript", () => {
  it("evaluates safe arithmetic and returns the result as output", () => {
    const result = executeJavaScript("1 + 1");
    expect(result.error).toBeNull();
    expect(result.output).toBe("2");
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("captures console.log output", () => {
    const result = executeJavaScript(`console.log("hello")`);
    expect(result.error).toBeNull();
    expect(result.output).toContain("hello");
  });

  it("blocks access to require — returns undefined", () => {
    const result = executeJavaScript(`typeof require`);
    expect(result.error).toBeNull();
    expect(result.output).toBe("undefined");
  });

  it("blocks access to process — returns undefined", () => {
    const result = executeJavaScript(`typeof process`);
    expect(result.error).toBeNull();
    expect(result.output).toBe("undefined");
  });

  it("blocks access to fetch — returns undefined", () => {
    const result = executeJavaScript(`typeof fetch`);
    expect(result.error).toBeNull();
    expect(result.output).toBe("undefined");
  });

  it("blocks access to setTimeout — returns undefined", () => {
    const result = executeJavaScript(`typeof setTimeout`);
    expect(result.error).toBeNull();
    expect(result.output).toBe("undefined");
  });

  it("returns an error for an infinite loop (timeout)", () => {
    const result = executeJavaScript(`while(true){}`);
    expect(result.error).not.toBeNull();
    expect(result.error).toMatch(/timeout|time.?out|exceeded|timed out/i);
  });

  it("returns an error when eval is used", () => {
    const result = executeJavaScript(`eval("1+1")`);
    expect(result.error).not.toBeNull();
  });

  it("truncates large console.log output", () => {
    const result = executeJavaScript(`console.log("x".repeat(100000))`);
    expect(result.error).toBeNull();
    // Output must be capped — should not be the full 100 000 character string
    expect(result.output.length).toBeLessThan(100000);
  });
});
