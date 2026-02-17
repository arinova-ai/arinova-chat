import { readFile, access } from "node:fs/promises";
import { basename, resolve, isAbsolute } from "node:path";

const CATBOX_URL = "https://catbox.moe/user/api.php";
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp)$/i;

/**
 * Match image file paths in text.
 * Handles absolute (/Users/.../foo.png) and relative (imagen/foo.png) paths.
 */
const PATH_RE = /(?:(?:\/[\w.@~ -]+)+|(?:[\w.-]+\/)+[\w.-]+)\.(?:png|jpe?g|gif|webp)\b/gi;

async function uploadToCatbox(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath);
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", new Blob([data]), basename(filePath));

    const res = await fetch(CATBOX_URL, { method: "POST", body: form });
    if (!res.ok) return null;

    const url = (await res.text()).trim();
    return url.startsWith("https://") ? url : null;
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan text for local image file paths, upload each to catbox.moe,
 * and replace the path with the public URL.
 */
export async function replaceImagePaths(
  text: string,
  workDir: string,
  log?: (msg: string) => void,
): Promise<string> {
  const matches = text.match(PATH_RE);
  if (!matches) return text;

  const unique = [...new Set(matches)];

  const results = await Promise.all(
    unique.map(async (rawPath) => {
      const absPath = isAbsolute(rawPath) ? rawPath : resolve(workDir, rawPath);
      if (!IMAGE_EXT.test(absPath) || !(await fileExists(absPath))) return null;

      log?.(`image-upload: uploading ${absPath}`);
      const url = await uploadToCatbox(absPath);
      if (url) {
        log?.(`image-upload: → ${url}`);
        return { rawPath, url };
      }
      log?.(`image-upload: failed for ${absPath}`);
      return null;
    }),
  );

  let out = text;
  for (const r of results) {
    if (r) out = out.split(r.rawPath).join(r.url);
  }
  return out;
}
