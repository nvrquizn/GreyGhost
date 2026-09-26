import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import {
  createJoust,
  enterJoust,
  getGuildSettings,
  getJoust,
  updateJoust,
  withdrawFromJoust,
} from "../services/guild-settings.js";
import { validJoustBuild } from "../jousts/engine.js";
import { getEconomyPlayer } from "../economy/store.js";
import { beginJoust, joustPodium, publishJoustLobby, runJoustRound } from "../jousts/runtime.js";
import { createPrizePackage, isApprovedAdmirerRole, type SecondPrizeMode } from "../events-manager/prizes.js";

function canHost(interaction: { member: { permissions: { has(permission: bigint): boolean } }; user: { id: string } }, hostId: string): boolean {
  return interaction.user.id === hostId || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function idOption(subcommand: import("discord.js").SlashCommandSubcommandBuilder) {
  return subcommand.addIntegerOption((option) => option.setName("joust-id").setDescription("Joust number.").setMinValue(1).setRequired(true));
}

export const joustCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("joust")
    .setDescription("Enter and host automated jousting tournaments.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("create").setDescription("Create a draft joust for the configured event channel.")
      .addStringOption((option) => option.setName("title").setDescription("Tournament title.").setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName("stakes").setDescription("Whether this joust permits spoils and ransoms.").setRequired(true).addChoices(
        { name: "Competitive — spoils enabled", value: "competitive" },
        { name: "Casual — no spoils", value: "casual" },
      )))
    .addSubcommand((sub) => idOption(sub.setName("publish").setDescription("Open a joust lobby and announce its prizes."))
      .addStringOption((option) => option.setName("second-reward").setDescription("Override Grey Ghost's second-place reward method.").addChoices(
        { name: "Auto", value: "auto" },
        { name: "Second place chooses one", value: "player" },
        { name: "Grey Ghost chooses one", value: "ghost" },
        { name: "Grey Ghost chooses one + second place chooses one", value: "shared" },
      ))
      .addRoleOption((option) => option.setName("second-admirer").setDescription("Optional preset Admirer role for Grey Ghost's second-place choice."))
      .addRoleOption((option) => option.setName("third-admirer").setDescription("Optional preset Admirer role for third place.")))
    .addSubcommand((sub) => idOption(sub.setName("enter").setDescription("Enter or update your entry in an open joust."))
      .addStringOption((option) => option.setName("horse").setDescription("Choose your mount.").setRequired(true).addChoices(
        { name: "Destrier — sturdier", value: "destrier" },
        { name: "Courser — stronger strike", value: "courser" },
      ))
      .addRoleOption((option) => option.setName("house").setDescription("The House you will represent.").setRequired(true))
      .addIntegerOption((option) => option.setName("health").setDescription("Health stat (−3 to 8).").setMinValue(-3).setMaxValue(8).setRequired(true))
      .addIntegerOption((option) => option.setName("damage").setDescription("Damage stat (−3 to 8).").setMinValue(-3).setMaxValue(8).setRequired(true))
      .addIntegerOption((option) => option.setName("resistance").setDescription("Resistance stat (−3 to 8).").setMinValue(-3).setMaxValue(8).setRequired(true)))
    .addSubcommand((sub) => idOption(sub.setName("withdraw").setDescription("Withdraw from an open joust lobby.")))
    .addSubcommand((sub) => idOption(sub.setName("start").setDescription("Seal the lists and balance the Houses.")))
    .addSubcommand((sub) => idOption(sub.setName("next").setDescription("Run the next round of tilts.")))
    .addSubcommand((sub) => idOption(sub.setName("status").setDescription("View a joust's current roster and state.")))
    .addSubcommand((sub) => idOption(sub.setName("cancel").setDescription("Cancel a draft, lobby, or active joust."))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
        await interaction.reply({ content: "You need **Manage Events** to create a joust.", flags: MessageFlags.Ephemeral });
        return;
      }
      const joust = await createJoust(interaction.guildId, {
        title: interaction.options.getString("title", true),
        hostId: interaction.user.id,
        channelId: interaction.channelId,
        competitive: interaction.options.getString("stakes", true) === "competitive",
      });
      await interaction.reply({ content: `Created draft joust **#${joust.id} · ${joust.title}** (${joust.competitive ? "competitive" : "casual"}). Open the lists with \`/joust publish joust-id:${joust.id}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const joustId = interaction.options.getInteger("joust-id", true);
    const joust = await getJoust(interaction.guildId, joustId);
    if (!joust) {
      await interaction.reply({ content: `Joust #${joustId} was not found.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "enter") {
      if (joust.competitive && !(await getEconomyPlayer(interaction.guildId, interaction.user.id))) {
        await interaction.reply({ content: "Competitive jousts require a Realm character so Grey Ghost can track coins, equipment, and ransoms. Create one with `/character create` first.", flags: MessageFlags.Ephemeral });
        return;
      }
      const settings = await getGuildSettings(interaction.guildId);
      const house = interaction.options.getRole("house", true);
      const configuredHouses = settings.selfRolePanels?.houses?.roles.map((entry) => entry.roleId) ?? [];
      if (!configuredHouses.includes(house.id)) {
        await interaction.reply({ content: "Choose a role configured in the **House Allegiance** panel.", flags: MessageFlags.Ephemeral });
        return;
      }
      const health = interaction.options.getInteger("health", true);
      const damage = interaction.options.getInteger("damage", true);
      const resistance = interaction.options.getInteger("resistance", true);
      if (!validJoustBuild(health, damage, resistance)) {
        await interaction.reply({ content: `Your stats must total **2** and each remain between **−3 and 8**. This build totals **${health + damage + resistance}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const updated = await enterJoust(interaction.guildId, joustId, {
        userId: interaction.user.id,
        horse: interaction.options.getString("horse", true) as "destrier" | "courser",
        chosenHouseRoleId: house.id,
        health,
        damage,
        resistance,
      });
      await interaction.reply({
        content: updated
          ? `You entered **${joust.title}** for ${house} on a **${interaction.options.getString("horse", true)}** with H ${health} / D ${damage} / R ${resistance}.`
          : "That joust is not accepting entries.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "withdraw") {
      const removed = await withdrawFromJoust(interaction.guildId, joustId, interaction.user.id);
      await interaction.reply({ content: removed ? `You withdrew from **${joust.title}**.` : "You do not have an entry in that open lobby.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "status") {
      const entrants = Object.values(joust.entrants);
      const active = entrants.filter((entrant) => entrant.active);
      const houses = new Set(active.map((entrant) => entrant.houseRoleId));
      await interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(0x7188a0)
        .setTitle(`Joust #${joust.id} · ${joust.title}`)
        .addFields(
          { name: "Status", value: joust.status, inline: true },
          { name: "Round", value: String(joust.round), inline: true },
          { name: "Entrants", value: String(entrants.length), inline: true },
          { name: "Still Riding", value: String(active.length), inline: true },
          { name: "Houses Remaining", value: String(houses.size), inline: true },
          { name: "Tilts Completed", value: String(joust.matches.length), inline: true },
          { name: "Top Three Riders", value: joustPodium(joust) },
        )
        .setFooter({ text: `Hosted by ${joust.hostId} · Ties are ordered by survival` })], flags: MessageFlags.Ephemeral });
      return;
    }

    if (!canHost(interaction, joust.hostId)) {
      await interaction.reply({ content: "Only the joust host or a server manager can control this tournament.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "publish") {
      if (joust.status !== "draft") {
        await interaction.reply({ content: "Only a draft joust can be published.", flags: MessageFlags.Ephemeral });
        return;
      }
      const settings = await getGuildSettings(interaction.guildId);
      const eventChatId = settings.eventChatChannelId ?? settings.eventChannelId;
      if (!settings.eventAnnouncementChannelId || !eventChatId) {
        await interaction.reply({ content: "Configure both `/setup event-channel` and `/setup event-chat` before publishing competitions.", flags: MessageFlags.Ephemeral });
        return;
      }
      if ((settings.selfRolePanels?.houses?.roles.length ?? 0) < 2) {
        await interaction.reply({ content: "Configure at least two roles in the **House Allegiance** panel first.", flags: MessageFlags.Ephemeral });
        return;
      }
      const secondMode = (interaction.options.getString("second-reward") ?? "auto") as SecondPrizeMode | "auto";
      const secondRole = interaction.options.getRole("second-admirer");
      const thirdRole = interaction.options.getRole("third-admirer");
      if (secondRole && secondMode === "player") {
        await interaction.reply({ content: "If second place is choosing their own prize, leave `second-admirer` blank or use Grey Ghost/shared.", flags: MessageFlags.Ephemeral });
        return;
      }
      if ((secondRole && !isApprovedAdmirerRole(secondRole)) || (thirdRole && !isApprovedAdmirerRole(thirdRole))) {
        await interaction.reply({ content: "Preset prizes must be roles from Grey Ghost's approved Admirer-role pool.", flags: MessageFlags.Ephemeral });
        return;
      }
      const pack = await createPrizePackage(interaction.guild, {
        kind: "joust",
        eventId: joust.id,
        title: joust.title,
        secondMode,
        secondRole,
        thirdRole,
      });
      await publishJoustLobby(interaction.guild, joust, pack);
      await interaction.reply({ content: `Joust #${joustId} lobby published.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "start") {
      try {
        await beginJoust(interaction.guild, joustId);
        await interaction.reply({ content: "The lists are sealed and the Houses are balanced. Use `/joust next` for round one.", flags: MessageFlags.Ephemeral });
      } catch (error) {
        const message = error instanceof Error && error.message === "NOT_ENOUGH_JOUSTERS"
          ? "At least two valid entrants are required."
          : error instanceof Error && error.message === "NOT_ENOUGH_HOUSES"
            ? "At least two configured House roles are required."
            : "That joust is not ready to begin.";
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (subcommand === "next") {
      try {
        const updated = await runJoustRound(interaction.guild, joustId, interaction.user.id);
        await interaction.reply({ content: updated.status === "finished" ? "The final result has been proclaimed." : `Round ${updated.round} is complete.`, flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.reply({ content: "That joust is not active or cannot draw another cross-House tilt.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (subcommand === "cancel") {
      if (["finished", "cancelled"].includes(joust.status)) {
        await interaction.reply({ content: "That joust has already ended.", flags: MessageFlags.Ephemeral });
        return;
      }
      await updateJoust(interaction.guildId, joustId, { status: "cancelled" });
      await interaction.reply({ content: `Joust #${joustId} cancelled. Existing House Point awards remain in the audit ledger.`, flags: MessageFlags.Ephemeral });
      return;
    }

  },
};
