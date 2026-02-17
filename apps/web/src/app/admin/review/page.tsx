"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Loader2,
  Shield,
  CheckCircle,
  XCircle,
  Globe,
  Package,
  User,
  Clock,
} from "lucide-react";

interface ReviewApp {
  id: string;
  appId: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  status: string;
  createdAt: string;
  version: {
    id: string;
    version: string;
    manifestJson: {
      permissions?: string[];
      network?: { allowed?: string[] };
      [key: string]: unknown;
    };
    reviewNotes: string | null;
    createdAt: string;
  };
  developer: {
    id: string;
    displayName: string;
    contactEmail: string;
  };
}

function AdminReviewContent() {
  const [apps, setApps] = useState<ReviewApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Dialog state
  const [actionApp, setActionApp] = useState<ReviewApp | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Expanded app detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ apps: ReviewApp[] }>("/api/admin/review/apps");
      setApps(data.apps);
    } catch {
      setError("Failed to load review queue. You may not have admin access.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const handleAction = async () => {
    if (!actionApp || !actionType) return;
    if (actionType === "reject" && !notes.trim()) return;

    setActionLoading(true);
    try {
      await api(`/api/admin/review/apps/${actionApp.id}/${actionType}`, {
        method: "POST",
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      setApps((prev) => prev.filter((a) => a.id !== actionApp.id));
      closeDialog();
    } catch {
      // api() auto-toasts errors
    } finally {
      setActionLoading(false);
    }
  };

  const openDialog = (app: ReviewApp, type: "approve" | "reject") => {
    setActionApp(app);
    setActionType(type);
    setNotes("");
  };

  const closeDialog = () => {
    setActionApp(null);
    setActionType(null);
    setNotes("");
  };

  return (
    <div className="app-dvh overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl px-4 pb-[max(2rem,env(safe-area-inset-bottom,2rem))] pt-[max(1.25rem,env(safe-area-inset-top,1.25rem))]">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Shield className="h-6 w-6 text-orange-400" />
          <h1 className="text-2xl font-bold">App Review Queue</h1>
          <span className="ml-auto rounded-full bg-orange-500/20 px-3 py-1 text-sm font-medium text-orange-400">
            {apps.length} pending
          </span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && apps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <CheckCircle className="mb-4 h-12 w-12" />
            <p className="text-lg font-medium">All clear</p>
            <p className="text-sm">No apps pending review.</p>
          </div>
        )}

        {/* App list */}
        <div className="space-y-4">
          {apps.map((app) => (
            <div
              key={app.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              {/* Summary row */}
              <button
                type="button"
                className="w-full p-4 text-left hover:bg-accent/30 transition-colors"
                onClick={() =>
                  setExpandedId(expandedId === app.id ? null : app.id)
                }
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-2xl">
                    {app.icon || <Package className="h-6 w-6 text-muted-foreground" />}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{app.name}</h3>
                      <span className="shrink-0 rounded bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
                        Tier 2
                      </span>
                      <span className="shrink-0 rounded bg-neutral-700 px-2 py-0.5 text-xs text-muted-foreground">
                        v{app.version.version}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground truncate">
                      {app.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {app.developer.displayName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(app.version.createdAt).toLocaleDateString()}
                      </span>
                      <span className="rounded bg-neutral-700 px-1.5 py-0.5">
                        {app.category}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded detail */}
              {expandedId === app.id && (
                <div className="border-t border-border p-4 space-y-4">
                  {/* Network whitelist — the key review item for Tier 2 */}
                  {app.version.manifestJson.network?.allowed &&
                    app.version.manifestJson.network.allowed.length > 0 && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-400">
                          <Globe className="h-4 w-4" />
                          Network Whitelist (requires review)
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {app.version.manifestJson.network.allowed.map(
                            (domain) => (
                              <span
                                key={domain}
                                className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-sm font-mono text-orange-300"
                              >
                                {domain}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                  {/* Permissions */}
                  {app.version.manifestJson.permissions &&
                    app.version.manifestJson.permissions.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                          Permissions
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {app.version.manifestJson.permissions.map((perm) => (
                            <span
                              key={perm}
                              className="rounded-md bg-neutral-700 px-2.5 py-1 text-sm"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Developer contact */}
                  <div>
                    <h4 className="mb-1 text-sm font-semibold text-muted-foreground">
                      Developer Contact
                    </h4>
                    <p className="text-sm">
                      {app.developer.displayName} &mdash;{" "}
                      <a
                        href={`mailto:${app.developer.contactEmail}`}
                        className="text-blue-400 hover:underline"
                      >
                        {app.developer.contactEmail}
                      </a>
                    </p>
                  </div>

                  {/* Manifest preview */}
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">
                      Full Manifest
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-neutral-900 p-3 text-xs">
                      {JSON.stringify(app.version.manifestJson, null, 2)}
                    </pre>
                  </details>

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-2">
                    <Button
                      className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => openDialog(app, "approve")}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve & Publish
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      onClick={() => openDialog(app, "reject")}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Approve / Reject Dialog */}
      <Dialog open={!!actionApp} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve App" : "Reject App"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? `"${actionApp?.name}" will be published to the marketplace.`
                : `"${actionApp?.name}" will be rejected. A reason is required.`}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder={
              actionType === "approve"
                ? "Optional approval notes..."
                : "Rejection reason (required)..."
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="bg-neutral-800 border-none"
          />

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className={
                actionType === "approve"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : ""
              }
              variant={actionType === "reject" ? "destructive" : "default"}
              disabled={
                actionLoading ||
                (actionType === "reject" && !notes.trim())
              }
              onClick={handleAction}
            >
              {actionLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {actionType === "approve" ? "Approve & Publish" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminReviewPage() {
  return (
    <AuthGuard>
      <AdminReviewContent />
    </AuthGuard>
  );
}
