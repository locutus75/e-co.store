"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export type SurpriseType = "confetti" | "fireworks";

export interface ConfettiSettings {
  active: boolean;
  soundEnabled: boolean;
  triggers: {
    statusCount: {
      active: boolean;
      status: string;
      count: number;
      message: string;
      surpriseType: SurpriseType;
      userIds: string[];
      viewedBy: string[];
    };
    datetime: {
      active: boolean;
      targetDate: string; // ISO string
      message: string;
      surpriseType: SurpriseType;
      userIds: string[];
      viewedBy: string[];
    };
    editCount: {
      active: boolean;
      count: number;
      message: string;
      surpriseType: SurpriseType;
      userIds: string[];
      viewedBy: string[];
    };
  };
}

const SETTING_KEY = "CONFETTI_SETTINGS";

export async function getUsersForConfetti() {
  const session = await getServerSession(authOptions);
  if (!session) return [];

  // Alleen admin/staff hoeft dit op te kunnen halen via instellingen, maar voor de zekerheid fetch we gwn de users
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
    orderBy: { email: 'asc' }
  });
  return users;
}

export async function getConfettiSettings(): Promise<ConfettiSettings> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEY },
  });

  if (setting && setting.value) {
    try {
      const parsed = JSON.parse(setting.value);
      
      // Provide backwards compatibility for triggers if old structure is used
      if (!parsed.triggers) {
        return {
          active: parsed.active || false,
          soundEnabled: parsed.soundEnabled || false,
          triggers: {
            statusCount: {
              active: parsed.triggerType === "status_count",
              status: parsed.statusCount?.status || "Gepubliceerd",
              count: parsed.statusCount?.count || 100,
              message: parsed.message || "Gefeliciteerd met deze mijlpaal!",
              surpriseType: "confetti",
              userIds: [],
              viewedBy: [],
            },
            datetime: {
              active: parsed.triggerType === "datetime",
              targetDate: parsed.datetime?.targetDate || new Date().toISOString(),
              message: parsed.message || "Gefeliciteerd!",
              surpriseType: "confetti",
              userIds: [],
              viewedBy: [],
            },
            editCount: {
              active: false,
              count: 1000,
              message: "Geweldig! Je hebt al veel producten bewerkt!",
              surpriseType: "confetti",
              userIds: [],
              viewedBy: [],
            }
          }
        };
      }
      
      // Default fallback for new properties
      return {
        active: parsed.active,
        soundEnabled: parsed.soundEnabled,
        triggers: {
          statusCount: {
            ...parsed.triggers.statusCount,
            surpriseType: parsed.triggers.statusCount.surpriseType || "confetti",
            userIds: parsed.triggers.statusCount.userIds || [],
            viewedBy: parsed.triggers.statusCount.viewedBy || [],
          },
          datetime: {
            ...parsed.triggers.datetime,
            surpriseType: parsed.triggers.datetime.surpriseType || "confetti",
            userIds: parsed.triggers.datetime.userIds || [],
            viewedBy: parsed.triggers.datetime.viewedBy || [],
          },
          editCount: {
            ...parsed.triggers.editCount,
            surpriseType: parsed.triggers.editCount.surpriseType || "confetti",
            userIds: parsed.triggers.editCount.userIds || [],
            viewedBy: parsed.triggers.editCount.viewedBy || [],
          }
        }
      } as ConfettiSettings;
    } catch (e) {
      console.error("Failed to parse confetti settings", e);
    }
  }

  // Default settings
  return {
    active: false,
    soundEnabled: true,
    triggers: {
      statusCount: {
        active: false,
        status: "Gepubliceerd",
        count: 100,
        message: "Gefeliciteerd! We hebben de mijlpaal bereikt!",
        surpriseType: "confetti",
        userIds: [],
        viewedBy: [],
      },
      datetime: {
        active: false,
        targetDate: new Date().toISOString(),
        message: "Gefeliciteerd met deze speciale datum!",
        surpriseType: "confetti",
        userIds: [],
        viewedBy: [],
      },
      editCount: {
        active: false,
        count: 1000,
        message: "Geweldig! Je hebt een nieuw aantal bewerkingen gehaald!",
        surpriseType: "confetti",
        userIds: [],
        viewedBy: [],
      }
    }
  };
}

export async function saveConfettiSettings(settings: ConfettiSettings): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error("Unauthorized");

    // Zorg ervoor dat bij het opslaan de viewedBy lijst evt gereset wordt, 
    // Mocht je dat niet willen dan zou je ze moeten overerven van getConfettiSettings. 
    // Om het makkelijk te houden overerven we de bestaande viewedBy's als de overige velden (zoals count of status) hetzelfde zijn gebleven.
    // Voor dit detailniveau slaan we gewoon op wat we uit het formulier krijgen. (Formulier haalt het op en slaat op)

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(settings) },
      create: { key: SETTING_KEY, value: JSON.stringify(settings) },
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error saving confetti settings:", error);
    return { success: false, error: error.message };
  }
}

export async function markConfettiViewed(triggerIds: string[]): Promise<{ success: boolean }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { success: false };
    
    const userId = (session.user as any).id;
    const settings = await getConfettiSettings();
    let hasUpdates = false;

    if (triggerIds.includes("statusCount") && settings.triggers.statusCount.active) {
      if (!settings.triggers.statusCount.viewedBy.includes(userId)) {
        settings.triggers.statusCount.viewedBy.push(userId);
        hasUpdates = true;
      }
    }

    if (triggerIds.includes("datetime") && settings.triggers.datetime.active) {
      if (!settings.triggers.datetime.viewedBy.includes(userId)) {
        settings.triggers.datetime.viewedBy.push(userId);
        hasUpdates = true;
      }
    }

    if (triggerIds.includes("editCount") && settings.triggers.editCount.active) {
      if (!settings.triggers.editCount.viewedBy.includes(userId)) {
        settings.triggers.editCount.viewedBy.push(userId);
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      await prisma.systemSetting.upsert({
        where: { key: SETTING_KEY },
        update: { value: JSON.stringify(settings) },
        create: { key: SETTING_KEY, value: JSON.stringify(settings) },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error marking confetti as viewed", error);
    return { success: false };
  }
}

export async function checkConfettiStatus(): Promise<{ triggersToFire: { id: string; message: string; surpriseType: SurpriseType; typeKey: string }[], soundEnabled: boolean }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return { triggersToFire: [], soundEnabled: false };

    const userId = (session.user as any).id;
    const settings = await getConfettiSettings();
    const triggersToFire: { id: string; message: string; surpriseType: SurpriseType; typeKey: string }[] = [];

    if (!settings.active) {
      return { triggersToFire, soundEnabled: false };
    }

    const checkTriggerAccess = (userIds: string[], viewedBy: string[]) => {
      // Mag de gebruiker dit zien? (lijst leeg = iedereen, anders check op user ID)
      const isAllowed = userIds.length === 0 || userIds.includes(userId);
      // Heeft de gebruiker het al gezien?
      const hasViewed = viewedBy.includes(userId);
      return isAllowed && !hasViewed;
    };

    // 1. Check status count
    if (settings.triggers.statusCount.active && checkTriggerAccess(settings.triggers.statusCount.userIds, settings.triggers.statusCount.viewedBy)) {
      const { status, count, message, surpriseType } = settings.triggers.statusCount;
      if (status && count > 0) {
        const currentCount = await prisma.product.count({
          where: { status: status },
        });

        if (currentCount >= count) {
          triggersToFire.push({ id: `status_${status}_${count}`, message, surpriseType, typeKey: "statusCount" });
        }
      }
    }

    // 2. Check datetime
    if (settings.triggers.datetime.active && checkTriggerAccess(settings.triggers.datetime.userIds, settings.triggers.datetime.viewedBy)) {
      const { targetDate, message, surpriseType } = settings.triggers.datetime;
      const tDate = new Date(targetDate);
      const now = new Date();

      if (now >= tDate) {
        triggersToFire.push({ id: `datetime_${tDate.getTime()}`, message, surpriseType, typeKey: "datetime" });
      }
    }

    // 3. Check edit count (audit logs)
    if (settings.triggers.editCount.active && checkTriggerAccess(settings.triggers.editCount.userIds, settings.triggers.editCount.viewedBy)) {
      const { count, message, surpriseType } = settings.triggers.editCount;
      if (count > 0) {
        const editLogsCount = await prisma.auditLog.count({
          where: { action: "UPDATE" },
        });

        if (editLogsCount >= count) {
          triggersToFire.push({ id: `edits_${count}`, message, surpriseType, typeKey: "editCount" });
        }
      }
    }

    return { triggersToFire, soundEnabled: settings.soundEnabled || false };
  } catch (error) {
    console.error("Error checking confetti status:", error);
    return { triggersToFire: [], soundEnabled: false };
  }
}
