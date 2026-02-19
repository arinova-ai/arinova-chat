"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  isLoggedIn,
  startLogin,
  handleOAuthCallback,
  fetchAgents,
  fetchBalance,
  getUser,
  clearAuth,
} from "@/lib/arinova";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [user, setUser] = useState<{ name: string } | null>(null);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      handleOAuthCallback(code).then((success) => {
        if (success) {
          setLoggedIn(true);
          // Clean URL
          window.history.replaceState({}, "", "/");
        }
        setLoading(false);
      });
    } else {
      setLoggedIn(isLoggedIn());
      setLoading(false);
    }
  }, [searchParams]);

  // Fetch agents and balance when logged in
  useEffect(() => {
    if (!loggedIn) return;
    setUser(getUser());
    fetchAgents().then(setAgents);
    fetchBalance().then(setBalance);
  }, [loggedIn]);

  const handleStartGame = () => {
    if (!selectedAgent) return;
    if (balance < 10) return; // insufficient balance
    // Store selected agent in sessionStorage for game page
    sessionStorage.setItem("tetris_agent_id", selectedAgent);
    router.push("/game");
  };

  const handleLogout = () => {
    clearAuth();
    setLoggedIn(false);
    setAgents([]);
    setSelectedAgent(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      {/* Title */}
      <div className="text-center">
        <h1 className="mb-2 text-5xl font-black tracking-tight">
          TETRIS <span className="text-cyan-400">BATTLE</span>
        </h1>
        <p className="text-neutral-400">Challenge your AI Agent to a Tetris duel</p>
      </div>

      {!loggedIn ? (
        /* Login */
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={startLogin}
            className="rounded-lg bg-white px-8 py-3 font-semibold text-black transition-colors hover:bg-neutral-200"
          >
            Login with Arinova
          </button>
          <p className="text-xs text-neutral-500">
            Connect your Arinova account to play
          </p>
        </div>
      ) : (
        /* Game setup */
        <div className="w-full max-w-md space-y-6">
          {/* User info */}
          <div className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 p-4">
            <div>
              <p className="font-semibold">{user?.name ?? "Player"}</p>
              <p className="text-sm text-neutral-400">
                Balance: <span className="font-mono text-yellow-400">{balance} coins</span>
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              Logout
            </button>
          </div>

          {/* Agent selection */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Choose your opponent
            </h2>
            {agents.length === 0 ? (
              <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-6 text-center text-neutral-400">
                <p>No agents found.</p>
                <p className="mt-1 text-xs">Add an AI agent in Arinova Chat first.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selectedAgent === agent.id
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-neutral-700 bg-neutral-900 hover:border-neutral-600"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg">
                      {agent.avatarUrl ? (
                        <img src={agent.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        "🤖"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{agent.name}</p>
                      {agent.description && (
                        <p className="truncate text-xs text-neutral-400">{agent.description}</p>
                      )}
                    </div>
                    {selectedAgent === agent.id && (
                      <div className="shrink-0 text-cyan-400">✓</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Entry fee notice */}
          <div className="rounded-lg bg-neutral-900 p-3 text-center text-sm text-neutral-400">
            Entry fee: <span className="font-mono font-semibold text-yellow-400">10 coins</span>
            {" · "}
            Winner gets: <span className="font-mono font-semibold text-green-400">20 coins</span>
          </div>

          {/* Start button */}
          <button
            onClick={handleStartGame}
            disabled={!selectedAgent || balance < 10}
            className="w-full rounded-lg bg-cyan-500 px-8 py-4 text-lg font-bold text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {balance < 10 ? "Insufficient Balance" : "Start Battle"}
          </button>

          {/* Controls hint */}
          <div className="text-center text-xs text-neutral-500">
            <p>Arrow keys to move · ↑ to rotate · Space to hard drop · C to hold · Esc to pause</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-neutral-600">
        Powered by Arinova Game Platform
      </div>
    </div>
  );
}
