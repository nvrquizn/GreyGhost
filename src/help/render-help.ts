import { EmbedBuilder, PermissionFlagsBits, type GuildMember } from "discord.js";

const line = (name: string, description: string): string => `\`/${name}\` · \`?${name}\` — ${description}`;

export function renderHelp(member: GuildMember | null, isModmailStaff = false): EmbedBuilder {
  const permissions = member?.permissions;
  const manager = permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
  const roleManager = manager || (permissions?.has(PermissionFlagsBits.ManageRoles) ?? false);
  const messageManager = manager || (permissions?.has(PermissionFlagsBits.ManageMessages) ?? false);
  const eventManager = manager || (permissions?.has(PermissionFlagsBits.ManageEvents) ?? false);
  const canModerate = manager || (permissions?.has(PermissionFlagsBits.ModerateMembers) ?? false);
  const canKick = manager || (permissions?.has(PermissionFlagsBits.KickMembers) ?? false);
  const canBan = manager || (permissions?.has(PermissionFlagsBits.BanMembers) ?? false);
  const canManageChannels = manager || (permissions?.has(PermissionFlagsBits.ManageChannels) ?? false);

  const embed = new EmbedBuilder()
    .setColor(0xb8c2cc)
    .setTitle("Grey Ghost · Command Roster")
    .setDescription("Every command may be invoked with either `/` or `?`. Put text containing spaces inside quotation marks.")
    .addFields(
      {
        name: "General",
        value: [
          line("help", "Show the commands available to you."),
          line("ping", "Check whether Grey Ghost is awake."),
          line("about", "Learn about Grey Ghost."),
          line("suggest", "Submit a server suggestion."),
        ].join("\n"),
      },
      {
        name: "Realm & Community",
        value: [
          line("profile", "View or edit profiles and wishlists."),
          line("collection progress", "Check collection-title progress."),
          line("stats view", "View Realm statistics."),
          line("housepoints standings", "View House standings and history."),
          line("lore", "Browse the ASOIAF directory."),
          line("joust", "Enter, withdraw from, or inspect a joust."),
        ].join("\n"),
      },
    );

  if (eventManager) embed.addFields({
    name: "Events",
    value: [
      line("quiz", "Create and host live quizzes."),
      line("joust", "Create, publish, and run jousting tournaments."),
    ].join("\n"),
  });

  const staffTools: string[] = [];
  if (manager) staffTools.push(
    line("setup", "Configure and diagnose server features."),
    line("testwelcome", "Preview the configured welcome message."),
    line("backup", "Create or restore server data backups."),
    line("directory", "Manage directory entries."),
    line("stats", "Publish or refresh the statistics dashboard."),
    line("housepoints", "Award or deduct audited House Points."),
  );
  if (roleManager) staffTools.push(
    line("selfroles", "Configure and publish self-role panels."),
    line("collection", "Configure and synchronize collection titles."),
  );
  if (messageManager) staffTools.push(
    line("embed", "Publish a formatted information embed."),
    line("suggestion status", "Review and resolve suggestions."),
  );
  if (staffTools.length) embed.addFields({ name: "Staff Tools", value: staffTools.join("\n").slice(0, 1024) });

  const moderation: string[] = [];
  if (canModerate) moderation.push(
    line("warn", "Issue a recorded warning."),
    line("strike", "Issue a recorded strike."),
    line("timeout", "Apply a temporary timeout."),
    line("untimeout", "Remove an active timeout."),
    line("moderation", "Inspect, edit, void, and annotate cases."),
  );
  if (canKick) moderation.push(line("kick", "Remove a member from the server."));
  if (canBan) moderation.push(
    line("ban", "Ban a user."),
    line("unban", "Remove a ban by user ID."),
  );
  if (messageManager) moderation.push(line("purge", "Bulk-delete recent messages."));
  if (canManageChannels) moderation.push(
    line("slowmode", "Change the current channel's slowmode."),
    line("lock", "Lock the current channel."),
    line("unlock", "Unlock the current channel."),
  );
  if (isModmailStaff || manager) moderation.push(line("modmail", "Manage the current private ticket."));
  if (moderation.length) {
    embed.addFields({ name: "Moderation", value: moderation.slice(0, 7).join("\n") });
    if (moderation.length > 7) {
      embed.addFields({ name: "Moderation · Continued", value: moderation.slice(7).join("\n") });
    }
  }

  return embed
    .setFooter({ text: "Version 0.15.1 · Slash and ? prefix commands" });
}
