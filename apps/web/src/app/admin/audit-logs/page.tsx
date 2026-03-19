"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

interface Log { id: string; adminEmail: string; action: string; targetId: string | null; details: unknown; createdAt: string }
interface LogsRes { logs: Log[]; total: number; page: number; limit: number }

export default function AdminAuditLogsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<LogsRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api<LogsRes>(`/api/admin/audit-logs?page=${page}&limit=50`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [page]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">{t("admin.auditLogs.title")}</h2>
      {loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-3 py-2 text-left font-medium">{t("admin.auditLogs.time")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("admin.auditLogs.admin")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("admin.auditLogs.action")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("admin.auditLogs.target")}</th>
              </tr></thead>
              <tbody>{data?.logs.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{l.createdAt}</td>
                  <td className="px-3 py-2">{l.adminEmail}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.targetId ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm py-1">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
