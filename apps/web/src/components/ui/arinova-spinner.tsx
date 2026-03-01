"use client";

const SIZE_MAP = {
  sm: "h-8 w-8",
  md: "h-16 w-16",
  lg: "h-32 w-32",
} as const;

export function ArinovaSpinner({
  size = "md",
  message,
}: {
  size?: "sm" | "md" | "lg";
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {/* Placeholder — will be replaced with Arinova mascot running animation */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/branding/arinova-logo-128.png"
        alt="Loading"
        className={`${SIZE_MAP[size]} animate-bounce`}
      />
      {message && (
        <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
      )}
    </div>
  );
}
