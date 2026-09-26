import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import {
  chooseExpedition,
  continueExpedition,
  createExpedition,
  getExpedition,
  joinExpedition,
  leaveExpedition,
  setExpeditionStatusMessage,
  type Expedition,
  type ExpeditionChoice,
} from "../expeditions/store.js";
import {
  applyExpeditionInjury,
  getEconomyPlayer,
  grantCoins,
  grantCosmetic,
  changeRenown,
} from "../economy/store.js";
import {
  addChronicleEntry,
  awardAchievement,
  changeHousePoints,
  getChronicleEntries,
  getGuildSettings,
  getHouseQuests,
  progressHouseQuest,
} from "../services/guild-settings.js";
import { publishChronicleEntry } from "../chronicles/runtime.js";

const stageNames = ["", "The Departure", "The Hazard", "The Discovery", "The Return"] as const;
const choiceLabels: Record<ExpeditionChoice, string> = {
  bold: "⚔️ Press boldly onward",
  cautious: "🛡️ Advance with caution",
  clever: "🧭 Seek a clever path",
};
import { recordFestivalActivity } from "../festivals/store.js";

const cosmeticRewards = [
  "expedition-silver-saddlecloth",
  "expedition-crimson-saddlecloth",
  "expedition-weathered-cloak",
  "expedition-gilded-clasp",
] as const;

function idOption(sub: import("discord.js").SlashCommandSubcommandBuilder) {
  return sub.addIntegerOption((option) => option.setName("expedition-id").setDescription("Expedition number.").setMinValue(1).setRequired(true));
}

function partyList(expedition: Expedition): string {
  const ids = Object.keys(expedition.participants);
  return ids.length ? ids.map((id) => `<@${id}>`).join("\n") : "No explorers have joined yet.";
}

function expeditionEmbed(expedition: Expedition): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(expedition.status === "finished" ? 0xd4af37 : 0x6b8e73)
    .setTitle(`Expedition #${expedition.id} · ${expedition.title}`)
    .addFields(
      { name: "Status", value: expedition.status, inline: true },
      { name: "Difficulty", value: expedition.difficulty, inline: true },
      { name: "Successes", value: `${expedition.successes}/4`, inline: true },
      { name: "Party", value: partyList(expedition).slice(0, 1024) },
    );
  if (expedition.status === "active") {
    embed.addFields(
      { name: `Stage ${expedition.stage} · ${stageNames[expedition.stage]}`, value: "Every explorer may choose a course with `/expedition choose`. The host then uses `/expedition continue`." },
      { name: "Choices received", value: `${Object.keys(expedition.votes).length}/${Object.keys(expedition.participants).length}`, inline: true },
    );
  }
  return embed;
}


function expeditionLiveText(expedition: Expedition): string {
  const party = Object.keys(expedition.participants);
  const mentions = party.length ? party.map((id) => `<@${id}>`).join(" ") : "No explorers have joined yet.";
  if (expedition.status === "lobby") {
    return `🧭 **Expedition #${expedition.id} · ${expedition.title}**\n**Status:** Gathering\n**Party (${party.length}):** ${mentions}\n\nJoin with \`/expedition join expedition-id:${expedition.id}\`.`;
  }
  if (expedition.status === "finished") {
    return `🧭 **Expedition #${expedition.id} · ${expedition.title}**\n**Status:** Returned\n**Party:** ${mentions}\n**Result:** ${expedition.successes}/4 stages succeeded.`;
  }
  const voted = party.filter((id) => expedition.votes[id]);
  const waiting = party.filter((id) => !expedition.votes[id]);
  return `🧭 **Expedition #${expedition.id} · ${expedition.title}**\n**Party:** ${mentions}\n**Stage ${expedition.stage}/4:** ${stageNames[expedition.stage]}\n**Choices received:** ${voted.length}/${party.length}\n✅ **Chosen:** ${voted.length ? voted.map((id) => `<@${id}>`).join(" ") : "None yet"}\n⏳ **Waiting:** ${waiting.length ? waiting.map((id) => `<@${id}>`).join(" ") : "Everyone has chosen"}\n\nUse \`/expedition choose\` to choose your approach.`;
}

async function refreshExpeditionLiveMessage(guild: import("discord.js").Guild, expedition: Expedition): Promise<void> {
  if (!expedition.statusMessageId) return;
  const channel = await guild.channels.fetch(expedition.channelId).catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) return;
  const message = await channel.messages.fetch(expedition.statusMessageId).catch(() => null);
  if (!message) return;
  await message.edit({ content: expeditionLiveText(expedition), embeds: [], allowedMentions: { parse: [] } }).catch(() => undefined);
}

async function pingExpeditionParty(guild: import("discord.js").Guild, expedition: Expedition, text: string): Promise<void> {
  const ids = Object.keys(expedition.participants);
  if (!ids.length) return;
  const channel = await guild.channels.fetch(expedition.channelId).catch(() => null);
  if (!channel?.isSendable()) return;
  await channel.send({ content: `${ids.map((id) => `<@${id}>`).join(" ")} — ${text}`, allowedMentions: { users: ids } }).catch(() => undefined);
}

async function progressHouseQuests(interaction: import("discord.js").ChatInputCommandInteraction<"cached">, expedition: Expedition): Promise<void> {
  const settings = await getGuildSettings(interaction.guildId);
  const houseIds = new Set(settings.selfRolePanels?.houses?.roles.map((entry) => entry.roleId) ?? []);
  if (!houseIds.size) return;
  const activeQuests = (await getHouseQuests(interaction.guildId)).filter((quest) => quest.status === "active" && quest.category === "service");
  for (const userId of Object.keys(expedition.participants)) {
    const member = await interaction.guild.members.fetch(userId).catch(() => undefined);
    const houseRoleId = member?.roles.cache.find((role) => houseIds.has(role.id))?.id;
    if (!houseRoleId) continue;
    const quest = activeQuests.find((candidate) => candidate.houseRoleId === houseRoleId);
    if (!quest) continue;
    const result = await progressHouseQuest(interaction.guildId, quest.id, 1);
    if (!result) continue;
    await awardAchievement(interaction.guildId, userId, "quest-contributor", "Grey Ghost");
    if (result.completedNow && result.quest.rewardPoints > 0) {
      await changeHousePoints(interaction.guildId, {
        houseRoleId,
        delta: result.quest.rewardPoints,
        reason: `Completed House quest #${result.quest.id}: ${result.quest.title}`,
        memberId: userId,
        staffId: "Grey Ghost",
      });
    }
  }
}

async function finishExpedition(interaction: import("discord.js").ChatInputCommandInteraction<"cached">, expedition: Expedition): Promise<string[]> {
  const party = Object.keys(expedition.participants);
  const reward = expedition.successes >= 4 ? 12 : expedition.successes >= 2 ? 8 : 4;
  const rewardLines: string[] = [];

  for (const userId of party) {
    await grantCoins(interaction.guildId, userId, reward, "Grey Ghost", `Expedition #${expedition.id} reward`);
    await awardAchievement(interaction.guildId, userId, "expedition-veteran", "Grey Ghost");
    if (expedition.successes >= 2) await changeRenown(interaction.guildId, userId, 2).catch(() => undefined);
    await recordFestivalActivity(interaction.guildId, userId, "expedition").catch(() => undefined);
  }
  rewardLines.push(`Every explorer receives **${reward} coins**.`);

  if (expedition.successes === 4) {
    for (let index = 0; index < party.length; index++) {
      await grantCosmetic(interaction.guildId, party[index]!, cosmeticRewards[index % cosmeticRewards.length]!);
    }
    rewardLines.push("A flawless expedition also awards each explorer an **expedition cosmetic**.");
  }

  await progressHouseQuests(interaction, expedition);

  if (expedition.successes >= 3) {
    const sourceKey = `expedition:${expedition.id}`;
    const already = (await getChronicleEntries(interaction.guildId)).some((entry) => entry.sourceKey === sourceKey);
    const entry = await addChronicleEntry(interaction.guildId, {
      type: "expedition_discovery",
      title: `${expedition.title} · Expedition Discovery`,
      description: `<@${expedition.hostId}> and ${party.length - 1} fellow explorer${party.length - 1 === 1 ? "" : "s"} returned from **${expedition.title}** after succeeding in **${expedition.successes}/4** stages.`,
      occurredAt: Date.now(),
      relatedUserIds: party,
      relatedRoleIds: [],
      sourceKey,
    });
    if (!already) await publishChronicleEntry(interaction.guild, entry);
    rewardLines.push("The discovery has been entered into the **Chronicles**.");
  }

  return rewardLines;
}

export const expeditionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("expedition")
    .setDescription("Launch and join cooperative adventures across the realm.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("create").setDescription("Open a new expedition in this channel.")
      .addStringOption((option) => option.setName("title").setDescription("Expedition title.").setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName("difficulty").setDescription("How dangerous the expedition should be.").setRequired(true).addChoices(
        { name: "Easy", value: "easy" },
        { name: "Standard", value: "standard" },
        { name: "Perilous", value: "perilous" },
      )))
    .addSubcommand((sub) => idOption(sub.setName("join").setDescription("Join an expedition before it departs.")))
    .addSubcommand((sub) => idOption(sub.setName("leave").setDescription("Leave an expedition before it departs.")))
    .addSubcommand((sub) => idOption(sub.setName("choose").setDescription("Choose how your party should approach the current stage."))
      .addStringOption((option) => option.setName("approach").setDescription("Your preferred approach.").setRequired(true).addChoices(
        { name: "Press boldly onward", value: "bold" },
        { name: "Advance with caution", value: "cautious" },
        { name: "Seek a clever path", value: "clever" },
      )))
    .addSubcommand((sub) => idOption(sub.setName("status").setDescription("View an expedition's party and progress.")))
    .addSubcommand((sub) => idOption(sub.setName("continue").setDescription("Begin or advance your expedition."))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
        await interaction.reply({ content: "You need **Manage Events** to open an expedition.", flags: MessageFlags.Ephemeral });
        return;
      }
      const expedition = await createExpedition(interaction.guildId, {
        title: interaction.options.getString("title", true),
        difficulty: interaction.options.getString("difficulty", true) as "easy" | "standard" | "perilous",
        hostId: interaction.user.id,
        channelId: interaction.channelId,
      });
      const message = await interaction.reply({ content: expeditionLiveText(expedition), fetchReply: true });
      await setExpeditionStatusMessage(interaction.guildId, expedition.id, message.id);
      return;
    }

    const expeditionId = interaction.options.getInteger("expedition-id", true);
    const expedition = await getExpedition(interaction.guildId, expeditionId);
    if (!expedition) {
      await interaction.reply({ content: `Expedition #${expeditionId} was not found.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "join") {
      try {
        const updated = await joinExpedition(interaction.guildId, expeditionId, interaction.user.id);
        await refreshExpeditionLiveMessage(interaction.guild, updated);
        await interaction.reply({ content: `You joined **${updated.title}**.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        const code = (error as Error).message;
        await interaction.reply({ content: code === "CHARACTER_REQUIRED" ? "Create a Realm character with `/character create` before joining an expedition." : "That expedition is no longer accepting explorers.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "leave") {
      try {
        const updated = await leaveExpedition(interaction.guildId, expeditionId, interaction.user.id);
        await refreshExpeditionLiveMessage(interaction.guild, updated);
        await interaction.reply({ content: `You left **${expedition.title}**.`, flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.reply({ content: "You can only leave while the expedition is still gathering.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "choose") {
      const choice = interaction.options.getString("approach", true) as ExpeditionChoice;
      try {
        const updated = await chooseExpedition(interaction.guildId, expeditionId, interaction.user.id, choice);
        await refreshExpeditionLiveMessage(interaction.guild, updated);
        await interaction.reply({ content: `Your choice is recorded: **${choiceLabels[choice]}**.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        const code = (error as Error).message;
        const message = code === "NOT_IN_EXPEDITION" ? "You are not part of that expedition." : "That expedition is not currently awaiting choices.";
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "status") {
      await interaction.reply({ embeds: [expeditionEmbed(expedition)] });
      return;
    }

    if (interaction.user.id !== expedition.hostId && !interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
      await interaction.reply({ content: "Only the expedition host or a member with **Manage Events** may advance the journey.", flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const outcome = await continueExpedition(interaction.guildId, expeditionId, expedition.hostId);
      if (outcome.started) {
        await refreshExpeditionLiveMessage(interaction.guild, outcome.expedition);
        await pingExpeditionParty(interaction.guild, outcome.expedition, `**${outcome.expedition.title}** has departed. Stage 1 is live; make your choices.`);
        await interaction.reply({ content: `Expedition #${outcome.expedition.id} has departed. The live party message will update as choices arrive.`, flags: MessageFlags.Ephemeral });
        return;
      }

      const result = outcome.result!;
      const resultText = result.success
        ? `The party **succeeded** with **${result.score}** against difficulty **${result.target}**.`
        : `The party **fell short** with **${result.score}** against difficulty **${result.target}**.`;
      const embed = expeditionEmbed(outcome.expedition)
        .setTitle(`${outcome.expedition.title} · ${stageNames[result.stage]}`)
        .setDescription(`${choiceLabels[result.choice]} won the party vote.\n\n${resultText}`)
        .addFields({ name: "Fortune roll", value: String(result.roll), inline: true });

      if (!result.success) {
        const ids = Object.keys(outcome.expedition.participants);
        const targetId = ids[Math.floor(Math.random() * ids.length)];
        if (targetId) {
          const injured = await applyExpeditionInjury(interaction.guildId, targetId, `Expedition #${expeditionId}: ${stageNames[result.stage]}`);
          if (injured?.injury) embed.addFields({ name: "Setback", value: `<@${targetId}> returns **${injured.injury.severity}**. The injury will recover naturally or can be treated with a Field Bandage.` });
        }
      }

      if (outcome.expedition.status === "finished") {
        const rewards = await finishExpedition(interaction, outcome.expedition);
        embed.addFields({ name: "The party returns", value: rewards.join("\n").slice(0, 1024) });
        await refreshExpeditionLiveMessage(interaction.guild, outcome.expedition);
        await pingExpeditionParty(interaction.guild, outcome.expedition, `**${outcome.expedition.title}** has returned with ${outcome.expedition.successes}/4 successful stages.`);
      } else {
        await refreshExpeditionLiveMessage(interaction.guild, outcome.expedition);
        await pingExpeditionParty(interaction.guild, outcome.expedition, `Stage ${result.stage} is complete. **Stage ${outcome.expedition.stage} · ${stageNames[outcome.expedition.stage]}** is now awaiting your choices.`);
      }
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      const code = (error as Error).message;
      const message = code === "NOT_ENOUGH_EXPLORERS" ? "At least **2 explorers** must join before departure."
        : code === "NO_CHOICES" ? "At least one explorer must use `/expedition choose` before the expedition can continue."
          : code === "EXPEDITION_FINISHED" ? "That expedition has already returned."
            : `The expedition could not continue: ${code}.`;
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  },
};
