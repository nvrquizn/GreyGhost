import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types/command.js";
import { parseReminderDuration } from "./remindme.js";
import { createRealmEvent, getRealmEvent, updateRealmEvent } from "../services/guild-settings.js";
import { renderRealmEvent } from "../events-manager/render.js";
import { grantChampionsRole } from "../events-manager/champions.js";

function attendeeList(ids: string[]): string {
  return ids.length ? ids.slice(0, 30).map((id) => `<@${id}>`).join(", ").slice(0, 1024) : "None";
}

export const eventCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create and manage server events with RSVP tracking.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((subcommand) => subcommand
      .setName("create")
      .setDescription("Create and publish an event in this channel.")
      .addStringOption((option) => option.setName("title").setDescription("The event title.").setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName("starts-in").setDescription("Time until it begins, such as 30m, 2h, 7d, or 4w.").setMaxLength(8).setRequired(true))
      .addStringOption((option) => option.setName("description").setDescription("What members should know about the event.").setMaxLength(3000).setRequired(true))
      .addStringOption((option) => option.setName("location").setDescription("Discord channel, voice room, game, or other location.").setMaxLength(100)))
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("View an event's RSVP lists.")
      .addIntegerOption((option) => option.setName("event-id").setDescription("The event number.").setMinValue(1).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("podium").setDescription("Record the top three finishers for a competitive event.")
      .addIntegerOption((option) => option.setName("event-id").setDescription("The event number.").setMinValue(1).setRequired(true))
      .addUserOption((option) => option.setName("first").setDescription("First place.").setRequired(true))
      .addUserOption((option) => option.setName("second").setDescription("Second place."))
      .addUserOption((option) => option.setName("third").setDescription("Third place.")))
    .addSubcommand((subcommand) => subcommand.setName("complete").setDescription("Mark an event complete and close RSVPs.")
      .addIntegerOption((option) => option.setName("event-id").setDescription("The event number.").setMinValue(1).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("cancel").setDescription("Cancel an event and close RSVPs.")
      .addIntegerOption((option) => option.setName("event-id").setDescription("The event number.").setMinValue(1).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      if (!interaction.channel?.isSendable()) {
        await interaction.reply({ content: "Grey Ghost cannot publish an event in this channel.", flags: MessageFlags.Ephemeral });
        return;
      }
      const duration = parseReminderDuration(interaction.options.getString("starts-in", true));
      if (!duration) {
        await interaction.reply({ content: "Use a start time such as `30m`, `2h`, `7d`, or `4w` (maximum 365 days).", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const event = await createRealmEvent(interaction.guildId, {
        title: interaction.options.getString("title", true),
        description: interaction.options.getString("description", true),
        location: interaction.options.getString("location") ?? undefined,
        hostId: interaction.user.id,
        channelId: interaction.channelId,
        startsAt: Date.now() + duration,
      });
      const rendered = renderRealmEvent(event);
      const message = await interaction.channel.send({ embeds: [rendered.embed], components: [rendered.row] });
      await updateRealmEvent(interaction.guildId, event.id, { messageId: message.id });
      await interaction.editReply(`Event **#${event.id} · ${event.title}** was published.`);
      return;
    }
    const eventId = interaction.options.getInteger("event-id", true);
    const event = await getRealmEvent(interaction.guildId, eventId);
    if (!event) {
      await interaction.reply({ content: `Event #${eventId} was not found.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const canControl = event.hostId === interaction.user.id || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!canControl) {
      await interaction.reply({ content: "Only the event host or a server manager can control this event.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === "podium") {
      const podiumIds = [
        interaction.options.getUser("first", true).id,
        interaction.options.getUser("second")?.id,
        interaction.options.getUser("third")?.id,
      ].filter((id): id is string => Boolean(id));
      const unique = [...new Set(podiumIds)];
      if (unique.length !== podiumIds.length) {
        await interaction.reply({ content: "Each podium place must be a different member.", flags: MessageFlags.Ephemeral });
        return;
      }
      const updated = await updateRealmEvent(interaction.guildId, eventId, { podiumIds: unique });
      if (!updated) return;
      await grantChampionsRole(interaction.guild, unique);
      const channel = await interaction.guild.channels.fetch(updated.channelId).catch(() => null);
      if (channel?.isTextBased() && "messages" in channel) {
        const message = await channel.messages.fetch(updated.messageId).catch(() => null);
        if (message) {
          const rendered = renderRealmEvent(updated);
          await message.edit({ embeds: [rendered.embed], components: [rendered.row] });
        }
      }
      await interaction.reply({ content: `The podium for Event #${eventId} has been recorded.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "status") {
      await interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(0x7188a0)
        .setTitle(`Event #${event.id} · RSVP Status`)
        .addFields(
          { name: `Going · ${event.going.length}`, value: attendeeList(event.going) },
          { name: `Interested · ${event.interested.length}`, value: attendeeList(event.interested) },
          { name: `Cannot attend · ${event.declined.length}`, value: attendeeList(event.declined) },
        )], flags: MessageFlags.Ephemeral });
      return;
    }
    if (event.status !== "open") {
      await interaction.reply({ content: `That event is already **${event.status}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const status = subcommand === "complete" ? "completed" : "cancelled";
    const updated = await updateRealmEvent(interaction.guildId, eventId, { status });
    if (!updated) return;
    const channel = await interaction.guild.channels.fetch(updated.channelId).catch(() => null);
    if (channel?.isTextBased() && "messages" in channel) {
      const message = await channel.messages.fetch(updated.messageId).catch(() => null);
      if (message) {
        const rendered = renderRealmEvent(updated);
        await message.edit({ embeds: [rendered.embed], components: [rendered.row] });
      }
    }
    await interaction.reply({ content: `Event #${eventId} was marked **${status}**.`, flags: MessageFlags.Ephemeral });
  },
};
