import vm from "node:vm";

export interface ExecutionResult {
  output: string;
  error: string | null;
  executionTimeMs: number;
}

const TIMEOUT_MS = 5000;
const MAX_OUTPUT_LENGTH = 50000;

/**
 * Execute JavaScript code in a sandboxed vm context.
 * No access to fs, net, process, require, or any Node.js APIs.
 * console.log output is captured and returned.
 */
export function executeJavaScript(code: string): ExecutionResult {
  const outputLines: string[] = [];
  let totalLength = 0;

  const pushOutput = (...args: unknown[]) => {
    const line = args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a, null, 2);
        } catch {
          return String(a);
        }
      })
      .join(" ");

    totalLength += line.length;
    if (totalLength <= MAX_OUTPUT_LENGTH) {
      outputLines.push(line);
    }
  };

  // Minimal sandbox context - no Node.js globals
  const sandbox: Record<string, unknown> = {
    console: {
      log: pushOutput,
      info: pushOutput,
      warn: pushOutput,
      error: pushOutput,
      debug: pushOutput,
    },
    // Basic JS globals that are safe
    Math,
    Date,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Symbol,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    URIError,
    // Explicitly blocked (set to undefined)
    require: undefined,
    process: undefined,
    global: undefined,
    globalThis: undefined,
    Buffer: undefined,
    __dirname: undefined,
    __filename: undefined,
    module: undefined,
    exports: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    fetch: undefined,
    XMLHttpRequest: undefined,
  };

  const context = vm.createContext(sandbox, {
    codeGeneration: {
      strings: false, // Disable eval() and new Function() from strings
      wasm: false,
    },
  });

  const startTime = performance.now();

  try {
    const script = new vm.Script(code, {
      filename: "sandbox.js",
    });

    const result = script.runInContext(context, {
      timeout: TIMEOUT_MS,
      breakOnSigint: true,
    });

    const executionTimeMs = Math.round(performance.now() - startTime);

    // If the last expression has a value and nothing was logged, show the result
    if (outputLines.length === 0 && result !== undefined) {
      pushOutput(result);
    }

    return {
      output: outputLines.join("\n"),
      error: null,
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    const errorMessage =
      err instanceof Error ? err.message : String(err);

    return {
      output: outputLines.join("\n"),
      error: errorMessage,
      executionTimeMs,
    };
  }
}
