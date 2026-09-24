import { Events, MessageFlags, PermissionFlagsBits, type Client } from "discord.js";
import { saveCollectionSet } from "../services/guild-settings.js";
import { takePendingCollectionConfiguration } from "./pending-configuration.js";

export function registerCollectionInteractions(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isRoleSelectMenu() || !interaction.customId.startsWith("collection-config:")) {
      return;
    }

    if (!interaction.inCachedGuild()) return;

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: "You need **Manage Roles** to configure collection titles.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const token = interaction.customId.split(":")[1];
    const pending = token ? takePendingCollectionConfiguration(token) : undefined;

    if (!pending || pending.guildId !== interaction.guildId || pending.userId !== interaction.user.id) {
      await interaction.update({
        content: "This configuration menu has expired. Run `/collection configure` again.",
        components: [],
      });
      return;
    }

    if (interaction.values.includes(pending.titleRoleId)) {
      await interaction.update({
        content: "A title role cannot require itself. Run the command again and omit that role.",
        components: [],
      });
      return;
    }

    const requiredCount = pending.requiredCount ?? interaction.values.length;
    if (requiredCount > interaction.values.length) {
      await interaction.update({
        content: `You selected ${interaction.values.length} roles, but the requirement was set to ${requiredCount}. Run the command again with a smaller requirement.`,
        components: [],
      });
      return;
    }

    await saveCollectionSet(interaction.guildId, {
      name: pending.name,
      titleRoleId: pending.titleRoleId,
      requirementRoleIds: interaction.values,
      requiredCount,
    });

    await interaction.update({
      content: `**${pending.name}** is configured: members need **${requiredCount} of ${interaction.values.length}** selected roles to receive <@&${pending.titleRoleId}>.\n\nRun \`/collection sync\` once after configuring your sets.`,
      components: [],
    });
  });
}
