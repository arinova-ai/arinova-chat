import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { attachments, messages, conversations } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { triggerAgentResponse } from "../ws/handler.js";
import { uploadToR2, isR2Configured } from "../lib/r2.js";
import { getNextSeq } from "../lib/message-seq.js";
import { env } from "../env.js";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileTypeFromBuffer } from "file-type";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
];

// Text-based types that have no magic number — skip content validation
const TEXT_TYPES = new Set(["text/plain", "text/csv", "application/json"]);

export async function uploadRoutes(app: FastifyInstance) {
  // Upload file and attach to a message
  app.post<{ Params: { conversationId: string } }>(
    "/api/conversations/:conversationId/upload",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      // Verify conversation ownership
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, request.params.conversationId));

      if (!conv || conv.userId !== user.id) {
        return reply.status(404).send({ error: "Conversation not found" });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "No file uploaded" });
      }

      if (!ALLOWED_TYPES.includes(data.mimetype)) {
        return reply
          .status(400)
          .send({ error: `File type ${data.mimetype} is not allowed` });
      }

      // Read file buffer
      const buffer = await data.toBuffer();

      if (buffer.length > env.MAX_FILE_SIZE) {
        return reply
          .status(400)
          .send({ error: `File exceeds maximum size of ${env.MAX_FILE_SIZE / 1024 / 1024}MB` });
      }

      // Validate file content matches declared MIME type (skip text-based types)
      if (!TEXT_TYPES.has(data.mimetype)) {
        const detected = await fileTypeFromBuffer(buffer);
        if (!detected || !ALLOWED_TYPES.includes(detected.mime)) {
          return reply
            .status(400)
            .send({ error: "File content does not match declared type" });
        }
      }

      // Generate unique filename
      const ext = path.extname(data.filename) || "";
      const storedName = `${randomUUID()}${ext}`;

      // Upload to R2 if configured, otherwise fall back to local disk
      let publicUrl: string;
      let fileUrl: string;

      const r2Url = await uploadToR2(storedName, buffer, data.mimetype);

      if (r2Url) {
        // R2: public URL is the CDN domain
        publicUrl = r2Url;
        fileUrl = r2Url;
      } else {
        // Local fallback
        const uploadDir = path.resolve(env.UPLOAD_DIR);
        await mkdir(uploadDir, { recursive: true });
        await writeFile(path.join(uploadDir, storedName), buffer);
        fileUrl = `/uploads/${storedName}`;
        publicUrl = `${env.BETTER_AUTH_URL}${fileUrl}`;
      }

      // Check for caption text in form fields
      const caption = (data.fields as Record<string, { value?: string }>)?.caption?.value ?? "";

      // Build content: image markdown or file link, with optional caption
      const isImage = data.mimetype.startsWith("image/");
      const fileMarkdown = isImage
        ? `![${data.filename}](${publicUrl})`
        : `[${data.filename}](${publicUrl})`;
      const content = caption ? `${caption}\n\n${fileMarkdown}` : fileMarkdown;

      // Create a user message with this attachment
      const userSeq = await getNextSeq(conv.id);
      const [msg] = await db
        .insert(messages)
        .values({
          conversationId: conv.id,
          seq: userSeq,
          role: "user",
          content,
          status: "completed",
        })
        .returning();

      const [attachment] = await db
        .insert(attachments)
        .values({
          messageId: msg.id,
          fileName: data.filename,
          fileType: data.mimetype,
          fileSize: buffer.length,
          storagePath: storedName,
        })
        .returning();

      // Trigger agent response (non-blocking — streams via WS)
      triggerAgentResponse(user.id, conv.id, content, { skipUserMessage: true }).catch(() => {
        // Agent errors are handled via WS events
      });

      return reply.send({
        message: {
          ...msg,
          attachments: [
            {
              id: attachment.id,
              messageId: msg.id,
              fileName: attachment.fileName,
              fileType: attachment.fileType,
              fileSize: attachment.fileSize,
              url: fileUrl,
              createdAt: attachment.createdAt,
            },
          ],
        },
      });
    }
  );

  // Get attachment info
  app.get<{ Params: { id: string } }>(
    "/api/attachments/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, request.params.id));

      if (!attachment) {
        return reply.status(404).send({ error: "Attachment not found" });
      }

      // Verify ownership through message -> conversation chain
      const [msg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, attachment.messageId));

      if (!msg) {
        return reply.status(404).send({ error: "Attachment not found" });
      }

      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, msg.conversationId), eq(conversations.userId, user.id)));

      if (!conv) {
        return reply.status(404).send({ error: "Attachment not found" });
      }

      // Return R2 URL or local path
      const url = isR2Configured
        ? `${env.R2_PUBLIC_URL}/${attachment.storagePath}`
        : `/uploads/${attachment.storagePath}`;

      return reply.send({
        id: attachment.id,
        messageId: attachment.messageId,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        url,
        createdAt: attachment.createdAt,
      });
    }
  );
}
