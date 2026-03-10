import { useToastStore } from "@/store/toast-store";

export async function shareExternal(opts: {
  title: string;
  text: string;
  url?: string;
}): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(opts);
    } catch {
      // User cancelled or share failed — ignore
    }
  } else {
    await navigator.clipboard.writeText(opts.url || opts.text);
    useToastStore.getState().addToast("Copied to clipboard", "success");
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  useToastStore.getState().addToast("Copied to clipboard", "success");
}
