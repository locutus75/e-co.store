import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInboxAction, getUsersForComposeAction } from "@/app/actions/messages";
import MessagesClient from "./MessagesClient";
import { redirect } from "next/navigation";

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) redirect("/login");

  const [inbox, users] = await Promise.all([
    getInboxAction(),
    getUsersForComposeAction(),
  ]);

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, chatColor: true },
  });

  return (
    <MessagesClient
      initialInbox={inbox}
      allUsers={users}
      currentUserId={userId}
      currentUserEmail={currentUser?.email ?? ""}
      currentUserChatColor={currentUser?.chatColor ?? null}
    />
  );
}
