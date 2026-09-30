import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from "discord.js";

export type StaffApplicationDraft = {
  discordUsername?: string;
  timezone?: string;
  age16Plus?: string;
  experience?: string;
  availability?: string;
  scenarioSpam?: string;
  scenarioStaffMisconduct?: string;
  scenarioNsfw?: string;
  scenarioConflict?: string;
  inclusivity?: string;
  calmUnbiased?: string;
  motivation?: string;
  strengths?: string;
  uncertainty?: string;
  additional?: string;
  updatedAt: number;
};

const drafts = new Map<string, StaffApplicationDraft>();
const key = (guildId: string, userId: string) => `${guildId}:${userId}`;

function row(input: TextInputBuilder) {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

export function buildStaffApplicationModal(guildId: string, userId: string, page: 1 | 2 | 3): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`staffapp:page:${page}:${guildId}:${userId}`)
    .setTitle(`Staff Application · ${page}/3`);

  if (page === 1) {
    modal.addComponents(
      row(new TextInputBuilder().setCustomId("discordUsername").setLabel("1. What is your Discord username?").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
      row(new TextInputBuilder().setCustomId("timezone").setLabel("2. What is your timezone?").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
      row(new TextInputBuilder().setCustomId("age16Plus").setLabel("3. Are you 16 or older? Yes / No").setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(true)),
      row(new TextInputBuilder().setCustomId("experience").setLabel("4. Prior moderation experience?").setPlaceholder("It is okay if you do not have any.").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("availability").setLabel("5. How often are you available?").setPlaceholder("Days, usual hours, and any limits.").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)),
    );
  } else if (page === 2) {
    modal.addComponents(
      row(new TextInputBuilder().setCustomId("scenarioSpam").setLabel("6. How would you handle spam?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("scenarioStaffMisconduct").setLabel("7. Staff member acts inappropriately?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("scenarioNsfw").setLabel("8. Someone posts NSFW speech?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("scenarioConflict").setLabel("9. How would you handle conflict?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("inclusivity").setLabel("10. How would you keep things inclusive?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
    );
  } else {
    modal.addComponents(
      row(new TextInputBuilder().setCustomId("calmUnbiased").setLabel("11. How do you stay calm and unbiased?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("motivation").setLabel("12. Why do you want to join staff?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("strengths").setLabel("13. What strengths would you bring?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("uncertainty").setLabel("14. Unsure how to moderate something?").setPlaceholder("What would you do if the right action was unclear?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
      row(new TextInputBuilder().setCustomId("additional").setLabel("15. Anything else? (optional)").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false)),
    );
  }
  return modal;
}

export function saveStaffApplicationPage(interaction: ModalSubmitInteraction, page: 1 | 2 | 3): StaffApplicationDraft {
  if (!interaction.guildId) throw new Error("GUILD_REQUIRED");
  const draftKey = key(interaction.guildId, interaction.user.id);
  const previous = drafts.get(draftKey) ?? { updatedAt: Date.now() };
  const get = (id: string) => interaction.fields.getTextInputValue(id).trim();
  const patch: Partial<StaffApplicationDraft> = page === 1 ? {
    discordUsername: get("discordUsername"),
    timezone: get("timezone"),
    age16Plus: get("age16Plus"),
    experience: get("experience"),
    availability: get("availability"),
  } : page === 2 ? {
    scenarioSpam: get("scenarioSpam"),
    scenarioStaffMisconduct: get("scenarioStaffMisconduct"),
    scenarioNsfw: get("scenarioNsfw"),
    scenarioConflict: get("scenarioConflict"),
    inclusivity: get("inclusivity"),
  } : {
    calmUnbiased: get("calmUnbiased"),
    motivation: get("motivation"),
    strengths: get("strengths"),
    uncertainty: get("uncertainty"),
    additional: get("additional") || undefined,
  };
  const updated = { ...previous, ...patch, updatedAt: Date.now() };
  drafts.set(draftKey, updated);
  return updated;
}

export function getStaffApplicationDraft(guildId: string, userId: string): StaffApplicationDraft | undefined {
  const draft = drafts.get(key(guildId, userId));
  if (!draft) return undefined;
  if (Date.now() - draft.updatedAt > 60 * 60 * 1000) {
    drafts.delete(key(guildId, userId));
    return undefined;
  }
  return draft;
}

export function clearStaffApplicationDraft(guildId: string, userId: string): void {
  drafts.delete(key(guildId, userId));
}
