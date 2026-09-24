import {
  EmbedBuilder,
  Events,
  type Client,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import { getGuildSettings } from "../services/guild-settings.js";

async function fetchTextChannel(client: Client, channelId?: string) {
  if (!channelId) return undefined;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isSendable() ? channel : undefined;
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

async function sendJoinLog(member: GuildMember, channelId?: string) {
  const channel = await fetchTextChannel(member.client, channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x82a67d)
    .setAuthor({ name: "Member joined", iconURL: member.user.displayAvatarURL() })
    .setDescription(`${member} entered the server.`)
    .addFields(
      { name: "User", value: member.user.tag, inline: true },
      { name: "User ID", value: member.id, inline: true },
      {
        name: "Account created",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      { name: "Member count", value: member.guild.memberCount.toString(), inline: true },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function sendLeaveLog(member: GuildMember | PartialGuildMember, channelId?: string) {
  const channel = await fetchTextChannel(member.client, channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x8f4b4b)
    .setAuthor({ name: "Member left", iconURL: member.user.displayAvatarURL() })
    .setDescription(`**${member.user.tag}** left the server.`)
    .addFields(
      { name: "User ID", value: member.id, inline: true },
      { name: "Member count", value: member.guild.memberCount.toString(), inline: true },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export function registerMemberEvents(client: Client): void {
  client.on(Events.GuildMemberAdd, async (member) => {
    const settings = await getGuildSettings(member.guild.id);

    if (settings.newcomerRoleId) {
      await member.roles.add(settings.newcomerRoleId, "Grey Ghost newcomer role").catch((error) => {
        console.error(`Could not assign newcomer role in ${member.guild.id}:`, error);
      });
    }

    await sendWelcomeMessage(member, settings.welcomeChannelId).catch((error) => {
      console.error(`Could not send welcome in ${member.guild.id}:`, error);
    });

    await sendJoinLog(member, settings.logChannelId).catch((error) => {
      console.error(`Could not send join log in ${member.guild.id}:`, error);
    });
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const settings = await getGuildSettings(member.guild.id);
    await sendLeaveLog(member, settings.logChannelId).catch((error) => {
      console.error(`Could not send leave log in ${member.guild.id}:`, error);
    });
  });
}
