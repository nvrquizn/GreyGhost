import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";

export const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether Grey Ghost is awake."),

  async execute(interaction) {
    const reply = await interaction.reply({
      content: "A pale shape stirs above the mist…",
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    });

    const roundTrip = reply.resource?.message
      ? reply.resource.message.createdTimestamp - interaction.createdTimestamp
      : 0;

    await interaction.editReply(
      `🐉 **Grey Ghost answers.**\nRound trip: **${roundTrip} ms** · Gateway: **${Math.round(interaction.client.ws.ping)} ms**`,
    );
  },
};
