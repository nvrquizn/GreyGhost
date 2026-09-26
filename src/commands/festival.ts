import { recordHouseEventPodium } from "../housechronicles/runtime.js";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildSettings } from "../services/guild-settings.js";
import { createPrizePackage, finalizePrizePackage, finalizedPrizeText, isApprovedAdmirerRole, prizeAnnouncementText, type SecondPrizeMode } from "../events-manager/prizes.js";
import { changeRenown, getEconomyPlayer, grantCosmetic } from "../economy/store.js";
import { getRiderDragon, recordDragonActivity } from "../dragons/store.js";
import {
  FESTIVAL_SHOP,
  addFestivalDragon,
  cancelFestival,
  createFestival,
  festivalThemeSchema,
  finishFestival,
  getFestival,
  joinFestival,
  listFestivals,
  publishFestival,
  setFestivalAnnouncementMessage,
  spendFestivalTokens,
  type Festival,
} from "../festivals/store.js";

function festivalEmbed(f: Festival) {
  const participants = Object.values(f.participants).sort((a,b)=>b.points-a.points);
  return new EmbedBuilder().setColor(0xb87333).setTitle(`Festival #${f.id} · ${f.name}`)
    .setDescription(f.description || "The realm gathers in celebration.")
    .addFields(
      { name: "Theme", value: f.theme, inline: true },
      { name: "Status", value: f.status, inline: true },
      { name: "Participants", value: String(participants.length), inline: true },
      ...(f.endsAt ? [{ name: "Ends", value: `<t:${Math.floor(f.endsAt/1000)}:R>`, inline: true }] : []),
      { name: "Standings", value: participants.slice(0,10).map((p,i)=>`${i+1}. <@${p.userId}> — **${p.points}** pts · ${p.tokens} tokens`).join("\n") || "No entrants yet." },
      { name: "Dragons attending", value: f.attendingDragonIds.length ? String(f.attendingDragonIds.length) : "None", inline: true },
    );
}

export const festivalCommand: Command = {
  data: new SlashCommandBuilder().setName("festival").setDescription("Host and join seasonal festivals.").setDMPermission(false)
    .addSubcommand((s)=>s.setName("create").setDescription("Create a draft seasonal festival.")
      .addStringOption(o=>o.setName("name").setDescription("Festival name.").setMaxLength(100).setRequired(true))
      .addStringOption(o=>o.setName("theme").setDescription("Festival theme.").setRequired(true).addChoices(
        {name:"Autumn",value:"autumn"},{name:"Winter",value:"winter"},{name:"Spring",value:"spring"},{name:"Midsummer",value:"midsummer"},{name:"Custom",value:"custom"}))
      .addStringOption(o=>o.setName("description").setDescription("Festival description.").setMaxLength(1500)))
    .addSubcommand((s)=>s.setName("publish").setDescription("Publish a draft festival.")
      .addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true))
      .addIntegerOption(o=>o.setName("days").setDescription("How many days the festival lasts.").setMinValue(1).setMaxValue(14).setRequired(true))
      .addStringOption(o=>o.setName("second-reward").setDescription("Override second-place reward method.").addChoices({name:"Auto",value:"auto"},{name:"Player chooses",value:"player"},{name:"Grey Ghost chooses",value:"ghost"},{name:"Shared",value:"shared"}))
      .addRoleOption(o=>o.setName("second-admirer").setDescription("Preset second-place Admirer role."))
      .addRoleOption(o=>o.setName("third-admirer").setDescription("Preset third-place Admirer role.")))
    .addSubcommand((s)=>s.setName("join").setDescription("Join an open festival.").addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true)))
    .addSubcommand((s)=>s.setName("status").setDescription("View a festival.").addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true)))
    .addSubcommand((s)=>s.setName("standings").setDescription("View Festival Point standings.").addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true)))
    .addSubcommand((s)=>s.setName("objectives").setDescription("View your festival objectives.").addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true)))
    .addSubcommand((s)=>s.setName("shop").setDescription("View the seasonal festival shop."))
    .addSubcommand((s)=>s.setName("buy").setDescription("Spend festival tokens on a keepsake.")
      .addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true))
      .addStringOption(o=>o.setName("item").setDescription("Festival keepsake.").setRequired(true).addChoices(...FESTIVAL_SHOP.map(x=>({name:`${x.name} — ${x.cost} tokens`,value:x.id})))))
    .addSubcommand((s)=>s.setName("dragon").setDescription("Register your bonded dragon as attending.").addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true)))
    .addSubcommand((s)=>s.setName("end").setDescription("Close a festival and crown the top three.").addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true)))
    .addSubcommand((s)=>s.setName("cancel").setDescription("Cancel an unfinished festival.").addIntegerOption(o=>o.setName("festival-id").setDescription("Festival number.").setMinValue(1).setRequired(true)))
    .addSubcommand((s)=>s.setName("history").setDescription("View past seasonal festivals.")),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "create") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) { await interaction.reply({content:"You need **Manage Events** to create a festival.",flags:MessageFlags.Ephemeral}); return; }
      const f = await createFestival(interaction.guildId,{name:interaction.options.getString("name",true),theme:festivalThemeSchema.parse(interaction.options.getString("theme",true)),description:interaction.options.getString("description")??undefined,hostId:interaction.user.id});
      await interaction.reply({content:`Created draft festival **#${f.id} · ${f.name}**.`,flags:MessageFlags.Ephemeral}); return;
    }
    if (sub === "shop") {
      await interaction.reply({embeds:[new EmbedBuilder().setColor(0xb87333).setTitle("Seasonal Festival Shop").setDescription(FESTIVAL_SHOP.map(x=>`**${x.name}** — ${x.cost} tokens\n${x.description}`).join("\n\n")).setFooter({text:"Unused festival tokens expire when that festival ends."})],flags:MessageFlags.Ephemeral}); return;
    }
    if (sub === "history") {
      const rows=(await listFestivals(interaction.guildId)).filter(f=>f.status==="finished").slice(0,10);
      await interaction.reply({embeds:[new EmbedBuilder().setColor(0x8b6f47).setTitle("Festival Archive").setDescription(rows.map(f=>`**#${f.id} · ${f.name}** — ${f.podiumIds.map((id,i)=>`${["🥇","🥈","🥉"][i]} <@${id}>`).join(" · ")||"No podium"}`).join("\n")||"No festivals have finished yet.")],flags:MessageFlags.Ephemeral}); return;
    }
    const id=interaction.options.getInteger("festival-id",true); const festival=await getFestival(interaction.guildId,id);
    if(!festival){await interaction.reply({content:"That festival was not found.",flags:MessageFlags.Ephemeral});return;}
    const canHost=interaction.user.id===festival.hostId||interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    if(sub==="join"){await joinFestival(interaction.guildId,id,interaction.user.id);await interaction.reply({content:`You joined **${festival.name}**.`,flags:MessageFlags.Ephemeral});return;}
    if(sub==="status"||sub==="standings"){await interaction.reply({embeds:[festivalEmbed(festival)]});return;}
    if(sub==="objectives"){
      const p=festival.participants[interaction.user.id]; if(!p){await interaction.reply({content:"Join the festival first.",flags:MessageFlags.Ephemeral});return;}
      const lines=festival.objectives.map(o=>`${p.completedObjectiveIds.includes(o.id)?"✅":"⬜"} **${o.label}** — ${Math.min(p.progress[o.id]??0,o.target)}/${o.target} · +${o.points} pts · +${o.tokens} tokens`);
      await interaction.reply({embeds:[new EmbedBuilder().setColor(0xb87333).setTitle(`${festival.name} · Objectives`).setDescription(lines.join("\n")).setFooter({text:`You have ${p.points} Festival Points and ${p.tokens} tokens.`})],flags:MessageFlags.Ephemeral});return;
    }
    if(sub==="buy"){
      const item=FESTIVAL_SHOP.find(x=>x.id===interaction.options.getString("item",true))!;
      const player=await getEconomyPlayer(interaction.guildId,interaction.user.id);
      if(!player){await interaction.reply({content:"Create your Realm character first with `/character create`.",flags:MessageFlags.Ephemeral});return;}
      if(player.cosmetics.includes(`festival:${item.id}`)){await interaction.reply({content:`You already own **${item.name}**.`,flags:MessageFlags.Ephemeral});return;}
      try{await spendFestivalTokens(interaction.guildId,id,interaction.user.id,item.cost);await grantCosmetic(interaction.guildId,interaction.user.id,`festival:${item.id}`);await interaction.reply({content:`You purchased **${item.name}** for **${item.cost} festival tokens**.`,flags:MessageFlags.Ephemeral});}catch(e){await interaction.reply({content:(e as Error).message==="NOT_ENOUGH_FESTIVAL_TOKENS"?"You do not have enough festival tokens.":"You cannot purchase that right now.",flags:MessageFlags.Ephemeral});}return;
    }
    if(sub==="dragon"){
      const dragon=await getRiderDragon(interaction.guildId,interaction.user.id); if(!dragon){await interaction.reply({content:"You do not have a bonded dragon to bring to the festival.",flags:MessageFlags.Ephemeral});return;}
      await addFestivalDragon(interaction.guildId,id,dragon.id); await recordDragonActivity(interaction.guildId,dragon.id,"events",`${dragon.name} attended ${festival.name}.`).catch(() => undefined); await interaction.reply({content:`🐉 **${dragon.name}** is now recorded as attending **${festival.name}**. Dragon attendance gives no Festival Points.`,flags:MessageFlags.Ephemeral});return;
    }
    if(!canHost){await interaction.reply({content:"Only the festival host or a server manager may do that.",flags:MessageFlags.Ephemeral});return;}
    if(sub==="publish"){
      const settings=await getGuildSettings(interaction.guildId); if(!settings.eventAnnouncementChannelId||!settings.eventChatChannelId){await interaction.reply({content:"Configure both `/setup event-channel` and `/setup event-chat` first.",flags:MessageFlags.Ephemeral});return;}
      const sr=interaction.options.getRole("second-admirer"), tr=interaction.options.getRole("third-admirer"); if((sr&&!isApprovedAdmirerRole(sr))||(tr&&!isApprovedAdmirerRole(tr))){await interaction.reply({content:"Preset prizes must be approved Admirer roles.",flags:MessageFlags.Ephemeral});return;}
      const active=(await listFestivals(interaction.guildId)).find((entry)=>entry.status==="open"&&(!entry.endsAt||entry.endsAt>Date.now())&&entry.id!==id);
      if(active){await interaction.reply({content:`**${active.name}** is already open. End or cancel it before publishing another seasonal festival.`,flags:MessageFlags.Ephemeral});return;}
      const pack=await createPrizePackage(interaction.guild,{kind:"festival",eventId:id,title:festival.name,secondMode:(interaction.options.getString("second-reward")??"auto") as SecondPrizeMode|"auto",secondRole:sr,thirdRole:tr});
      const opened=await publishFestival(interaction.guildId,id,{durationDays:interaction.options.getInteger("days",true),announcementChannelId:settings.eventAnnouncementChannelId});
      const ch=await interaction.guild.channels.fetch(settings.eventAnnouncementChannelId); if(!ch?.isSendable()){await interaction.reply({content:"The configured event channel cannot be used.",flags:MessageFlags.Ephemeral});return;}
      const summon=settings.tourneySummonsRoleId?`<@&${settings.tourneySummonsRoleId}> — `:"";
      const msg=await ch.send({content:`${summon}go to <#${settings.eventChatChannelId}> and type \`/festival join festival-id:${id}\` to join.`,allowedMentions:settings.tourneySummonsRoleId?{roles:[settings.tourneySummonsRoleId]}:undefined,embeds:[festivalEmbed(opened).addFields({name:"Rewards",value:prizeAnnouncementText(pack)},{name:"Festival Shop",value:"Complete temporary objectives to earn Festival Points and tokens. Tokens may be spent on permanent seasonal keepsakes."})]});
      await setFestivalAnnouncementMessage(interaction.guildId,id,msg.id); await interaction.reply({content:`Festival published in <#${settings.eventAnnouncementChannelId}>.`,flags:MessageFlags.Ephemeral});return;
    }
    if(sub==="cancel"){await cancelFestival(interaction.guildId,id);await interaction.reply(`**${festival.name}** has been cancelled.`);return;}
    const result=await finishFestival(interaction.guildId,id); const prize=await finalizePrizePackage(interaction.guild,`festival:${id}`,result.podiumIds); await Promise.all(result.podiumIds.map((u,i)=>changeRenown(interaction.guildId,u,[10,7,5][i]??3).catch(()=>undefined)));
    await recordHouseEventPodium(interaction.guild,{eventType:"the seasonal festival",title:result.festival.name,podiumIds:result.podiumIds,sourceKey:`festival:${id}`}).catch(()=>undefined);
    const target=result.festival.announcementChannelId?await interaction.guild.channels.fetch(result.festival.announcementChannelId):interaction.channel;
    if(target?.isSendable()) await target.send({embeds:[new EmbedBuilder().setColor(0xd4af37).setTitle(`${result.festival.name} · Festival Concluded`).setDescription(result.podiumIds.map((u,i)=>`${["🥇","🥈","🥉"][i]} <@${u}>`).join("\n")||"No ranked participants.").addFields(...(prize?[{name:"Prizes",value:finalizedPrizeText(prize).slice(0,1024)}]:[])).setFooter({text:"Festival Points and unspent tokens are now archived; purchased keepsakes remain."})]});
    await interaction.reply({content:`**${festival.name}** is complete.`,flags:MessageFlags.Ephemeral});
  }
};
