import type { Command } from "commander";

export function getOpts(cmd: Command): { token: string; apiUrl: string } {
  const root = cmd.parent ?? cmd;
  while (root.parent) { /* climb to root */ }
  const opts = (cmd as unknown as { parent: Command }).parent?.optsWithGlobals?.() ?? cmd.optsWithGlobals();
  return {
    token: opts.token as string,
    apiUrl: (opts.apiUrl as string) ?? "https://api.chat.arinova.ai",
  };
}

export async function apiCall(opts: {
  method: string;
  url: string;
  token: string;
  body?: unknown;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
  };
  const init: RequestInit = { method: opts.method, headers };

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(opts.url, init);
  const text = await res.text();

  if (!res.ok) {
    console.error(`Error ${res.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
