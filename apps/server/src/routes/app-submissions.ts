import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { apps, appVersions, developerAccounts } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../env.js";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import { appManifestSchema } from "@arinova/shared/schemas";
import { scanFileContent, isScannable } from "../utils/app-scanner.js";
import type { ScanViolation } from "../utils/app-scanner.js";
import { classifyPermissionTier, requiresManualReview } from "../utils/permission-tier.js";

const MAX_APP_PACKAGE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_ASSET_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".json", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp3", ".ogg", ".wav", ".mp4", ".webm",
  ".glb", ".gltf", ".obj", ".fbx",
  ".txt", ".md", ".csv",
  ".wasm",
]);

export async function appSubmissionRoutes(app: FastifyInstance) {
  // Submit a new app package (zip upload)
  app.post("/api/apps/submit", async (request, reply) => {
    const user = await requireAuth(request, reply);

    // Verify developer account
    const [developer] = await db
      .select()
      .from(developerAccounts)
      .where(eq(developerAccounts.userId, user.id));

    if (!developer) {
      return reply.status(403).send({ error: "Developer account required. Please register as a developer first." });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file uploaded" });
    }

    if (data.mimetype !== "application/zip" && data.mimetype !== "application/x-zip-compressed") {
      return reply.status(400).send({ error: "Only .zip files are accepted" });
    }

    // Read file buffer
    const buffer = await data.toBuffer();

    // Task 3.3: Enforce 50MB size limit
    if (buffer.length > MAX_APP_PACKAGE_SIZE) {
      return reply.status(400).send({ error: "Package exceeds maximum size of 50MB" });
    }

    // Parse zip
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      return reply.status(400).send({ error: "Invalid zip file" });
    }

    // Extract manifest.json
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry) {
      return reply.status(400).send({ error: "manifest.json not found in package root" });
    }

    let manifestData: unknown;
    try {
      manifestData = JSON.parse(manifestEntry.getData().toString("utf-8"));
    } catch {
      return reply.status(400).send({ error: "manifest.json is not valid JSON" });
    }

    // Validate manifest schema
    const parsed = appManifestSchema.safeParse(manifestData);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid manifest",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    const manifest = parsed.data;

    // Task 3.4: Validate entry point file exists
    const entryEntry = zip.getEntry(manifest.ui.entry);
    if (!entryEntry) {
      return reply
        .status(400)
        .send({ error: `Entry point file '${manifest.ui.entry}' not found in package` });
    }

    // Task 3.4: Validate allowed asset file types
    const invalidFiles: string[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const ext = path.extname(entry.entryName).toLowerCase();
      if (!ALLOWED_ASSET_EXTENSIONS.has(ext)) {
        invalidFiles.push(entry.entryName);
      }
    }
    if (invalidFiles.length > 0) {
      return reply.status(400).send({
        error: "Package contains files with disallowed extensions",
        files: invalidFiles.slice(0, 10),
      });
    }

    // Task 4.1-4.2: Run static analysis scanner on JS/TS files
    const violations: ScanViolation[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (isScannable(entry.entryName)) {
        const content = entry.getData().toString("utf-8");
        violations.push(...scanFileContent(entry.entryName, content));
      }
    }

    if (violations.length > 0) {
      return reply.status(400).send({
        error: "Static analysis scan failed — forbidden API usage detected",
        violations: violations.slice(0, 20),
      });
    }

    // Task 5.1: Classify permission tier
    const tier = classifyPermissionTier(manifest.permissions);
    const needsReview = requiresManualReview(tier);

    // Task 3.2: Store package
    const packageDir = path.resolve(env.UPLOAD_DIR, "apps");
    await mkdir(packageDir, { recursive: true });
    const storedName = `${manifest.id}_${manifest.version}_${randomUUID().slice(0, 8)}.zip`;
    const packagePath = path.join(packageDir, storedName);
    await writeFile(packagePath, buffer);

    // Create or update app record
    const [existingApp] = await db
      .select()
      .from(apps)
      .where(eq(apps.appId, manifest.id));

    let appRecord: typeof apps.$inferSelect;

    if (existingApp) {
      // Verify ownership
      if (existingApp.developerId !== developer.id) {
        return reply.status(403).send({ error: "You do not own this app" });
      }

      // Update app metadata
      [appRecord] = await db
        .update(apps)
        .set({
          name: manifest.name,
          description: manifest.description,
          category: manifest.category,
          icon: manifest.icon,
          status: needsReview ? "in_review" : "published",
          updatedAt: new Date(),
        })
        .where(eq(apps.id, existingApp.id))
        .returning();
    } else {
      // Create new app
      [appRecord] = await db
        .insert(apps)
        .values({
          developerId: developer.id,
          appId: manifest.id,
          name: manifest.name,
          description: manifest.description,
          category: manifest.category,
          icon: manifest.icon,
          status: needsReview ? "in_review" : "published",
        })
        .returning();
    }

    // Task 5.4: Create version with proper status
    const versionStatus = needsReview ? "in_review" : "published";

    const [version] = await db
      .insert(appVersions)
      .values({
        appId: appRecord.id,
        version: manifest.version,
        manifestJson: manifest,
        packagePath: `apps/${storedName}`,
        status: versionStatus,
      })
      .returning();

    // Update current version pointer if auto-published
    if (!needsReview) {
      await db
        .update(apps)
        .set({ currentVersionId: version.id })
        .where(eq(apps.id, appRecord.id));
    }

    return reply.status(201).send({
      app: {
        id: appRecord.id,
        appId: appRecord.appId,
        name: appRecord.name,
        status: appRecord.status,
      },
      version: {
        id: version.id,
        version: version.version,
        status: version.status,
      },
      permissionTier: tier,
      requiresReview: needsReview,
    });
  });

  // Task 5.5: Suspend an app (admin-only — simplified: owner can suspend own apps)
  app.post<{ Params: { id: string } }>(
    "/api/apps/:id/suspend",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [developer] = await db
        .select()
        .from(developerAccounts)
        .where(eq(developerAccounts.userId, user.id));

      if (!developer) {
        return reply.status(403).send({ error: "Developer account required" });
      }

      const [appRecord] = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, request.params.id), eq(apps.developerId, developer.id)));

      if (!appRecord) {
        return reply.status(404).send({ error: "App not found" });
      }

      await db
        .update(apps)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(apps.id, appRecord.id));

      return reply.send({ success: true });
    }
  );

  // Unsuspend / republish an app
  app.post<{ Params: { id: string } }>(
    "/api/apps/:id/publish",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [developer] = await db
        .select()
        .from(developerAccounts)
        .where(eq(developerAccounts.userId, user.id));

      if (!developer) {
        return reply.status(403).send({ error: "Developer account required" });
      }

      const [appRecord] = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, request.params.id), eq(apps.developerId, developer.id)));

      if (!appRecord) {
        return reply.status(404).send({ error: "App not found" });
      }

      if (!appRecord.currentVersionId) {
        return reply.status(400).send({ error: "No published version available" });
      }

      await db
        .update(apps)
        .set({ status: "published", updatedAt: new Date() })
        .where(eq(apps.id, appRecord.id));

      return reply.send({ success: true });
    }
  );
}
