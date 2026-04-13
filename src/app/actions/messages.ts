"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";

const ROOT_DIR = process.env.APP_ROOT || process.cwd();

// ── Types ────────────────────────────────────────────────────────────────────

export type MsgUser = { id: string; email: string; chatColor: string | null };

export type MsgAttachment = { id: string; filename: string; originalName: string };

export type MessageEntry = {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  parentId: string | null;
  fromUser: MsgUser;
  recipients: { toUser: MsgUser; readAt: string | null }[];
  attachments: MsgAttachment[];
  replyCount: number;
  /** readAt of the current user's recipient record (inbox only) */
  myReadAt?: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

const msgInclude = {
  fromUser: { select: { id: true, email: true, chatColor: true } },
  recipients: { include: { toUser: { select: { id: true, email: true, chatColor: true } } } },
  attachments: { select: { id: true, filename: true, originalName: true } },
  _count: { select: { replies: true } },
} as const;

function mapMessage(m: any, myId?: string): MessageEntry {
  return {
    id: m.id,
    subject: m.subject,
    body: m.body,
    sentAt: m.sentAt.toISOString(),
    parentId: m.parentId ?? null,
    fromUser: m.fromUser,
    recipients: m.recipients.map((r: any) => ({
      toUser: r.toUser,
      readAt: r.readAt?.toISOString() ?? null,
    })),
    attachments: m.attachments,
    replyCount: m._count.replies,
    myReadAt: myId
      ? (m.recipients.find((r: any) => r.toUserId === myId)?.readAt?.toISOString() ?? null)
      : undefined,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getInboxAction(): Promise<MessageEntry[]> {
  const myId = await currentUserId();

  const rows = await prisma.messageRecipient.findMany({
    where: { toUserId: myId, deletedByRecipient: false },
    orderBy: { message: { sentAt: "desc" } },
    include: { message: { include: msgInclude } },
  });

  return rows.map((r) => mapMessage(r.message, myId));
}

export async function getSentAction(): Promise<MessageEntry[]> {
  const myId = await currentUserId();

  const rows = await prisma.internalMessage.findMany({
    where: { fromUserId: myId, deletedBySender: false },
    orderBy: { sentAt: "desc" },
    include: msgInclude,
  });

  return rows.map((m) => mapMessage(m));
}

/** Returns the full thread (root + all replies) visible to the current user. */
export async function getThreadAction(messageId: string): Promise<MessageEntry[]> {
  const myId = await currentUserId();

  // Walk up to root
  let rootId = messageId;
  let cur = await prisma.internalMessage.findUnique({
    where: { id: messageId },
    select: { parentId: true },
  });
  while (cur?.parentId) {
    rootId = cur.parentId;
    cur = await prisma.internalMessage.findUnique({
      where: { id: cur.parentId },
      select: { parentId: true },
    });
  }

  const all = await prisma.internalMessage.findMany({
    where: { OR: [{ id: rootId }, { parentId: rootId }] },
    orderBy: { sentAt: "asc" },
    include: msgInclude,
  });

  // Only include messages the current user can see (sent or received)
  const visible = all.filter(
    (m) => m.fromUserId === myId || m.recipients.some((r: any) => r.toUserId === myId)
  );

  return visible.map((m) => mapMessage(m, myId));
}

export async function getUnreadCountAction(): Promise<number> {
  const myId = await currentUserId();
  return prisma.messageRecipient.count({
    where: { toUserId: myId, readAt: null, deletedByRecipient: false },
  });
}

export async function getUsersForComposeAction(): Promise<MsgUser[]> {
  const myId = await currentUserId();
  return prisma.user.findMany({
    where: { id: { not: myId } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, chatColor: true },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function markReadAction(messageId: string): Promise<void> {
  const myId = await currentUserId();
  await prisma.messageRecipient.updateMany({
    where: { messageId, toUserId: myId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/messages");
}

export async function sendMessageAction(
  formData: FormData
): Promise<{ success?: boolean; error?: string; messageId?: string }> {
  const myId = await currentUserId();

  const subject = (formData.get("subject") as string)?.trim() ?? "";
  const body = (formData.get("body") as string)?.trim() ?? "";
  const parentId = (formData.get("parentId") as string) || null;
  const toUserIds = formData.getAll("toUserIds") as string[];
  const files = formData.getAll("attachments") as File[];

  if (!body) return { error: "Vul een berichttekst in." };
  if (!parentId && !subject) return { error: "Vul een onderwerp in." };
  if (toUserIds.length === 0) return { error: "Selecteer minimaal één ontvanger." };

  try {
    const message = await prisma.internalMessage.create({
      data: {
        fromUserId: myId,
        subject: subject || "Re: (geen onderwerp)",
        body,
        parentId,
        recipients: { create: toUserIds.map((id) => ({ toUserId: id })) },
      },
    });

    // Attach files
    const validFiles = files.filter((f) => f.name && f.size > 0);
    if (validFiles.length > 0) {
      const uploadDir = path.join(ROOT_DIR, "public", "uploads", "messages", message.id);
      fs.mkdirSync(uploadDir, { recursive: true });

      for (const file of validFiles) {
        const ext = path.extname(file.name);
        const safe = path.basename(file.name, ext).replace(/[^a-z0-9]/gi, "_").toLowerCase();
        const filename = `${Date.now()}-${safe}${ext}`;
        fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));
        await prisma.messageAttachment.create({
          data: { messageId: message.id, filename, originalName: file.name },
        });
      }
    }

    revalidatePath("/messages");
    return { success: true, messageId: message.id };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function deleteMessageAction(
  messageId: string,
  box: "inbox" | "sent"
): Promise<{ success?: boolean; error?: string }> {
  const myId = await currentUserId();
  try {
    if (box === "inbox") {
      await prisma.messageRecipient.updateMany({
        where: { messageId, toUserId: myId },
        data: { deletedByRecipient: true },
      });
    } else {
      await prisma.internalMessage.updateMany({
        where: { id: messageId, fromUserId: myId },
        data: { deletedBySender: true },
      });
    }
    revalidatePath("/messages");
    return { success: true };
  } catch (e: any) {
    return { error: e.message };
  }
}
