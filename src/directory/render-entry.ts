import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { LoreEntry } from "../services/guild-settings.js";

const typeLabels = { house: "House", character: "Character", dragon: "Dragon" } as const;
const typeColors = { house: 0x8f2831, character: 0x8795a1, dragon: 0xb4473c } as const;

export function renderLoreEntry(entry: LoreEntry): {
  embed: EmbedBuilder;
  row?: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setColor(typeColors[entry.type])
    .setTitle(entry.name)
    .setDescription(entry.overview)
    .setAuthor({ name: `ASOIAF Directory · ${typeLabels[entry.type]}` })
    .addFields(entry.facts.map((fact) => ({ name: fact.label, value: fact.value, inline: true })))
    .setFooter({ text: entry.aliases.length ? `Also known as: ${entry.aliases.join(", ")}` : "Grey Ghost's ASOIAF Directory" });

  if (entry.imageUrl) embed.setThumbnail(entry.imageUrl);
  if (entry.sourceUrl) embed.setURL(entry.sourceUrl);

  const buttons: ButtonBuilder[] = [];
  if (entry.spoilers) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`lore-spoiler:${entry.id}`)
        .setLabel(`Reveal ${entry.spoilerLabel ?? "General"} Spoilers`)
        .setEmoji("⚠️")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (entry.sourceUrl) {
    buttons.push(
      new ButtonBuilder().setLabel("Read More").setURL(entry.sourceUrl).setStyle(ButtonStyle.Link),
    );
  }
  return { embed, row: buttons.length ? new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) : undefined };
}

export function renderLoreSpoilers(entry: LoreEntry): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xc69b3c)
    .setTitle(`${entry.name} · ${entry.spoilerLabel ?? "General"} Spoilers`)
    .setDescription(entry.spoilers ?? "No spoiler notes are saved for this entry.")
    .setFooter({ text: "Only you can see this spoiler section." });
}
