import { Events, MessageFlags, type Client } from "discord.js";
import { findLoreEntry } from "./entries.js";
import { renderLoreSpoilers } from "./render-entry.js";

export function registerLoreInteractions(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith("lore-spoiler:")) return;
    if (!interaction.guildId) return;

    const entryId = interaction.customId.slice("lore-spoiler:".length);
    const entry = await findLoreEntry(interaction.guildId, entryId);
    if (!entry?.spoilers) {
      await interaction.reply({
        content: "That directory entry or its spoiler section is no longer available.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({ embeds: [renderLoreSpoilers(entry)], flags: MessageFlags.Ephemeral });
  });
}
