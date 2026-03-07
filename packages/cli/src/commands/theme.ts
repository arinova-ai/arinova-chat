import { Command } from "commander";
import { get, del, patch, uploadMultipart } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

export function registerTheme(program: Command): void {
  const theme = program.command("theme").description("Theme management");

  theme
    .command("list")
    .description("List your themes")
    .action(async () => {
      try {
        const data = await get("/api/creator/themes");
        const themes = (data as Record<string, unknown>).themes ?? data;
        if (Array.isArray(themes)) {
          table(themes as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "name", label: "Name" },
            { key: "renderer", label: "Renderer" },
            { key: "price", label: "Price" },
            { key: "status", label: "Status" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("upload <manifestFile> [bundleFile]")
    .description("Upload a theme (manifest JSON + optional zip bundle)")
    .action(async (manifestFile: string, bundleFile?: string) => {
      try {
        if (!existsSync(manifestFile)) { printError(new Error(`File not found: ${manifestFile}`)); return; }
        if (bundleFile && !existsSync(bundleFile)) { printError(new Error(`File not found: ${bundleFile}`)); return; }
        const manifestData = readFileSync(manifestFile);
        const fields: Record<string, string | Blob> = {
          manifest: new Blob([manifestData], { type: "application/json" }),
        };
        if (bundleFile) {
          const bundleData = readFileSync(bundleFile);
          fields.bundle = new Blob([bundleData], { type: "application/zip" });
        }
        const data = await uploadMultipart("/api/themes/upload", fields);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("update <id> <manifestFile> [bundleFile]")
    .description("Update a theme")
    .action(async (id: string, manifestFile: string, bundleFile?: string) => {
      try {
        if (!existsSync(manifestFile)) { printError(new Error(`File not found: ${manifestFile}`)); return; }
        if (bundleFile && !existsSync(bundleFile)) { printError(new Error(`File not found: ${bundleFile}`)); return; }
        const manifestData = readFileSync(manifestFile);
        const fields: Record<string, string | Blob> = {
          manifest: new Blob([manifestData], { type: "application/json" }),
        };
        if (bundleFile) {
          const bundleData = readFileSync(bundleFile);
          fields.bundle = new Blob([bundleData], { type: "application/zip" });
        }
        const data = await uploadMultipart(`/api/themes/${id}`, fields, "PUT");
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("delete <id>")
    .description("Delete a theme")
    .action(async (id: string) => {
      try {
        await del(`/api/themes/${id}`);
        printSuccess(`Theme ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("publish <id>")
    .description("Publish a theme")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/themes/${id}/status`, { status: "published" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("unpublish <id>")
    .description("Unpublish a theme")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/themes/${id}/status`, { status: "draft" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
