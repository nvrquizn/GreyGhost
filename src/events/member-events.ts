import {
  EmbedBuilder,
  Events,
  type Client,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import {
  deleteMemberInviteRecord,
  getGuildSettings,
  getMemberInviteRecord,
  saveMemberInviteRecord,
  type MemberInviteRecord,
} from "../services/guild-settings.js";
import { resolveUsedInvite } from "./invite-tracking.js";

function shorten(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

async function fetchTextChannel(client: Client, channelId?: string) {
  if (!channelId) return undefined;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isSendable() ? channel : undefined;
}

function inviteDescription(record: MemberInviteRecord | undefined): string {
  if (!record || record.source === "unknown") return "Unknown or unavailable";
  if (record.source === "vanity") return record.code ? `Vanity URL · \`${record.code}\`` : "Server vanity URL";
  return record.code ? `[\`${record.code}\`](https://discord.gg/${record.code})` : "Invite code unavailable";
}

function inviterDescription(record: MemberInviteRecord | undefined): string {
  if (record?.inviterId) return `<@${record.inviterId}>\n\`${record.inviterId}\``;
  return record?.source === "vanity" ? "Server vanity URL" : "Unknown or unavailable";
}

function durationBetween(start: number, end: number): string {
  const seconds = Math.max(0, Math.floor((end - start) / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const parts = [days ? `${days}d` : "", hours ? `${hours}h` : "", minutes ? `${minutes}m` : ""].filter(Boolean);
  return parts.join(" ") || "Less than one minute";
}

function departureRoles(member: GuildMember | PartialGuildMember): string {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((left, right) => right.position - left.position)
    .map((role) => role.toString());
  return roles.length ? shorten(roles.join(", "), 1_000) : "None";
}

export async function sendWelcomeMessage(member: GuildMember, channelId?: string): Promise<boolean> {
  const channel = await fetchTextChannel(member.client, channelId);
  if (!channel) return false;
  await channel.send({
    content: `${member} has entered the gates of King's Landing.`,
    allowedMentions: { users: [member.id] },
  });
  return true;
}

async function sendJoinLog(
  member: GuildMember,
  channelId: string | undefined,
  invite: MemberInviteRecord,
): Promise<void> {
  const channel = await fetchTextChannel(member.client, channelId);
  if (!channel) return;
  const created = Math.floor(member.user.createdTimestamp / 1_000);
  const joined = Math.floor((member.joinedTimestamp ?? invite.joinedAt) / 1_000);

  const embed = new EmbedBuilder()
    .setColor(0x82a67d)
    .setAuthor({ name: "Member joined", iconURL: member.user.displayAvatarURL() })
    .setDescription(`${member} entered the server.`)
    .addFields(
      { name: "User", value: `${member.user.tag}\n${member}`, inline: true },
      { name: "User ID", value: `\`${member.id}\``, inline: true },
      { name: "Member count", value: member.guild.memberCount.toString(), inline: true },
      { name: "Account created", value: `<t:${created}:F>\n<t:${created}:R>`, inline: true },
      { name: "Joined server", value: `<t:${joined}:F>\n<t:${joined}:R>`, inline: true },
      { name: "Invite used", value: inviteDescription(invite), inline: true },
      { name: "Invite created by", value: inviterDescription(invite), inline: true },
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function sendLeaveLog(
  member: GuildMember | PartialGuildMember,
  channelId: string | undefined,
  invite: MemberInviteRecord | undefined,
): Promise<void> {
  const channel = await fetchTextChannel(member.client, channelId);
  if (!channel) return;
  const joinedAt = member.joinedTimestamp ?? invite?.joinedAt;
  const embed = new EmbedBuilder()
    .setColor(0x8f4b4b)
    .setAuthor({ name: "Member left", iconURL: member.user.displayAvatarURL() })
    .setDescription(`**${member.user.tag}** left the server.`)
    .addFields(
      { name: "User", value: `${member.user.tag}\n\`${member.id}\``, inline: true },
      { name: "Member count", value: member.guild.memberCount.toString(), inline: true },
      { name: "Time in server", value: joinedAt ? durationBetween(joinedAt, Date.now()) : "Unknown", inline: true },
      { name: "Joined server", value: joinedAt ? `<t:${Math.floor(joinedAt / 1_000)}:F>\n<t:${Math.floor(joinedAt / 1_000)}:R>` : "Unknown", inline: true },
      { name: "Invite used", value: inviteDescription(invite), inline: true },
      { name: "Invite created by", value: inviterDescription(invite), inline: true },
      { name: "Roles at departure", value: departureRoles(member) },
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export function registerMemberEvents(client: Client): void {
  client.on(Events.GuildMemberAdd, (member) => {
    const handleJoin = async () => {
      const invite = await resolveUsedInvite(member.guild);
      await saveMemberInviteRecord(member.guild.id, member.id, invite);
      const settings = await getGuildSettings(member.guild.id);

      if (settings.newcomerRoleId) {
        await member.roles.add(settings.newcomerRoleId, "Grey Ghost newcomer role").catch((error) => {
          console.error(`Could not assign newcomer role in ${member.guild.id}:`, error);
        });
      }

      await sendWelcomeMessage(member, settings.welcomeChannelId).catch((error) => {
        console.error(`Could not send welcome in ${member.guild.id}:`, error);
      });

      await sendJoinLog(member, settings.serverLogChannelId ?? settings.logChannelId, invite).catch((error) => {
        console.error(`Could not send join log in ${member.guild.id}:`, error);
      });
    };
    void handleJoin().catch((error) => console.error(`Could not process member join in ${member.guild.id}:`, error));
  });

  client.on(Events.GuildMemberRemove, (member) => {
    const handleLeave = async () => {
      const settings = await getGuildSettings(member.guild.id);
      const invite = await getMemberInviteRecord(member.guild.id, member.id);
      await sendLeaveLog(member, settings.serverLogChannelId ?? settings.logChannelId, invite).catch((error) => {
        console.error(`Could not send leave log in ${member.guild.id}:`, error);
      });
      await deleteMemberInviteRecord(member.guild.id, member.id);
    };
    void handleLeave().catch((error) => console.error(`Could not process member leave in ${member.guild.id}:`, error));
  });
}
