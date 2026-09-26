import { Events, type Client } from "discord.js";
import { deleteReminder, getDueReminders, type Reminder } from "../services/guild-settings.js";

const processing = new Set<string>();

async function deliverReminder(client: Client, guildId: string, reminder: Reminder): Promise<void> {
  const key = `${guildId}:${reminder.id}`;
  if (processing.has(key)) return;
  processing.add(key);
  try {
    const content = `<@${reminder.userId}> ⏰ **Reminder:** ${reminder.text}`;
    const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
    let delivered = false;
    if (channel?.isSendable()) {
      delivered = await channel.send({
        content,
        allowedMentions: { users: [reminder.userId] },
      }).then(() => true).catch(() => false);
    }
    if (!delivered) {
      const user = await client.users.fetch(reminder.userId).catch(() => null);
      delivered = await user?.send({ content: `⏰ **Reminder from a Grey Ghost server:** ${reminder.text}` })
        .then(() => true).catch(() => false) ?? false;
    }
    await deleteReminder(guildId, reminder.id);
    if (!delivered) console.warn(`Could not deliver reminder ${reminder.id} for user ${reminder.userId}; its channel and DMs were unavailable.`);
  } finally {
    processing.delete(key);
  }
}

async function checkReminders(client: Client): Promise<void> {
  const due = await getDueReminders();
  await Promise.all(due.map(({ guildId, reminder }) => deliverReminder(client, guildId, reminder)));
}

export function registerReminderRuntime(client: Client): void {
  client.once(Events.ClientReady, () => {
    void checkReminders(client).catch((error) => console.error("Reminder recovery failed:", error));
    const interval = setInterval(() => {
      void checkReminders(client).catch((error) => console.error("Reminder check failed:", error));
    }, 15_000);
    interval.unref();
  });
}
