/**
 * Client-side image compression using Canvas API.
 * Resizes and re-encodes images before upload to reduce file size.
 */

interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
};

export async function compressImage(
  file: File,
  options?: CompressOptions,
): Promise<File> {
  try {
    // Not an image — return as-is
    if (!file.type.startsWith("image/")) return file;

    // GIF — skip (would break animation)
    if (file.type === "image/gif") return file;

    const opts = { ...DEFAULTS, ...options };

    const bitmap = await createImageBitmap(file);
    const { width: origW, height: origH } = bitmap;

    // Calculate target dimensions (scale down if exceeds max)
    let targetW = origW;
    let targetH = origH;
    if (targetW > opts.maxWidth || targetH > opts.maxHeight) {
      const ratio = Math.min(opts.maxWidth / targetW, opts.maxHeight / targetH);
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    // PNG stays PNG (preserves transparency), everything else → JPEG
    const isPng = file.type === "image/png";
    const outputType = isPng ? "image/png" : "image/jpeg";

    // Draw to canvas
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(targetW, targetH)
        : (() => {
            const c = document.createElement("canvas");
            c.width = targetW;
            c.height = targetH;
            return c;
          })();

    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    // Export
    const blob = await (canvas instanceof OffscreenCanvas
      ? canvas.convertToBlob({ type: outputType, quality: isPng ? undefined : opts.quality })
      : new Promise<Blob | null>((resolve) =>
          (canvas as HTMLCanvasElement).toBlob(resolve, outputType, isPng ? undefined : opts.quality),
        ));

    if (!blob) return file;

    // If compressed is larger than original, return original
    if (blob.size >= file.size) return file;

    // Preserve original filename, update extension if type changed
    let outName = file.name;
    if (!isPng && !outName.toLowerCase().endsWith(".jpg") && !outName.toLowerCase().endsWith(".jpeg")) {
      const dot = outName.lastIndexOf(".");
      outName = (dot > 0 ? outName.slice(0, dot) : outName) + ".jpg";
    }

    return new File([blob], outName, { type: outputType, lastModified: Date.now() });
  } catch {
    // Any failure → return original file so upload is never blocked
    return file;
  }
}
