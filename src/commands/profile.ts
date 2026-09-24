import { MessageFlags, SlashCommandBuilder, type Role } from "discord.js";
import type { Command } from "../types/command.js";
import {
  deleteMemberProfile,
  getGuildSettings,
  saveMemberProfile,
  type MemberProfile,
} from "../services/guild-settings.js";
import { getAdmirerRoleIds } from "../profiles/profile-data.js";
import { renderMemberProfile } from "../profiles/render-profile.js";

function parseHexColor(value: string): number | undefined {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return undefined;
  return Number.parseInt(normalized, 16);
}

function uniqueRoles(roles: Role[]): Role[] {
  return [...new Map(roles.map((role) => [role.id, role])).values()];
}

export const profileCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View or customize a Realm profile.")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View your profile or another member's profile.")
        .addUserOption((option) =>
          option.setName("member").setDescription("The member whose profile you want to view."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit the personal details on your profile.")
        .addStringOption((option) =>
          option.setName("bio").setDescription("A short profile introduction.").setMaxLength(300),
        )
        .addStringOption((option) =>
          option
            .setName("favorite-character")
            .setDescription("Your favourite ASOIAF character.")
            .setMaxLength(80),
        )
        .addStringOption((option) =>
          option
            .setName("favorite-dragon")
            .setDescription("Your favourite dragon.")
            .setMaxLength(80),
        )
        .addStringOption((option) =>
          option.setName("color").setDescription("Profile embed colour, such as #87CEEB."),
        ),
    )
    .addSubcommand((subcommand) => {
      subcommand.setName("wishlist").setDescription("Choose up to five admirer roles you want.");
      for (let index = 1; index <= 5; index += 1) {
        subcommand.addRoleOption((option) =>
          option
            .setName(`role-${index}`)
            .setDescription(index === 1 ? "The first admirer role you want." : "Another admirer role.")
            .setRequired(index === 1),
        );
      }
      return subcommand;
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear one section or reset your entire profile.")
        .addStringOption((option) =>
          option
            .setName("field")
            .setDescription("The profile section to clear.")
            .setRequired(true)
            .addChoices(
              { name: "Bio", value: "bio" },
              { name: "Favourite character", value: "favoriteCharacter" },
              { name: "Favourite dragon", value: "favoriteDragon" },
              { name: "Profile colour", value: "color" },
              { name: "Admirer wishlist", value: "wishlistRoleIds" },
              { name: "Entire profile", value: "all" },
            ),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      await interaction.deferReply();
      const user = interaction.options.getUser("member") ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.editReply("That user is not currently a member of this server.");
        return;
      }

      const embed = await renderMemberProfile(member);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === "edit") {
      const bio = interaction.options.getString("bio")?.trim();
      const favoriteCharacter = interaction.options.getString("favorite-character")?.trim();
      const favoriteDragon = interaction.options.getString("favorite-dragon")?.trim();
      const colorInput = interaction.options.getString("color");
      const changes: Partial<Omit<MemberProfile, "updatedAt">> = {};

      if (bio) changes.bio = bio;
      if (favoriteCharacter) changes.favoriteCharacter = favoriteCharacter;
      if (favoriteDragon) changes.favoriteDragon = favoriteDragon;
      if (colorInput) {
        const color = parseHexColor(colorInput);
        if (color === undefined) {
          await interaction.reply({
            content: "That colour is invalid. Use a six-digit hex colour such as `#87CEEB`.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        changes.color = color;
      }

      if (!Object.keys(changes).length) {
        await interaction.reply({
          content: "Choose at least one profile detail to edit.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await saveMemberProfile(interaction.guildId, interaction.user.id, changes);
      await interaction.reply({
        content: "Your Realm profile has been updated.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "wishlist") {
      const selected = uniqueRoles(
        [1, 2, 3, 4, 5]
          .map((index) => interaction.options.getRole(`role-${index}`))
          .filter((role): role is Role => Boolean(role)),
      );
      const [configuredAdmirerRoles, settings] = await Promise.all([
        getAdmirerRoleIds(interaction.guildId),
        getGuildSettings(interaction.guildId),
      ]);
      const titleRoleIds = new Set(
        Object.values(settings.collectionSets ?? {}).map((set) => set.titleRoleId),
      );
      const invalid = selected.filter(
        (role) =>
          role.managed ||
          titleRoleIds.has(role.id) ||
          (!configuredAdmirerRoles.has(role.id) && !/(admirer|conquerer)/i.test(role.name)),
      );
      if (invalid.length) {
        await interaction.reply({
          content: `These do not appear to be admirer roles: ${invalid.join(", ")}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const alreadyOwned = selected.filter((role) => interaction.member.roles.cache.has(role.id));
      if (alreadyOwned.length) {
        await interaction.reply({
          content: `You already have ${alreadyOwned.join(", ")}; choose roles you are still collecting.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await saveMemberProfile(interaction.guildId, interaction.user.id, {
        wishlistRoleIds: selected.map((role) => role.id),
      });
      await interaction.reply({
        content: `Your admirer wishlist is now:\n${selected.map((role) => `• ${role}`).join("\n")}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const field = interaction.options.getString("field", true) as
      | keyof Omit<MemberProfile, "updatedAt">
      | "all";
    if (field === "all") {
      const removed = await deleteMemberProfile(interaction.guildId, interaction.user.id);
      await interaction.reply({
        content: removed ? "Your Realm profile has been reset." : "You did not have a saved profile.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await saveMemberProfile(interaction.guildId, interaction.user.id, {
      [field]: field === "wishlistRoleIds" ? [] : undefined,
    });
    await interaction.reply({
      content: "That profile section has been cleared.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
