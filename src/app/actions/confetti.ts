"use server";

import { prisma } from "@/lib/prisma";

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
    };
    datetime: {
      active: boolean;
      targetDate: string; // ISO string
      message: string;
      surpriseType: SurpriseType;
    };
    editCount: {
      active: boolean;
      count: number;
      message: string;
      surpriseType: SurpriseType;
    };
  };
}

const SETTING_KEY = "CONFETTI_SETTINGS";

export async function getConfettiSettings(): Promise<ConfettiSettings> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEY },
  });

  if (setting && setting.value) {
    try {
      const parsed = JSON.parse(setting.value);
      // Fallback logic / migration from old format to new format
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
            },
            datetime: {
              active: parsed.triggerType === "datetime",
              targetDate: parsed.datetime?.targetDate || new Date().toISOString(),
              message: parsed.message || "Gefeliciteerd!",
              surpriseType: "confetti",
            },
            editCount: {
              active: false,
              count: 1000,
              message: "Geweldig! Je hebt al veel producten bewerkt!",
              surpriseType: "confetti",
            }
          }
        };
      }
      
      // Default to confetti for existing triggers that lack surpriseType
      return {
        active: parsed.active,
        soundEnabled: parsed.soundEnabled,
        triggers: {
          statusCount: {
            ...parsed.triggers.statusCount,
            surpriseType: parsed.triggers.statusCount.surpriseType || "confetti"
          },
          datetime: {
            ...parsed.triggers.datetime,
            surpriseType: parsed.triggers.datetime.surpriseType || "confetti"
          },
          editCount: {
            ...parsed.triggers.editCount,
            surpriseType: parsed.triggers.editCount.surpriseType || "confetti"
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
      },
      datetime: {
        active: false,
        targetDate: new Date().toISOString(),
        message: "Gefeliciteerd met deze speciale datum!",
        surpriseType: "confetti",
      },
      editCount: {
        active: false,
        count: 1000,
        message: "Geweldig! Je hebt een nieuw aantal bewerkingen gehaald!",
        surpriseType: "confetti",
      }
    }
  };
}

export async function saveConfettiSettings(settings: ConfettiSettings): Promise<{ success: boolean; error?: string }> {
  try {
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

export async function checkConfettiStatus(): Promise<{ triggersToFire: { id: string; message: string; surpriseType: SurpriseType }[], soundEnabled: boolean }> {
  try {
    const settings = await getConfettiSettings();
    const triggersToFire: { id: string; message: string; surpriseType: SurpriseType }[] = [];

    if (!settings.active) {
      return { triggersToFire, soundEnabled: false };
    }

    let hasUpdates = false;

    // 1. Check status count
    if (settings.triggers.statusCount.active) {
      const { status, count, message, surpriseType } = settings.triggers.statusCount;
      if (status && count > 0) {
        const currentCount = await prisma.product.count({
          where: { status: status },
        });

        if (currentCount >= count) {
          triggersToFire.push({ id: `status_${status}_${count}`, message, surpriseType });
          settings.triggers.statusCount.active = false;
          hasUpdates = true;
        }
      }
    }

    // 2. Check datetime
    if (settings.triggers.datetime.active) {
      const { targetDate, message, surpriseType } = settings.triggers.datetime;
      const tDate = new Date(targetDate);
      const now = new Date();

      if (now >= tDate) {
        triggersToFire.push({ id: `datetime_${tDate.getTime()}`, message, surpriseType });
        settings.triggers.datetime.active = false;
        hasUpdates = true;
      }
    }

    // 3. Check edit count (audit logs)
    if (settings.triggers.editCount.active) {
      const { count, message, surpriseType } = settings.triggers.editCount;
      if (count > 0) {
        // Count total UPDATE actions in audit log
        const editLogsCount = await prisma.auditLog.count({
          where: { action: "UPDATE" },
        });

        if (editLogsCount >= count) {
          triggersToFire.push({ id: `edits_${count}`, message, surpriseType });
          settings.triggers.editCount.active = false;
          hasUpdates = true;
        }
      }
    }

    if (hasUpdates) {
      await saveConfettiSettings(settings);
    }

    return { triggersToFire, soundEnabled: settings.soundEnabled || false };
  } catch (error) {
    console.error("Error checking confetti status:", error);
    return { triggersToFire: [], soundEnabled: false };
  }
}
