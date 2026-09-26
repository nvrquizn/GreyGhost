import { Events, MessageFlags, type Client } from "discord.js";
import { castEventRsvp } from "../services/guild-settings.js";
import { renderRealmEvent } from "./render.js";

export function registerEventManagerInteractions(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.inCachedGuild() || !interaction.customId.startsWith("event:rsvp:")) return;
    const [, , response, rawId] = interaction.customId.split(":");
    const eventId = Number(rawId);
    if (!Number.isInteger(eventId) || !["going", "interested", "declined"].includes(response ?? "")) return;
    const event = await castEventRsvp(
      interaction.guildId,
      eventId,
      interaction.user.id,
      response as "going" | "interested" | "declined",
    );
    if (!event) {
      await interaction.reply({ content: "That event is closed or no longer available.", flags: MessageFlags.Ephemeral });
      return;
    }
    const rendered = renderRealmEvent(event);
    await interaction.update({ embeds: [rendered.embed], components: [rendered.row] });
  });
}
