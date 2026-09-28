import { EmbedBuilder, Events, type Client } from "discord.js";
import { buildCategoryMenu, configuredGuildsForUser } from "./interactions.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { findOpenTicket, findTicketByChannel, forwardMemberMessage, isModmailStaffMember, refreshTicketHeader, sendAnonymousReply } from "./service.js";

export function registerModmailEvents(client: Client): void {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      const settings = await getGuildSettings(guild.id);
      for (const ticket of Object.values(settings.modmail?.tickets ?? {})) {
        if (ticket.status !== "deleted") {
          await refreshTicketHeader(guild, ticket).catch((error) =>
            console.error(`Could not refresh modmail ticket ${ticket.id}:`, error),
          );
        }
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    try {
      if (message.inGuild()) {
        if (message.content.trimStart().startsWith("?")) return;
        const ticket = await findTicketByChannel(message.guildId, message.channelId);
        if (!ticket) return;
        const config = (await getGuildSettings(message.guildId)).modmail;
        const member = message.member;
        const isStaff = Boolean(member && await isModmailStaffMember(member, config?.staffRoleId));
        if (!isStaff) return;
        if (message.content.trimStart().startsWith("//")) {
          await message.react("📝").catch(() => undefined);
          return;
        }
        if (ticket.status !== "open") {
          await message.react("🔒").catch(() => undefined);
          return;
        }
        if (!message.content && !message.attachments.size) return;
        const firstAttachment = message.attachments.first();
        await sendAnonymousReply(
          message.guild,
          ticket,
          message.author.id,
          message.content || "*Attachment sent by staff.*",
          firstAttachment ? { url: firstAttachment.url, name: firstAttachment.name } : undefined,
          false,
        );
        await message.react("📨").catch(() => undefined);
        return;
      }

      if (!message.channel.isDMBased()) return;
      const guilds = await configuredGuildsForUser(client, message.author.id);
      if (!guilds.length) {
        await message.reply("Modmail is not currently configured for a shared server.");
        return;
      }
      const withTickets = [];
      for (const guild of guilds) {
        const ticket = await findOpenTicket(guild.id, message.author.id);
        if (ticket) withTickets.push({ guild, ticket });
      }
      if (withTickets.length === 1) {
        const { guild, ticket } = withTickets[0]!;
        await forwardMemberMessage(message, guild, ticket);
        await message.react("📨").catch(() => undefined);
        return;
      }
      if (withTickets.length > 1) {
        await message.reply("You have open tickets in more than one shared server. Please use the ticket number shown in the server's earlier confirmation while staff resolves them.");
        return;
      }
      const guild = guilds[0]!;
      await message.reply({
        embeds: [new EmbedBuilder().setColor(0x87ceeb).setTitle(`${guild.name} · Contact Staff`).setDescription("Choose the category that best fits your situation. Grey Ghost will then ask for a subject and explanation before creating a private staff ticket.").setFooter({ text: "Your messages are shared only with the configured staff team." })],
        components: [buildCategoryMenu(guild.id)],
      });
    } catch (error) {
      console.error("DM modmail failed:", error);
      await message.reply("Grey Ghost could not deliver that message. Please try again shortly.").catch(() => undefined);
    }
  });
}
