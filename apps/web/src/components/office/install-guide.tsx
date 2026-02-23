"use client";

import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";

const INSTALL_STEPS = [
  {
    title: "Install the plugin package",
    code: "pnpm add @arinova-ai/openclaw-office-plugin",
  },
  {
    title: "Register the plugin in your OpenClaw config",
    code: `// openclaw.config.ts
import officePlugin from "@arinova-ai/openclaw-office-plugin";

export default {
  plugins: [officePlugin],
};`,
  },
  {
    title: "Restart the OpenClaw server",
    code: "pnpm dev",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded p-1.5 text-slate-400 hover:bg-slate-600 hover:text-white"
      aria-label="Copy"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

interface Props {
  state: "loading" | "connected" | "disconnected" | "error";
  onRetry: () => void;
}

export function OfficeInstallGuide({ state, onRetry }: Props) {
  return (
    <div className="space-y-6">
      {/* Status indicator */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
        {state === "loading" && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Checking plugin status...
            </span>
          </>
        )}
        {state === "disconnected" && (
          <>
            <XCircle className="h-5 w-5 text-yellow-500" />
            <span className="text-sm text-yellow-200">
              Virtual Office plugin is not connected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="ml-auto gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Re-check
            </Button>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm text-red-200">
              Unable to reach the server
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="ml-auto gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </>
        )}
        {state === "connected" && (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm text-green-200">
              Plugin connected
            </span>
          </>
        )}
      </div>

      {/* Install guide — shown when not connected */}
      {(state === "disconnected" || state === "error") && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Setup Guide</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Install the Virtual Office plugin to see your team&apos;s
              real-time status. Follow these steps to get started:
            </p>
          </div>

          <ol className="space-y-4">
            {INSTALL_STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-medium">{step.title}</p>
                  <div className="relative rounded-lg bg-slate-900 p-3 pr-10">
                    <pre className="overflow-x-auto text-xs text-slate-300">
                      <code>{step.code}</code>
                    </pre>
                    <CopyButton text={step.code} />
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-2 rounded-lg border border-blue-900/50 bg-blue-950/30 p-3">
            <Circle className="h-4 w-4 shrink-0 text-blue-400" />
            <p className="text-xs text-blue-200">
              After completing the setup, click{" "}
              <strong>Re-check</strong> above to verify the connection.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
