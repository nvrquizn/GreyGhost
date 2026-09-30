import { EmbedBuilder, PermissionFlagsBits, type GuildMember } from "discord.js";

const line = (name: string, description: string): string => `\`/${name}\` · \`?${name}\` — ${description}`;
const slashLine = (name: string, description: string): string => `\`/${name}\` — ${description}`;

type HelpSection = {
  title: string;
  lines: string[];
};

function sectionEmbed(section: HelpSection, page: number, total: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xb8c2cc)
    .setTitle(`Grey Ghost · Command Roster · ${section.title}`)
    .setDescription(section.lines.join("\n"))
    .setFooter({ text: `Version 0.32.0 · Page ${page}/${total} · Slash and ? prefix commands` });
}

export function renderHelpPages(member: GuildMember | null, isModmailStaff = false): EmbedBuilder[] {
  const permissions = member?.permissions;
  const manager = permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
  const roleManager = manager || (permissions?.has(PermissionFlagsBits.ManageRoles) ?? false);
  const messageManager = manager || (permissions?.has(PermissionFlagsBits.ManageMessages) ?? false);
  const eventManager = manager || (permissions?.has(PermissionFlagsBits.ManageEvents) ?? false);
  const canModerate = manager || (permissions?.has(PermissionFlagsBits.ModerateMembers) ?? false);
  const canKick = manager || (permissions?.has(PermissionFlagsBits.KickMembers) ?? false);
  const canBan = manager || (permissions?.has(PermissionFlagsBits.BanMembers) ?? false);
  const canManageChannels = manager || (permissions?.has(PermissionFlagsBits.ManageChannels) ?? false);

  const sections: HelpSection[] = [
    {
      title: "General",
      lines: [
        "Every command may be invoked with either `/` or `?`. Put text containing spaces inside quotation marks.",
        "",
        line("help", "Show the commands available to you."),
        line("ping", "Check whether Grey Ghost is awake."),
        line("about", "Learn about Grey Ghost."),
        line("remindme", "Set, list, or cancel personal reminders."),
        line("cooldowns", "View every personal cooldown and what is ready now."),
        line("level", "View your level, XP progress, or the level leaderboard."),
        line("userinfo", "View information about a server member."),
        line("serverinfo", "View information about this server."),
        line("rolemembers", "List members who have a selected role."),
        line("whohas", "Find members with a selected permission."),
        line("spoiler", "Post concealed spoiler text."),
        line("petition submit", "Submit an idea for a public Realm vote."),
        slashLine("staffapply", "Open the private staff application form."),
      ],
    },
    {
      title: "Realm & Community",
      lines: [
        line("profile", "View or edit profiles and wishlists."),
        line("collection progress", "Check collection-title progress."),
        line("stats view", "View Realm statistics."),
        line("housepoints standings", "View House standings and history."),
        line("lore", "Browse the ASOIAF directory."),
        line("chronicle view", "Read the Realm's permanent history."),
        line("season status", "View the active House season and its standings."),
        line("season history", "Review completed House seasons and winners."),
        line("housequest list", "View active and recent House quests."),
        line("housechronicle view", "Read a House's permanent chronicle."),
        line("achievements view", "View a member's earned achievements."),
        line("renown", "View permanent Realm Renown and standings."),
        line("heirloom", "View named weapons and heirlooms."),
        line("prize", "Claim pending Admirer-role event prizes."),
      ],
    },
    {
      title: "Activities & Competition",
      lines: [
        line("joust", "Enter, withdraw from, or inspect a joust."),
        line("melee", "Enter or inspect a grand melee."),
        line("race", "Enter or inspect a horse race."),
        line("hunt", "Go hunting for coin, Renown, and horse experience."),
        line("tavern", "Play no-wager tavern mini-games for small fixed prizes."),
        line("festival", "Join seasonal festivals, complete objectives, and spend festival tokens."),
        line("expedition", "Join and continue Realm expeditions."),
        line("duel", "Challenge another character; up to five completed duels per week."),
        line("trade", "Trade coins and eligible inventory items with another character."),
        line("dragon", "View the Dragon Registry or care for a bonded dragon."),
      ],
    },
    {
      title: "Progression & Equipment",
      lines: [
        line("character", "Create, view, or rename a Realm character."),
        line("daily", "Claim daily coin or train Health, Damage, or Resistance."),
        line("coin", "Check your coin purse and transaction history."),
        line("shop", "Browse mounts and armour for sale."),
        line("buy", "Purchase equipment with coin."),
        line("inventory", "View all equipment you own."),
        line("stable", "View, customize, and train your owned horses."),
        line("armoury", "View your owned armour."),
        line("loadout", "Equip and inspect your mount and armour."),
        line("recovery", "Check injuries or use bandages."),
        line("spoils", "Inspect or resolve eligible competitive-joust spoils."),
      ],
    },
  ];

  if (eventManager) {
    sections.push({
      title: "Event Hosting",
      lines: [
        line("event", "Create and manage events with RSVP tracking."),
        line("quiz", "Create and host live quizzes."),
        line("joust", "Create, publish, and run jousting tournaments."),
        line("melee", "Create, publish, and run grand melees."),
        line("race", "Create, publish, and run horse races."),
        line("festival", "Create, publish, and conclude seasonal festivals."),
      ],
    });
  }

  const staffTools: string[] = [];
  if (manager) staffTools.push(
    line("setup", "Configure and diagnose server features."),
    line("testwelcome", "Preview the configured welcome message."),
    line("backup", "Create or restore server data backups."),
    line("directory", "Manage directory entries."),
    line("stats", "Publish or refresh the statistics dashboard."),
    line("housepoints", "Award or deduct audited House Points."),
    line("petition status", "Make the final decision on a petition (owner only)."),
    line("chronicle record", "Write a major event into the Chronicles."),
    line("season", "Start or end House Point seasons."),
    line("housequest", "Create, progress, or cancel House quests."),
    line("housechronicle add", "Add a special entry to a House Chronicle."),
    line("achievements", "Grant or revoke special achievements."),
    line("level", "Administer XP, exclusions, and level reward roles."),
  );
  if (roleManager) staffTools.push(
    line("selfroles", "Configure and publish self-role panels."),
    line("collection", "Configure and synchronize collection titles."),
  );
  if (messageManager) staffTools.push(
    line("embed", "Publish a formatted information embed."),
    line("sticky", "Keep a rules or information message at the bottom of a channel."),
  );
  if (staffTools.length) sections.push({ title: "Staff Tools", lines: staffTools });

  const moderation: string[] = [];
  if (canModerate) moderation.push(
    line("warn", "Issue a recorded warning."),
    line("strike", "Issue a recorded strike."),
    line("timeout", "Apply a temporary timeout."),
    line("untimeout", "Remove an active timeout."),
    line("warnings", "View a member's warning history."),
    line("case", "View a moderation case by number."),
    line("modlogs", "View a member's complete moderation history."),
    line("note", "Add a private staff note about a member."),
    line("notes", "View private staff notes about a member."),
    line("moderation", "Edit, void, attach evidence to, and annotate cases."),
  );
  if (canKick) moderation.push(line("kick", "Remove a member from the server."));
  if (canBan) moderation.push(line("ban", "Ban a user."), line("softban", "Ban then immediately unban to remove recent messages."), line("unban", "Remove a ban by user ID."));
  if (messageManager) moderation.push(line("purge", "Bulk-delete recent messages."));
  if (canManageChannels) moderation.push(
    line("slowmode", "Change the current channel's slowmode."),
    line("lock", "Lock the current channel."),
    line("unlock", "Unlock the current channel."),
  );
  if (isModmailStaff || manager) moderation.push(line("modmail", "Manage the current private ticket."));
  if (isModmailStaff || manager) moderation.push(line("council propose", "Submit a private council proposal."));
  if (moderation.length) sections.push({ title: "Moderation", lines: moderation });

  return sections.map((section, index) => sectionEmbed(section, index + 1, sections.length));
}

/** Backward-compatible first-page renderer for any older internal callers. */
export function renderHelp(member: GuildMember | null, isModmailStaff = false): EmbedBuilder {
  const firstPage = renderHelpPages(member, isModmailStaff)[0];
  if (!firstPage) {
    throw new Error("Grey Ghost could not render the command roster.");
  }
  return firstPage;
}
