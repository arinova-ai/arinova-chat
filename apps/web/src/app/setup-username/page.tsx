"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, AtSign } from "lucide-react";

const USERNAME_REGEX = /^[a-z][a-z0-9_]*$/;
const NO_CONSECUTIVE_UNDERSCORES = /_{2,}/;

function validateFormat(value: string): string | null {
  if (value.length < 3) return "Must be at least 3 characters";
  if (value.length > 32) return "Must be at most 32 characters";
  if (!/^[a-z]/.test(value)) return "Must start with a letter";
  if (!USERNAME_REGEX.test(value))
    return "Only lowercase letters, numbers, and underscores";
  if (NO_CONSECUTIVE_UNDERSCORES.test(value))
    return "No consecutive underscores";
  return null;
}

export default function SetupUsernamePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [username, setUsername] = useState("");
  const [formatError, setFormatError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [isPending, session, router]);

  // Redirect to home if user already has a username
  useEffect(() => {
    if (session?.user && (session.user as Record<string, unknown>).username) {
      router.push("/");
    }
  }, [session, router]);

  const checkAvailability = useCallback(async (value: string) => {
    setChecking(true);
    try {
      const result = await api<{ available: boolean }>(
        `/api/users/username/check?username=${encodeURIComponent(value)}`
      );
      setAvailable(result.available);
    } catch {
      setAvailable(null);
    } finally {
      setChecking(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setUsername(value);
    setSubmitError("");
    setAvailable(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!value) {
      setFormatError(null);
      setChecking(false);
      return;
    }

    const error = validateFormat(value);
    setFormatError(error);

    if (!error) {
      setChecking(true);
      debounceRef.current = setTimeout(() => {
        checkAvailability(value);
      }, 300);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    const error = validateFormat(username);
    if (error || !available) return;

    setSubmitting(true);
    try {
      await api("/api/users/username", {
        method: "POST",
        body: JSON.stringify({ username }),
      });
      // Full reload to refresh the session cache (useSession has stale data)
      window.location.href = "/";
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("An unexpected error occurred");
      }
      setSubmitting(false);
    }
  };

  const isValid = !formatError && available === true && username.length >= 3;

  // Show loading while checking auth
  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/20">
            <AtSign className="h-7 w-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold">Choose Your Username</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This will be your unique identifier. It cannot be changed later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                @
              </span>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={handleChange}
                placeholder="your_username"
                maxLength={32}
                autoComplete="off"
                autoFocus
                className="bg-neutral-800 border-none pl-8 pr-10"
              />
              {username && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : isValid ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : formatError || available === false ? (
                    <X className="h-4 w-4 text-destructive" />
                  ) : null}
                </div>
              )}
            </div>

            {/* Validation feedback */}
            {username && (
              <p
                className={`text-xs ${
                  formatError || available === false
                    ? "text-destructive"
                    : isValid
                      ? "text-green-400"
                      : "text-muted-foreground"
                }`}
              >
                {formatError
                  ? formatError
                  : available === false
                    ? "Username is already taken"
                    : isValid
                      ? "Username is available"
                      : checking
                        ? "Checking availability..."
                        : ""}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            3-32 characters. Lowercase letters, numbers, and underscores only.
            Must start with a letter.
          </p>

          <Button
            type="submit"
            className="w-full"
            disabled={!isValid || submitting}
          >
            {submitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Set Username
          </Button>
        </form>
      </div>
    </div>
  );
}
