import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../types/command.js";
import {
  DRAGON_GROWTH,
  addDragonGrowthDays,
  createDragon,
  dragonAgeDays,
  dragonStage,
  editDragon,
  feedDragon,
  findDragonByName,
  getDragon,
  getFormerRiderDragon,
  getDragons,
  getRiderDragon,
  grantSpecialDragonRider,
  isSpecialDragonRider,
  nextDragonGrowth,
  recordDragonActivity,
  recordDragonEncounter,
  restoreRiderDragon,
  revokeSpecialDragonRider,
  retireDragon,
  setDragonLair,
  type Dragon,
  type DragonStage,
} from "../dragons/store.js";
import { hasRequiredModeratorRole, moderatorRoleRequirementText } from "../moderation/access.js";
import { getGuildSettings } from "../services/guild-settings.js";

const stageLabels: Record<DragonStage, string> = {
  hatchling: "Hatchling",
  young: "Young",
  small: "Small",
  medium: "Medium",
  large: "Large",
  very_large: "Very Large",
  great: "Great",
  ancient: "Ancient",
};

function traitsFrom(value: string | null): string[] {
  return value?.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 3) ?? [];
}

function ageLabel(days: number): string {
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 730) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"}`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return `${years} year${years === 1 ? "" : "s"}${months ? `, ${months} month${months === 1 ? "" : "s"}` : ""}`;
}

function dailyMood(dragon: Dragon): string {
  const moods = ["Content", "Restless", "Playful", "Irritable", "Sleepy", "Hungry", "Curious", "Excited", "Watchful"];
  const day = new Date().toISOString().slice(0, 10);
  let hash = dragon.id;
  for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return moods[hash % moods.length]!;
}

function bondLabel(dragon: Dragon): string {
  if (!dragon.bondedAt) return "Unbonded";
  const days = Math.max(0, Math.floor((Date.now() - dragon.bondedAt) / 86_400_000));
  const points = dragon.fedDays + dragon.activityCounts.trainings * 2 + dragon.activityCounts.flights * 2 + dragon.activityCounts.patrols + dragon.activityCounts.hunts * 2 + Math.floor(days / 7);
  if (points >= 365) return "Unbreakable";
  if (points >= 180) return "Deep Bond";
  if (points >= 90) return "Strong Bond";
  if (points >= 40) return "Trusted";
  if (points >= 15) return "Familiar";
  return "Newly Bonded";
}

function dragonAchievements(dragon: Dragon): string[] {
  const achievements: string[] = [];
  const stage = dragonStage(dragon);
  const rank = DRAGON_GROWTH.findIndex((entry) => entry.stage === stage);
  if (dragon.activityCounts.flights >= 1) achievements.push("First Flight");
  if (dragon.activityCounts.flights >= 25) achievements.push("The Open Sky");
  if (dragon.activityCounts.hunts >= 20) achievements.push("Hunter");
  if (dragon.activityCounts.patrols >= 50) achievements.push("Long Patrol");
  if (rank >= DRAGON_GROWTH.findIndex((entry) => entry.stage === "great")) achievements.push("Old Blood");
  if (stage === "ancient") achievements.push("The Ancient");
  if (dragon.bondedAt && Date.now() - dragon.bondedAt >= 365 * 86_400_000) achievements.push("Bound in Fire");
  if (dragon.activityCounts.events >= 10) achievements.push("A Familiar Shadow");
  return achievements;
}

function dragonEmbed(dragon: Dragon): EmbedBuilder {
  const ageDays = dragonAgeDays(dragon);
  const stage = dragonStage(dragon);
  const next = nextDragonGrowth(dragon);
  const colors = [dragon.primaryColor, dragon.secondaryColor].filter(Boolean).join(" and ");
  const bond = dragon.status === "bonded" && dragon.riderId
    ? `<@${dragon.riderId}>${dragon.bondedAt ? ` · bonded <t:${Math.floor(dragon.bondedAt / 1000)}:R>` : ""}`
    : dragon.formerRiderIds.length
      ? `Former rider${dragon.formerRiderIds.length === 1 ? "" : "s"}: ${dragon.formerRiderIds.map((id) => `<@${id}>`).join(", ")}`
      : "None";
  const growth = next
    ? `${dragon.fedDays}/${next.fedDays} fed days · age ${ageDays}/${next.ageDays} days`
    : "Fully grown";
  const activity = dragon.activityCounts;
  return new EmbedBuilder()
    .setColor(dragon.status === "wild" ? 0x6f7782 : 0x9f2b2b)
    .setTitle(`🐉 ${dragon.name}`)
    .setDescription(dragon.description ?? "A dragon recorded in Grey Ghost's Dragon Registry.")
    .addFields(
      { name: "Status", value: dragon.status === "bonded" ? "Bonded" : dragon.status === "wild" ? "Wild" : "Deceased", inline: true },
      { name: "Size", value: stageLabels[stage], inline: true },
      { name: "Age", value: ageLabel(ageDays), inline: true },
      { name: "Rider", value: bond },
      { name: "Appearance", value: `**Scales:** ${colors}\n**Eyes:** ${dragon.eyeColor}${dragon.wingColor ? `\n**Wings:** ${dragon.wingColor}` : ""}${dragon.hornColor ? `\n**Horns:** ${dragon.hornColor}` : ""}${dragon.flameColor ? `\n**Flame:** ${dragon.flameColor}` : ""}` },
      { name: "Temperament", value: dragon.traits.length ? dragon.traits.join(" · ") : "Unrecorded", inline: true },
      { name: "Mood", value: dragon.status === "bonded" ? dailyMood(dragon) : "Wild", inline: true },
      { name: "Bond", value: dragon.status === "bonded" ? bondLabel(dragon) : "Former bond recorded", inline: true },
      { name: "Growth", value: growth, inline: true },
      { name: "Life with a rider", value: `Flights **${activity.flights}** · Hunts **${activity.hunts}** · Patrols **${activity.patrols}** · Training **${activity.trainings}** · Interactions **${activity.interactions}** · Events **${activity.events}**` },
      { name: "Lair", value: dragon.lairName ? `**${dragon.lairName}**${dragon.lairLocation ? ` · ${dragon.lairLocation}` : ""}${dragon.lairDescription ? `\n${dragon.lairDescription}` : ""}` : "No lair recorded." },
      { name: "Dragon achievements", value: dragonAchievements(dragon).join(" · ") || "None yet" },
    )
    .setFooter({ text: `Dragon Registry #${dragon.id}` })
    .setTimestamp(dragon.createdAt);
}

async function resolveDragon(interaction: ChatInputCommandInteraction<"cached">, allowOther = false): Promise<Dragon | undefined> {
  const name = interaction.options.getString("dragon");
  if (name) return findDragonByName(interaction.guildId, name);
  const rider = allowOther ? interaction.options.getUser("rider") : null;
  if (rider) {
    const dragons = await getDragons(interaction.guildId);
    return dragons.find((dragon) => dragon.riderId === rider.id) ?? dragons.find((dragon) => dragon.formerRiderIds.includes(rider.id));
  }
  return getRiderDragon(interaction.guildId, interaction.user.id);
}

function canManage(interaction: ChatInputCommandInteraction<"cached">): boolean {
  return interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.user.id === interaction.guild.ownerId;
}

async function riderEligible(interaction: ChatInputCommandInteraction<"cached">, userId: string): Promise<boolean> {
  if (await isSpecialDragonRider(interaction.guildId, userId)) return true;
  const member = interaction.guild.members.cache.get(userId) ?? await interaction.guild.members.fetch(userId).catch(() => null);
  return member ? hasRequiredModeratorRole(interaction.guildId, member) : false;
}

const behavior = {
  interact: [
    "leans into the attention before pretending they absolutely did not.",
    "watches their rider with bright, curious eyes.",
    "gives a low rumble and settles beside their rider.",
    "nudges their rider with considerably less delicacy than intended.",
  ],
  train: [
    "answers commands sharply and finishes the lesson in good order.",
    "tests their rider's patience, then finally performs the exercise perfectly.",
    "spends the session practicing turns, stops, and controlled movement.",
  ],
  fly: [
    "takes to the sky and traces a wide circle over the realm before returning.",
    "rides a strong current high above the castle and returns at dusk.",
    "launches hard into the wind and completes a long, steady flight.",
  ],
  patrol: [
    "circles the roads and coast. Nothing unusual is found.",
    "spots distant travelers, but the patrol remains quiet.",
    "returns from a long circuit of the surrounding lands without incident.",
  ],
  hunt: [
    "vanishes beyond the hills and returns decidedly less hungry.",
    "spends an unreasonable amount of time frightening livestock before finding a proper meal.",
    "returns from the hunt content and ready to sleep somewhere inconvenient.",
  ],
} as const;

function randomLine(lines: readonly string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]!;
}

export const dragonCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("dragon")
    .setDescription("View and care for the dragons of the Dragonriders.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("create").setDescription("Create and bond a new staff dragon.")
      .addUserOption((option) => option.setName("rider").setDescription("The Dragonrider who will bond with this dragon.").setRequired(true))
      .addStringOption((option) => option.setName("name").setDescription("Dragon name.").setMaxLength(60).setRequired(true))
      .addStringOption((option) => option.setName("sex").setDescription("Sex or presentation.").setMaxLength(30).setRequired(true))
      .addStringOption((option) => option.setName("scales").setDescription("Primary scale colour.").setMaxLength(60).setRequired(true))
      .addStringOption((option) => option.setName("eyes").setDescription("Eye colour.").setMaxLength(60).setRequired(true))
      .addStringOption((option) => option.setName("secondary").setDescription("Secondary scale colour.").setMaxLength(60))
      .addStringOption((option) => option.setName("wings").setDescription("Wing membrane colour.").setMaxLength(60))
      .addStringOption((option) => option.setName("flame").setDescription("Flame colour.").setMaxLength(60))
      .addStringOption((option) => option.setName("horns").setDescription("Horn colour.").setMaxLength(60))
      .addStringOption((option) => option.setName("traits").setDescription("Up to three traits, separated by commas.").setMaxLength(120))
      .addStringOption((option) => option.setName("description").setDescription("A short description of the dragon.").setMaxLength(1000)))
    .addSubcommand((sub) => sub.setName("view").setDescription("View your dragon, another rider's dragon, or a dragon by name.")
      .addStringOption((option) => option.setName("dragon").setDescription("Dragon name."))
      .addUserOption((option) => option.setName("rider").setDescription("View this rider's bonded dragon.")))
    .addSubcommand((sub) => sub.setName("registry").setDescription("View all bonded and wild dragons."))
    .addSubcommand((sub) => sub.setName("history").setDescription("Read the recorded history of a dragon.")
      .addStringOption((option) => option.setName("dragon").setDescription("Dragon name.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("encounter").setDescription("Let your dragon encounter another bonded dragon.")
      .addUserOption((option) => option.setName("rider").setDescription("The other Dragonrider.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("event").setDescription("Record a dragon's appearance at an official server event.")
      .addStringOption((option) => option.setName("dragon").setDescription("Dragon name.").setRequired(true))
      .addStringOption((option) => option.setName("note").setDescription("What the dragon did or where it appeared.").setMaxLength(300).setRequired(true)))
    .addSubcommand((sub) => sub.setName("feed").setDescription("Feed your dragon for today's growth."))
    .addSubcommand((sub) => sub.setName("interact").setDescription("Spend a little time with your dragon."))
    .addSubcommand((sub) => sub.setName("train").setDescription("Train your young or older dragon."))
    .addSubcommand((sub) => sub.setName("fly").setDescription("Take a small or older dragon on a flight."))
    .addSubcommand((sub) => sub.setName("patrol").setDescription("Send a medium or older dragon on patrol."))
    .addSubcommand((sub) => sub.setName("hunt").setDescription("Take a medium or older dragon hunting; this also counts as feeding."))
    .addSubcommand((sub) => sub.setName("lair").setDescription("Set, view, or clear your dragon's lair.")
      .addStringOption((option) => option.setName("action").setDescription("What to do.").setRequired(true).addChoices({ name: "View", value: "view" }, { name: "Set / update", value: "set" }, { name: "Clear", value: "clear" }))
      .addStringOption((option) => option.setName("name").setDescription("Lair name.").setMaxLength(80))
      .addStringOption((option) => option.setName("location").setDescription("Where the lair is located.").setMaxLength(120))
      .addStringOption((option) => option.setName("description").setDescription("Describe the lair.").setMaxLength(500)))
    .addSubcommand((sub) => sub.setName("grant").setDescription("Grant special dragon eligibility to a member without the Dragonrider role.")
      .addUserOption((option) => option.setName("user").setDescription("Member receiving special dragon eligibility.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("revoke").setDescription("Revoke a member's special dragon eligibility.")
      .addUserOption((option) => option.setName("user").setDescription("Member losing special dragon eligibility.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("growth").setDescription("Add manual growth days to a dragon.")
      .addStringOption((option) => option.setName("dragon").setDescription("Dragon name.").setRequired(true))
      .addIntegerOption((option) => option.setName("days").setDescription("Growth days to add.").setMinValue(1).setMaxValue(3650).setRequired(true)))
    .addSubcommand((sub) => sub.setName("retire").setDescription("Release a bonded dragon permanently into the wild.")
      .addStringOption((option) => option.setName("dragon").setDescription("Dragon name.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("edit").setDescription("Edit a dragon's recorded details.")
      .addStringOption((option) => option.setName("dragon").setDescription("Dragon name.").setRequired(true))
      .addStringOption((option) => option.setName("name").setDescription("New name.").setMaxLength(60))
      .addStringOption((option) => option.setName("traits").setDescription("Up to three traits, separated by commas.").setMaxLength(120))
      .addStringOption((option) => option.setName("description").setDescription("New description.").setMaxLength(1000))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const invokerEligible = (await hasRequiredModeratorRole(interaction.guildId, interaction.member)) || (await isSpecialDragonRider(interaction.guildId, interaction.user.id));
      if (!invokerEligible && !canManage(interaction)) {
        await interaction.reply({ content: `${await moderatorRoleRequirementText(interaction.guildId, interaction.guild)} A specially granted rider may also create their own dragon.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const rider = interaction.options.getUser("rider", true);
      if (rider.id !== interaction.user.id && !canManage(interaction)) {
        await interaction.reply({ content: "You may create a dragon only for yourself. A server manager may create one for another Dragonrider.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (!(await riderEligible(interaction, rider.id))) {
        await interaction.reply({ content: "That member does not have the configured Dragonrider role or special dragon eligibility, so Grey Ghost cannot bond them to a dragon.", flags: MessageFlags.Ephemeral });
        return;
      }
      const bonded = await getRiderDragon(interaction.guildId, rider.id);
      if (bonded) {
        await interaction.reply({ content: `${rider} already has **${bonded.name}**. A Dragonrider may have only one dragon.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const retired = await getFormerRiderDragon(interaction.guildId, rider.id);
      if (retired) {
        const restored = await restoreRiderDragon(interaction.guildId, rider.id);
        await interaction.reply({ content: `**${retired.name}** was already recorded as ${rider}'s retired dragon. Their old bond has been restored instead of creating a second dragon.`, embeds: restored ? [dragonEmbed(restored)] : [] });
        return;
      }
      try {
        const dragon = await createDragon(interaction.guildId, {
          riderId: rider.id,
          name: interaction.options.getString("name", true),
          sex: interaction.options.getString("sex", true),
          primaryColor: interaction.options.getString("scales", true),
          eyeColor: interaction.options.getString("eyes", true),
          secondaryColor: interaction.options.getString("secondary") ?? undefined,
          wingColor: interaction.options.getString("wings") ?? undefined,
          flameColor: interaction.options.getString("flame") ?? undefined,
          hornColor: interaction.options.getString("horns") ?? undefined,
          traits: traitsFrom(interaction.options.getString("traits")),
          description: interaction.options.getString("description") ?? undefined,
        });
        await interaction.reply({ embeds: [dragonEmbed(dragon)] });
      } catch (error) {
        const code = (error as Error).message;
        await interaction.reply({ content: code === "DRAGON_NAME_TAKEN" ? "A dragon with that name is already in the registry." : code === "RIDER_ALREADY_HAS_DRAGON" ? "That Dragonrider already has a dragon in the registry and may have only one." : `The dragon could not be created: ${code}.`, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "grant" || sub === "revoke") {
      if (!canManage(interaction)) {
        await interaction.reply({ content: "Only a server manager may grant or revoke special dragon eligibility.", flags: MessageFlags.Ephemeral });
        return;
      }
      const user = interaction.options.getUser("user", true);
      if (user.bot) {
        await interaction.reply({ content: "Bots cannot be granted dragons.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === "revoke") {
        const changed = await revokeSpecialDragonRider(interaction.guildId, user.id);
        await interaction.reply({
          content: changed
            ? `${user}'s special dragon eligibility has been revoked. Any dragon they already have remains in the registry unless you retire it separately.`
            : `${user} did not have special dragon eligibility.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const newlyGranted = await grantSpecialDragonRider(interaction.guildId, user.id);
      const retired = await getFormerRiderDragon(interaction.guildId, user.id);
      const restored = retired
        ? await restoreRiderDragon(interaction.guildId, user.id, `<@${user.id}> received special dragon dispensation; their former bond with **${retired.name}** was restored.`)
        : undefined;
      const current = restored ?? await getRiderDragon(interaction.guildId, user.id);
      const settings = await getGuildSettings(interaction.guildId);
      const instruction = current
        ? `${user}, you have been granted special dragon eligibility in **${interaction.guild.name}**. Your bond with **${current.name}** is active again; use \`/dragon view\` and the dragon-care commands in the server.`
        : `${user}, you have been granted special dragon eligibility in **${interaction.guild.name}**. Return to the server and use \`/dragon create\` with yourself as the rider to configure your one dragon.`;

      let delivery = "DM";
      if (settings.dragonGrantChannelId) {
        const channel = interaction.guild.channels.cache.get(settings.dragonGrantChannelId) ?? await interaction.guild.channels.fetch(settings.dragonGrantChannelId).catch(() => null);
        if (channel?.isTextBased() && "send" in channel) {
          const sent = await channel.send({ content: instruction, allowedMentions: { users: [user.id] } }).then(() => true).catch(() => false);
          if (sent) delivery = `<#${settings.dragonGrantChannelId}>`;
          else await user.send(instruction.replace(`${user}, `, "")).catch(() => undefined);
        } else {
          await user.send(instruction.replace(`${user}, `, "")).catch(() => undefined);
        }
      } else {
        await user.send(instruction.replace(`${user}, `, "")).catch(() => undefined);
      }

      await interaction.reply({
        content: `${newlyGranted ? `${user} now has` : `${user} already had`} special dragon eligibility.${current ? ` **${current.name}** is bonded to them.` : " They may create one dragon for themselves."}
Notification destination: ${delivery}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "registry") {
      const dragons = await getDragons(interaction.guildId);
      const bonded = dragons.filter((dragon) => dragon.status === "bonded");
      const wild = dragons.filter((dragon) => dragon.status === "wild");
      const line = (dragon: Dragon) => `**#${dragon.id} · ${dragon.name}** — ${stageLabels[dragonStage(dragon)]}${dragon.riderId ? ` · <@${dragon.riderId}>` : dragon.formerRiderIds.length ? ` · formerly ${dragon.formerRiderIds.map((id) => `<@${id}>`).join(", ")}` : ""}`;
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8f564a).setTitle("🐉 The Dragon Registry").addFields(
        { name: `Bonded Dragons · ${bonded.length}`, value: bonded.length ? bonded.map(line).join("\n").slice(0, 1024) : "None" },
        { name: `Wild Dragons · ${wild.length}`, value: wild.length ? wild.map(line).join("\n").slice(0, 1024) : "None" },
      )] });
      return;
    }

    if (sub === "history") {
      const dragon = await findDragonByName(interaction.guildId, interaction.options.getString("dragon", true));
      if (!dragon) { await interaction.reply({ content: "That dragon was not found.", flags: MessageFlags.Ephemeral }); return; }
      const lines = dragon.history.slice(-12).map((entry) => `<t:${Math.floor(entry.at / 1000)}:d> · ${entry.text}`);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8f564a).setTitle(`History of ${dragon.name}`).setDescription(lines.join("\n").slice(0, 4096) || "No history has been recorded yet.")] });
      return;
    }

    if (sub === "growth") {
      if (!canManage(interaction)) { await interaction.reply({ content: "Only a server manager may add manual dragon growth.", flags: MessageFlags.Ephemeral }); return; }
      const dragon = await findDragonByName(interaction.guildId, interaction.options.getString("dragon", true));
      if (!dragon) { await interaction.reply({ content: "That dragon was not found.", flags: MessageFlags.Ephemeral }); return; }
      const days = interaction.options.getInteger("days", true);
      const result = await addDragonGrowthDays(interaction.guildId, dragon.id, days, interaction.user.id);
      const grew = result.previousStage !== result.newStage
        ? `
**Growth stage:** ${stageLabels[result.previousStage]} → **${stageLabels[result.newStage]}**`
        : `
**Growth stage:** ${stageLabels[result.newStage]}`;
      await interaction.reply({ content: `Added **${days} growth day${days === 1 ? "" : "s"}** to **${result.dragon.name}**.${grew}`, embeds: [dragonEmbed(result.dragon)] });
      return;
    }

    if (sub === "event") {
      if (!canManage(interaction)) { await interaction.reply({ content: "Only a server manager may record official dragon appearances.", flags: MessageFlags.Ephemeral }); return; }
      const dragon = await findDragonByName(interaction.guildId, interaction.options.getString("dragon", true));
      if (!dragon || dragon.status !== "bonded") { await interaction.reply({ content: "That dragon is not currently bonded.", flags: MessageFlags.Ephemeral }); return; }
      const note = interaction.options.getString("note", true);
      const updated = await recordDragonActivity(interaction.guildId, dragon.id, "events", `Official event appearance: ${note}`);
      await interaction.reply({ embeds: [dragonEmbed(updated)] });
      return;
    }

    if (sub === "encounter") {
      const own = await getRiderDragon(interaction.guildId, interaction.user.id);
      const otherRider = interaction.options.getUser("rider", true);
      const other = await getRiderDragon(interaction.guildId, otherRider.id);
      if (!own || !other) { await interaction.reply({ content: "Both riders need currently bonded dragons for an encounter.", flags: MessageFlags.Ephemeral }); return; }
      if (own.id === other.id) { await interaction.reply({ content: "Choose a different Dragonrider.", flags: MessageFlags.Ephemeral }); return; }
      const encounterLines = [
        `${own.name} and ${other.name} circle one another cautiously before settling within sight of each other.`,
        `${own.name} immediately decides that ${other.name}'s chosen resting place is deeply interesting.`,
        `${own.name} and ${other.name} exchange low rumbles before parting without incident.`,
        `${own.name} approaches ${other.name} with obvious curiosity; neither seems inclined to surrender the better patch of ground.`,
      ];
      const text = randomLine(encounterLines);
      await recordDragonEncounter(interaction.guildId, own.id, other.id, text);
      await interaction.reply(`🐉 **Dragon Encounter**\n${text}`);
      return;
    }

    if (sub === "view") {
      const dragon = await resolveDragon(interaction, true);
      if (!dragon) { await interaction.reply({ content: "No matching dragon was found in the registry.", flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [dragonEmbed(dragon)] });
      return;
    }

    if (sub === "retire" || sub === "edit") {
      if (!canManage(interaction)) { await interaction.reply({ content: "Only a server manager may alter registry records.", flags: MessageFlags.Ephemeral }); return; }
      const dragon = await findDragonByName(interaction.guildId, interaction.options.getString("dragon", true));
      if (!dragon) { await interaction.reply({ content: "That dragon was not found.", flags: MessageFlags.Ephemeral }); return; }
      if (sub === "retire") {
        const retired = await retireDragon(interaction.guildId, dragon.id);
        await interaction.reply({ embeds: [dragonEmbed(retired)] });
        return;
      }
      try {
        const updated = await editDragon(interaction.guildId, dragon.id, {
          name: interaction.options.getString("name") ?? undefined,
          traits: interaction.options.getString("traits") !== null ? traitsFrom(interaction.options.getString("traits")) : undefined,
          description: interaction.options.getString("description") ?? undefined,
        });
        await interaction.reply({ embeds: [dragonEmbed(updated)] });
      } catch (error) {
        await interaction.reply({ content: (error as Error).message === "DRAGON_NAME_TAKEN" ? "That dragon name is already recorded." : "The dragon record could not be edited.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    const dragon = await getRiderDragon(interaction.guildId, interaction.user.id);
    if (!dragon) { await interaction.reply({ content: "You do not currently have a bonded dragon.", flags: MessageFlags.Ephemeral }); return; }

    if (sub === "lair") {
      const action = interaction.options.getString("action", true);
      if (action === "view") {
        await interaction.reply({ embeds: [dragonEmbed(dragon)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (action === "clear") {
        const updated = await setDragonLair(interaction.guildId, dragon.id, { clear: true });
        await interaction.reply({ content: `**${updated.name}** no longer has a recorded lair.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const name = interaction.options.getString("name") ?? undefined;
      const location = interaction.options.getString("location") ?? undefined;
      const description = interaction.options.getString("description") ?? undefined;
      if (!name && !location && !description) { await interaction.reply({ content: "Give Grey Ghost at least a lair name, location, or description.", flags: MessageFlags.Ephemeral }); return; }
      const updated = await setDragonLair(interaction.guildId, dragon.id, { name, location, description });
      await interaction.reply({ content: `Recorded **${updated.name}**'s lair.`, embeds: [dragonEmbed(updated)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "feed") {
      const result = await feedDragon(interaction.guildId, dragon.id);
      if (result.alreadyFed) { await interaction.reply({ content: `${result.dragon.name} has already been fed today.`, flags: MessageFlags.Ephemeral }); return; }
      const next = nextDragonGrowth(result.dragon);
      const progress = next ? `\n**Growth:** ${result.dragon.fedDays}/${next.fedDays} fed days · ${dragonAgeDays(result.dragon)}/${next.ageDays} age days toward **${stageLabels[next.stage]}**.` : "\n**Growth:** Fully grown.";
      await interaction.reply(`🐉 **${result.dragon.name} has been fed.** ${randomLine(["They settle contentedly after the meal.", "They make short work of the offering.", "They inspect the meal with suspicion, then eat every bit of it."])}${result.grew ? `\n\n**${result.dragon.name} has grown to ${stageLabels[dragonStage(result.dragon)]}.**` : ""}${progress}`);
      return;
    }

    const stage = dragonStage(dragon);
    const rank = DRAGON_GROWTH.findIndex((entry) => entry.stage === stage);
    const required: Record<string, number> = { interact: 0, train: 1, fly: 2, patrol: 3, hunt: 3 };
    if (rank < (required[sub] ?? 0)) { await interaction.reply({ content: `${dragon.name} is still too young for that. Current size: **${stageLabels[stage]}**.`, flags: MessageFlags.Ephemeral }); return; }

    try {
      if (sub === "hunt") {
        await recordDragonActivity(interaction.guildId, dragon.id, "hunts", `Completed a hunt with <@${interaction.user.id}>.`);
        const fed = await feedDragon(interaction.guildId, dragon.id);
        await interaction.reply(`🐉 **${dragon.name}** ${randomLine(behavior.hunt)}${fed.alreadyFed ? "" : " The hunt also counts as today's feeding."}`);
        return;
      }
      const key = sub === "interact" ? "interactions" : sub === "train" ? "trainings" : sub === "fly" ? "flights" : "patrols";
      await recordDragonActivity(interaction.guildId, dragon.id, key, `${sub[0]!.toUpperCase()}${sub.slice(1)} with <@${interaction.user.id}>.`);
      await interaction.reply(`🐉 **${dragon.name}** ${randomLine(behavior[sub as keyof typeof behavior])}`);
    } catch (error) {
      await interaction.reply({ content: (error as Error).message === "DRAGON_ACTIVITY_USED_TODAY" ? `That ${sub} has already been completed today.` : `The dragon activity could not be completed: ${(error as Error).message}.`, flags: MessageFlags.Ephemeral });
    }
  },
};
