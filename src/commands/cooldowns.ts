import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { DRAGON_GROWTH, dragonStage, getRiderDragon } from "../dragons/store.js";
import { getEconomyPlayer } from "../economy/store.js";
import { getHorseProfiles, getHuntStats } from "../stables/store.js";
import { TAVERN_COOLDOWN_MS, tavernReadyAt, type TavernGame } from "../tavern/store.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HUNT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function nextUtcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function status(readyAt: number | undefined, now: number): string {
  return readyAt && readyAt > now ? `⏳ <t:${Math.floor(readyAt / 1000)}:R>` : "✅ **Ready**";
}

function dailyResetStatus(lastDay: string | undefined, now: number): string {
  return lastDay === utcDay(now) ? status(nextUtcDay(now), now) : "✅ **Ready**";
}

function line(command: string, state: string): string {
  return `\`${command}\` — ${state}`;
}

export const cooldownsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("cooldowns")
    .setDescription("View the status of your Realm cooldowns.")
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    const now = Date.now();
    const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
    const hunt = await getHuntStats(interaction.guildId, interaction.user.id);

    const dailyLines = [
      line("/daily claim", status(player?.lastDailyAt ? player.lastDailyAt + DAY_MS : undefined, now)),
      line("/daily train", status(player?.lastTrainingAt ? player.lastTrainingAt + DAY_MS : undefined, now)),
      line("/hunt go", status(hunt.lastHuntAt ? hunt.lastHuntAt + HUNT_COOLDOWN_MS : undefined, now)),
    ];

    const tavernGames: TavernGame[] = ["dice", "darts", "cups"];
    const tavernLines = await Promise.all(tavernGames.map(async (game) => {
      const readyAt = await tavernReadyAt(interaction.guildId, interaction.user.id, game);
      return line(`/tavern ${game}`, status(readyAt && readyAt > now ? readyAt : undefined, now));
    }));

    const horses = await getHorseProfiles(interaction.guildId, interaction.user.id);
    const horseLines = horses.length
      ? horses.map((horse) => line(`/stable train · ${horse.name}`, dailyResetStatus(horse.lastTrainingDay, now)))
      : ["No owned horses to train."];

    const dragon = await getRiderDragon(interaction.guildId, interaction.user.id);
    const dragonLines: string[] = [];
    if (dragon) {
      dragonLines.push(line("/dragon feed", dailyResetStatus(dragon.lastFedDay, now)));
      const rank = DRAGON_GROWTH.findIndex((entry) => entry.stage === dragonStage(dragon, now));
      for (const [subcommand, key, requiredRank, requiredStage] of [
        ["train", "trainings", 1, "Young"],
        ["fly", "flights", 2, "Small"],
        ["patrol", "patrols", 3, "Medium"],
        ["hunt", "hunts", 3, "Medium"],
      ] as const) {
        const state = rank < requiredRank
          ? `🔒 Requires **${requiredStage}**`
          : dailyResetStatus(dragon.lastActivityDay[key], now);
        dragonLines.push(line(`/dragon ${subcommand}`, state));
      }
    } else {
      dragonLines.push("No bonded dragon.");
    }

    const embed = new EmbedBuilder()
      .setColor(0xb8c2cc)
      .setTitle("⏳ Realm Cooldowns")
      .setDescription("Every cooldown-bearing personal action is shown below. **Ready** means you may use it now.")
      .addFields(
        { name: "Realm", value: dailyLines.join("\n") },
        { name: "Tavern · 30 minutes each", value: tavernLines.join("\n") },
        { name: "Stable · resets each UTC day", value: horseLines.join("\n").slice(0, 1024) },
        { name: "Dragon · resets each UTC day", value: dragonLines.join("\n") },
      )
      .setFooter({ text: `Checked ${new Date(now).toISOString().replace("T", " ").slice(0, 16)} UTC` });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
