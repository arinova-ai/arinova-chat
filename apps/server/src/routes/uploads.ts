import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { attachments, messages, conversations } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../env.js";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

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

      // Generate unique filename
      const ext = path.extname(data.filename) || "";
      const storedName = `${randomUUID()}${ext}`;
      const uploadDir = path.resolve(env.UPLOAD_DIR);

      // Ensure upload directory exists
      await mkdir(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, storedName);
      await writeFile(filePath, buffer);

      // Create a user message with this attachment
      const [msg] = await db
        .insert(messages)
        .values({
          conversationId: conv.id,
          role: "user",
          content: "",
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
              url: `/uploads/${storedName}`,
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

      return reply.send({
        id: attachment.id,
        messageId: attachment.messageId,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        url: `/uploads/${attachment.storagePath}`,
        createdAt: attachment.createdAt,
      });
    }
  );
}
