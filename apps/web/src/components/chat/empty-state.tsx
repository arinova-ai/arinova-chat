import { MessageSquare } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <MessageSquare className="h-16 w-16 opacity-30" />
      <div className="text-center">
        <h2 className="text-lg font-medium">{t("chat.emptyState.title")}</h2>
        <p className="mt-1 text-sm">
          {t("chat.emptyState.description")}
        </p>
      </div>
    </div>
  );
}
