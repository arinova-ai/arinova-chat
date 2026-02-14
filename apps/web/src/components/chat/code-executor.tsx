"use client";

import { useState, useCallback } from "react";
import { Play, Loader2, X, Clock } from "lucide-react";
import { api } from "@/lib/api";

interface ExecutionResult {
  output: string;
  error: string | null;
  executionTimeMs: number;
}

interface CodeExecutorProps {
  code: string;
  children: React.ReactNode;
}

export function CodeExecutor({ code, children }: CodeExecutorProps) {
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setResult(null);

    try {
      const res = await api<ExecutionResult>("/api/sandbox/execute", {
        method: "POST",
        body: JSON.stringify({ code, language: "javascript" }),
      });
      setResult(res);
    } catch (err) {
      setResult({
        output: "",
        error: err instanceof Error ? err.message : "Execution failed",
        executionTimeMs: 0,
      });
    } finally {
      setIsRunning(false);
    }
  }, [code]);

  const handleClear = useCallback(() => {
    setResult(null);
  }, []);

  return (
    <div className="relative">
      {children}

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={isRunning}
        className="absolute right-10 top-2 flex items-center gap-1 rounded-md bg-green-700 px-2 py-1 text-xs font-medium text-green-100 opacity-0 transition-opacity hover:bg-green-600 group-hover/code:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="Run code"
      >
        {isRunning ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Running</span>
          </>
        ) : (
          <>
            <Play className="h-3 w-3" />
            <span>Run</span>
          </>
        )}
      </button>

      {/* Output panel */}
      {result && (
        <div className="mt-1 rounded-lg border border-neutral-700 bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-400">Output</span>
              {result.executionTimeMs > 0 && (
                <span className="flex items-center gap-1 text-xs text-neutral-500">
                  <Clock className="h-3 w-3" />
                  {result.executionTimeMs}ms
                </span>
              )}
            </div>
            <button
              onClick={handleClear}
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
              title="Clear output"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-64 overflow-auto p-3">
            {result.output && (
              <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-200">
                {result.output}
              </pre>
            )}
            {result.error && (
              <pre className="whitespace-pre-wrap font-mono text-xs text-red-400">
                {result.error}
              </pre>
            )}
            {!result.output && !result.error && (
              <span className="text-xs italic text-neutral-500">
                No output
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
