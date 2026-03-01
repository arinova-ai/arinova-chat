"use client";

const SPRITE_CONFIG = {
  sm: { src: "/assets/spinner/arinova-run-64.png", size: 64, frames: 8 },
  md: { src: "/assets/spinner/arinova-run-128.png", size: 128, frames: 8 },
  lg: { src: "/assets/spinner/arinova-run-128.png", size: 128, frames: 8 },
} as const;

const SIZE_PX = { sm: 32, md: 64, lg: 128 } as const;

export function ArinovaSpinner({
  size = "md",
  message,
}: {
  size?: "sm" | "md" | "lg";
  message?: string;
}) {
  const config = SPRITE_CONFIG[size];
  const displayPx = SIZE_PX[size];
  const sheetWidth = config.size * config.frames;
  const scale = displayPx / config.size;

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        style={{
          width: displayPx,
          height: displayPx,
          overflow: "hidden",
          backgroundImage: `url(${config.src})`,
          backgroundSize: `${sheetWidth * scale}px ${displayPx}px`,
          backgroundRepeat: "no-repeat",
          "--sprite-end": `-${sheetWidth * scale}px`,
          animation: "sprite-run 0.8s steps(8) infinite",
        } as React.CSSProperties}
      />
      {message && (
        <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
      )}
    </div>
  );
}
