import {
  ActionRowBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Client,
} from "discord.js";
import { getGuildSettings, updateModmailTicket } from "../services/guild-settings.js";
import { hasRequiredModeratorRole } from "../moderation/access.js";
import {
  MODMAIL_CATEGORIES,
  closeTicket,
  deleteClosedTicket,
  configuredGuildsForUser,
  findOpenTicket,
  openTicket,
  isModmailStaffMember,
  reopenTicket,
  refreshTicketHeader,
  ticketLabel,
} from "./service.js";

const categoryName = (value: string) => MODMAIL_CATEGORIES.find(([id]) => id === value)?.[1] ?? "Other";

export function registerModmailInteractions(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("modmail:category:")) {
        const guildId = interaction.customId.split(":")[2];
        const category = interaction.values[0];
        if (!guildId || !category) return;
        const modal = new ModalBuilder().setCustomId(`modmail:intake:${guildId}:${category}`).setTitle("Open a Modmail Ticket");
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("subject").setLabel("Short subject").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("details").setLabel("Explain the situation").setPlaceholder("Include the relevant details, names, dates, and context.").setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(4000).setRequired(true)),
        );
        await interaction.showModal(modal);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith("modmail:intake:")) {
        const [, , guildId, categoryId] = interaction.customId.split(":");
        if (!guildId || !categoryId) return;
        await interaction.deferReply();
        const guild = client.guilds.cache.get(guildId);
        if (!guild || !(await guild.members.fetch(interaction.user.id).catch(() => null))) {
          await interaction.editReply("That server is no longer available to you.");
          return;
        }
        const existing = await findOpenTicket(guild.id, interaction.user.id);
        if (existing) {
          await interaction.editReply(`You already have open ticket ${ticketLabel(existing.id)}. Reply here in DMs to continue it.`);
          return;
        }
        const ticket = await openTicket(guild, interaction.user, categoryName(categoryId), interaction.fields.getTextInputValue("subject"), interaction.fields.getTextInputValue("details"));
        await interaction.editReply(`Your ticket **${ticketLabel(ticket.id)}** has been opened with **${guild.name}** staff. Reply to Grey Ghost's DMs to add more information.`);
        return;
      }

      if (!interaction.isButton() || !interaction.inCachedGuild()) return;
      const [prefix, action, rawId] = interaction.customId.split(":");
      if (prefix !== "modmail" || !rawId || !["claim", "close", "reopen", "delete"].includes(action ?? "")) return;
      const settings = await getGuildSettings(interaction.guildId);
      const ticket = settings.modmail?.tickets[rawId];
      if (!ticket || ticket.status === "deleted") {
        await interaction.reply({ content: "That ticket no longer exists.", flags: MessageFlags.Ephemeral });
        return;
      }
      const config = settings.modmail;
      const allowed = await isModmailStaffMember(interaction.member, config?.staffRoleId);
      if (!allowed) {
        await interaction.reply({ content: "Only modmail staff can use that control.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (action === "claim") {
        if (ticket.status !== "open") {
          await interaction.reply({ content: "That ticket is closed.", flags: MessageFlags.Ephemeral });
          return;
        }
        const updated = await updateModmailTicket(interaction.guildId, ticket.id, { claimedBy: interaction.user.id });
        if (updated) await refreshTicketHeader(interaction.guild, updated);
        await interaction.reply({ content: `${interaction.user} claimed ticket ${ticketLabel(ticket.id)}. This identity is visible only to staff.` });
        const user = await client.users.fetch(ticket.userId).catch(() => null);
        await user?.send(`Grey Ghost's staff have opened and begun reviewing ticket **${ticketLabel(ticket.id)}**.`).catch(() => undefined);
        if (!updated) throw new Error("TICKET_NOT_FOUND");
        return;
      }

      if (action === "close") {
        if (ticket.status !== "open") {
          await interaction.reply({ content: "That ticket is already closed.", flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await closeTicket(interaction.guild, ticket, interaction.user.id);
        await interaction.editReply(`Ticket ${ticketLabel(ticket.id)} was closed. Use the panel above to reopen it or, if you are a Dragonrider, delete it.`);
        return;
      }

      if (action === "reopen") {
        if (ticket.status !== "closed") {
          await interaction.reply({ content: "That ticket is already open.", flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await reopenTicket(interaction.guild, ticket, interaction.user.id);
        await interaction.editReply(`Ticket ${ticketLabel(ticket.id)} was reopened.`);
        return;
      }

      if (ticket.status !== "closed") {
        await interaction.reply({ content: "Close the ticket before deleting it.", flags: MessageFlags.Ephemeral });
        return;
      }
      const canDelete = interaction.member.permissions.has("ManageGuild") || await hasRequiredModeratorRole(interaction.guildId, interaction.member);
      if (!canDelete) {
        await interaction.reply({ content: "Dragonseeds may close and reopen tickets, but only Dragonriders or server managers may permanently delete them.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: `Deleting closed ticket ${ticketLabel(ticket.id)}…`, flags: MessageFlags.Ephemeral });
      await deleteClosedTicket(interaction.guild, ticket, interaction.user.id);
    } catch (error) {
      console.error("Modmail interaction failed:", error);
      if (interaction.isRepliable()) {
        const payload = interaction.inGuild()
          ? { content: "Grey Ghost could not complete that modmail action. Please try again.", flags: MessageFlags.Ephemeral } as const
          : { content: "Grey Ghost could not complete that modmail action. Please try again." } as const;
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => undefined);
        else await interaction.reply(payload).catch(() => undefined);
      }
    }
  });
}

export function buildCategoryMenu(guildId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`modmail:category:${guildId}`)
    .setPlaceholder("Choose a modmail category")
    .addOptions(MODMAIL_CATEGORIES.map(([value, label, description]) => new StringSelectMenuOptionBuilder().setValue(value).setLabel(label).setDescription(description)));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export { configuredGuildsForUser };
