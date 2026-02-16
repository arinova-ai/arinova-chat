"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Code, Coins, Upload, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Developer {
  id: string;
  displayName: string;
  contactEmail: string;
  payoutInfo: string | null;
  createdAt: string;
}

interface DeveloperProfile {
  developer: Developer;
}

interface App {
  id: string;
  appId: string;
  name: string;
  category: string;
  status: "draft" | "submitted" | "scanning" | "in_review" | "published" | "rejected" | "suspended";
  createdAt: string;
}

interface AppsResponse {
  apps: App[];
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: string;
}

interface EarningsResponse {
  totalEarnings: number;
  transactions: Transaction[];
}

function DeveloperContent() {
  const [loading, setLoading] = useState(true);
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [earnings, setEarnings] = useState<Transaction[]>([]);

  // Registration form state
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [payoutInfo, setPayoutInfo] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState("");

  // Submit app dialog state
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitResult, setSubmitResult] = useState<{
    app: { name: string; status: string };
    version: { version: string; status: string };
    permissionTier: number;
    requiresReview: boolean;
  } | null>(null);

  const loadDeveloperProfile = useCallback(async () => {
    try {
      const data = await api<DeveloperProfile>("/api/developer/profile");
      setDeveloper(data.developer);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setDeveloper(null);
        return false;
      }
      return false;
    }
  }, []);

  const loadApps = useCallback(async () => {
    try {
      const data = await api<AppsResponse>("/api/developer/apps");
      setApps(data.apps);
    } catch {
      // ignore
    }
  }, []);

  const loadEarnings = useCallback(async () => {
    try {
      const data = await api<EarningsResponse>("/api/developer/earnings");
      setTotalEarnings(data.totalEarnings);
      setEarnings(data.transactions);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const isDeveloper = await loadDeveloperProfile();
      if (isDeveloper) {
        await Promise.all([loadApps(), loadEarnings()]);
      }
      setLoading(false);
    };
    loadData();
  }, [loadDeveloperProfile, loadApps, loadEarnings]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError("");

    if (!acceptTerms) {
      setRegisterError("Please accept the developer terms");
      return;
    }

    setRegisterLoading(true);
    try {
      const data = await api<DeveloperProfile>("/api/developer/register", {
        method: "POST",
        body: JSON.stringify({
          displayName: displayName.trim(),
          contactEmail: contactEmail.trim(),
          payoutInfo: payoutInfo.trim() || undefined,
        }),
      });
      setDeveloper(data.developer);
      await Promise.all([loadApps(), loadEarnings()]);
    } catch (err) {
      if (err instanceof ApiError) {
        setRegisterError(err.message);
      } else {
        setRegisterError("Failed to register as developer");
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  const getStatusBadge = (status: App["status"]) => {
    const variants = {
      draft: "bg-neutral-500/10 text-neutral-400",
      submitted: "bg-yellow-500/10 text-yellow-400",
      scanning: "bg-yellow-500/10 text-yellow-400",
      in_review: "bg-orange-500/10 text-orange-400",
      published: "bg-green-500/10 text-green-400",
      rejected: "bg-red-500/10 text-red-400",
      suspended: "bg-red-500/10 text-red-400",
    };

    const labels = {
      draft: "Draft",
      submitted: "Submitted",
      scanning: "Scanning",
      in_review: "In Review",
      published: "Published",
      rejected: "Rejected",
      suspended: "Suspended",
    };

    return (
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", variants[status])}>
        {labels[status]}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Registration form
  if (!developer) {
    return (
      <div className="min-h-dvh bg-background">
        {/* Header */}
        <div className="border-b border-border">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Developer Registration</h1>
          </div>
        </div>

        <div className="mx-auto max-w-lg px-4 py-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600">
              <Code className="h-8 w-8 text-white" />
            </div>
            <h2 className="mb-2 text-2xl font-bold">Become a Developer</h2>
            <p className="text-muted-foreground">
              Create and monetize apps in the Arinova ecosystem
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
            {registerError && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {registerError}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium">
                Display Name
              </label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name or company name"
                required
                className="bg-neutral-800 border-none"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="contactEmail" className="text-sm font-medium">
                Contact Email
              </label>
              <Input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="developer@example.com"
                required
                className="bg-neutral-800 border-none"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="payoutInfo" className="text-sm font-medium">
                Payout Information (Optional)
              </label>
              <Input
                id="payoutInfo"
                type="text"
                value={payoutInfo}
                onChange={(e) => setPayoutInfo(e.target.value)}
                placeholder="PayPal email, bank details, etc."
                className="bg-neutral-800 border-none"
              />
              <p className="text-xs text-muted-foreground">
                Required for receiving earnings. You can add this later.
              </p>
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="acceptTerms"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="acceptTerms" className="text-sm text-muted-foreground">
                I accept the developer terms and conditions, including the revenue sharing model and app guidelines.
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={registerLoading}>
              {registerLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Register as Developer
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Developer dashboard
  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Developer Dashboard</h1>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Developer info card */}
        <div className="mb-6 rounded-xl border border-border bg-card p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600">
                <Code className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{developer.displayName}</h2>
                <p className="text-sm text-muted-foreground">{developer.contactEmail}</p>
                <p className="text-xs text-muted-foreground">
                  Registered {formatDate(developer.createdAt)}
                </p>
              </div>
            </div>
            <Link href="/wallet">
              <Button variant="outline" size="sm" className="gap-2">
                <Coins className="h-4 w-4" />
                View Wallet
              </Button>
            </Link>
          </div>
        </div>

        {/* Earnings card */}
        <div className="mb-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Total Earnings</h2>
            <Coins className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="mb-4 flex items-center gap-2">
            <Coins className="h-8 w-8 text-yellow-400" />
            <span className="text-4xl font-bold">{totalEarnings}</span>
          </div>
          {earnings.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground">Recent Earnings</p>
              {earnings.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tx.description}</span>
                  <span className="font-medium text-green-400">+{tx.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Apps section */}
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Your Apps</h2>
            <Button onClick={() => setSubmitDialogOpen(true)} className="gap-2">
              <Upload className="h-4 w-4" />
              Submit App
            </Button>
          </div>

          {apps.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-12 text-center">
              <Code className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                You haven't submitted any apps yet.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Submit your first app to start monetizing.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="rounded-xl border border-border bg-card p-4 hover:bg-neutral-800/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="font-semibold">{app.name}</h3>
                        {getStatusBadge(app.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        App ID: {app.appId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Category: {app.category} • Submitted {formatDate(app.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Submit app dialog */}
      <Dialog
        open={submitDialogOpen}
        onOpenChange={(open) => {
          setSubmitDialogOpen(open);
          if (!open) {
            setSubmitFile(null);
            setSubmitError("");
            setSubmitResult(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit App</DialogTitle>
            <DialogDescription>
              Upload your app package (.zip) for review
            </DialogDescription>
          </DialogHeader>

          {submitResult ? (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
                <p className="mt-3 font-semibold">{submitResult.app.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  v{submitResult.version.version}
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  {getStatusBadge(submitResult.app.status as App["status"])}
                  <span className="text-xs text-muted-foreground">
                    Tier {submitResult.permissionTier}
                  </span>
                </div>
                {submitResult.requiresReview && (
                  <p className="mt-3 text-xs text-yellow-400">
                    This app requires manual review before publishing.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setSubmitDialogOpen(false);
                    setSubmitResult(null);
                    setSubmitFile(null);
                    loadApps();
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!submitFile) return;
                setSubmitLoading(true);
                setSubmitError("");
                try {
                  const formData = new FormData();
                  formData.append("file", submitFile);
                  const result = await api<{
                    app: { name: string; status: string };
                    version: { version: string; status: string };
                    permissionTier: number;
                    requiresReview: boolean;
                  }>("/api/apps/submit", {
                    method: "POST",
                    body: formData,
                  });
                  setSubmitResult(result);
                } catch (err) {
                  if (err instanceof ApiError) {
                    setSubmitError(err.message);
                  } else {
                    setSubmitError("Upload failed");
                  }
                } finally {
                  setSubmitLoading(false);
                }
              }}
            >
              <div className="space-y-4 py-4">
                {submitError && (
                  <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {submitError}
                  </div>
                )}

                <label
                  htmlFor="app-zip"
                  className={cn(
                    "flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed p-8 transition-colors",
                    submitFile
                      ? "border-blue-500/50 bg-blue-500/5"
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  {submitFile ? (
                    <div className="mt-3 text-center">
                      <p className="text-sm font-medium">{submitFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(submitFile.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 text-center">
                      <p className="text-sm font-medium">Choose a .zip file</p>
                      <p className="text-xs text-muted-foreground">
                        Must contain manifest.json · Max 50MB
                      </p>
                    </div>
                  )}
                  <input
                    id="app-zip"
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(e) => setSubmitFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setSubmitDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!submitFile || submitLoading}>
                  {submitLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload & Submit
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DeveloperPage() {
  return (
    <AuthGuard>
      <DeveloperContent />
    </AuthGuard>
  );
}
