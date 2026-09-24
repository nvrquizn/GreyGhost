import { Events, MessageFlags, type Client } from "discord.js";
import {
  castSuggestionVote,
  isSuggestionVotingOpen,
  type SuggestionVote,
} from "../services/suggestions.js";
import { renderSuggestion } from "./render-suggestion.js";

export function registerSuggestionInteractions(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith("suggestion:")) return;

    const [, vote, suggestionId] = interaction.customId.split(":");
    if ((vote !== "up" && vote !== "down") || !suggestionId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const suggestion = await castSuggestionVote(
      suggestionId,
      interaction.user.id,
      vote as SuggestionVote,
    );

    if (!suggestion) {
      await interaction.editReply("That suggestion is no longer available.");
      return;
    }

    if (!isSuggestionVotingOpen(suggestion.status)) {
      await interaction.editReply(`Voting is closed because this suggestion is **${suggestion.status}**.`);
      return;
    }

    const rendered = renderSuggestion(suggestion);
    await interaction.message.edit({
      embeds: [rendered.embed],
      components: [rendered.row],
    });
    await interaction.editReply("Your vote has been recorded.");
  });
}
