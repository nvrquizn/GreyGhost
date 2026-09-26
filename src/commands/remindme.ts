import { EmbedBuilder, MessageFlags, SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import type { Command } from "../types/command.js";
import {
  createReminder,
  deleteMemberReminder,
  getMemberReminders,
} from "../services/guild-settings.js";

const MAX_DURATION = 365 * 86_400_000;

export function parseReminderDuration(input: string): number | undefined {
  const match = input.trim().toLowerCase().match(/^(\d+)\s*(m|h|d|w)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount < 1) return undefined;
  const unit = match[2];
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : unit === "d" ? 86_400_000 : 604_800_000;
  const duration = amount * multiplier;
  return duration <= MAX_DURATION ? duration : undefined;
}

export const remindMeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("remindme")
    .setDescription("Create and manage your personal reminders.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand
      .setName("set")
      .setDescription("Ask Grey Ghost to remind you later.")
      .addStringOption((option) => option
        .setName("duration")
        .setDescription("When to remind you: 30m, 2h, 7d, or 4w (maximum 365 days).")
        .setRequired(true)
        .setMaxLength(8))
      .addStringOption((option) => option
        .setName("reminder")
        .setDescription("What Grey Ghost should remind you about.")
        .setRequired(true)
        .setMaxLength(1500)))
    .addSubcommand((subcommand) => subcommand
      .setName("list")
      .setDescription("View your pending reminders."))
    .addSubcommand((subcommand) => subcommand
      .setName("cancel")
      .setDescription("Cancel one of your pending reminders.")
      .addStringOption((option) => option
        .setName("id")
        .setDescription("The reminder ID shown by /remindme list.")
        .setRequired(true)
        .setMinLength(8)
        .setMaxLength(8))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "set") {
      const current = await getMemberReminders(interaction.guildId, interaction.user.id);
      if (current.length >= 20) {
        await interaction.reply({ content: "You already have 20 pending reminders. Cancel one before adding another.", flags: MessageFlags.Ephemeral });
        return;
      }
      const rawDuration = interaction.options.getString("duration", true);
      const duration = parseReminderDuration(rawDuration);
      if (!duration) {
        await interaction.reply({ content: "Use a duration such as `30m`, `2h`, `7d`, or `4w`. The maximum is 365 days.", flags: MessageFlags.Ephemeral });
        return;
      }
      const reminder = await createReminder(interaction.guildId, {
        userId: interaction.user.id,
        channelId: interaction.channelId,
        text: interaction.options.getString("reminder", true),
        dueAt: Date.now() + duration,
      });
      await interaction.reply({
        content: `⏰ I will remind you ${time(new Date(reminder.dueAt), TimestampStyles.RelativeTime)} in this channel. Reminder ID: \`${reminder.id}\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (subcommand === "list") {
      const reminders = await getMemberReminders(interaction.guildId, interaction.user.id);
      if (!reminders.length) {
        await interaction.reply({ content: "You have no pending reminders.", flags: MessageFlags.Ephemeral });
        return;
      }
      const lines = reminders.slice(0, 20).map((reminder) =>
        `\`${reminder.id}\` · ${time(new Date(reminder.dueAt), TimestampStyles.RelativeTime)} · ${reminder.text.slice(0, 100)}`,
      );
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x87ceeb)
          .setTitle("Your Pending Reminders")
          .setDescription(lines.join("\n"))
          .setFooter({ text: `${reminders.length}/20 reminders` })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const id = interaction.options.getString("id", true).toLowerCase();
    const deleted = await deleteMemberReminder(interaction.guildId, interaction.user.id, id);
    await interaction.reply({
      content: deleted ? `Reminder \`${id}\` was cancelled.` : "I could not find one of your reminders with that ID.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
