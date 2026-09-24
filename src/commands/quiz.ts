import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { addQuizQuestion, createQuiz, getQuiz, updateQuiz } from "../services/guild-settings.js";
import { finishQuiz, finishQuizQuestion, publishQuizLobby, startNextQuizQuestion } from "../quizzes/runtime.js";

function allowed(hostId: string, userId: string, canManage: boolean): boolean {
  return hostId === userId || canManage;
}

export const quizCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Create and host live private-answer quizzes.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((sub) => sub.setName("create").setDescription("Create a draft quiz in this channel.")
      .addStringOption((option) => option.setName("title").setDescription("Quiz title.").setMaxLength(100).setRequired(true))
      .addIntegerOption((option) => option.setName("timer").setDescription("Seconds allowed per question (10–120).").setMinValue(10).setMaxValue(120).setRequired(true)))
    .addSubcommand((sub) => sub.setName("question").setDescription("Add a multiple-choice question to a draft.")
      .addIntegerOption((option) => option.setName("quiz-id").setDescription("Draft quiz number.").setMinValue(1).setRequired(true))
      .addStringOption((option) => option.setName("prompt").setDescription("The question.").setMaxLength(1000).setRequired(true))
      .addStringOption((option) => option.setName("option-a").setDescription("Answer A.").setMaxLength(200).setRequired(true))
      .addStringOption((option) => option.setName("option-b").setDescription("Answer B.").setMaxLength(200).setRequired(true))
      .addStringOption((option) => option.setName("correct").setDescription("The correct choice.").setRequired(true).addChoices(
        { name: "A", value: "A" }, { name: "B", value: "B" }, { name: "C", value: "C" }, { name: "D", value: "D" },
      ))
      .addStringOption((option) => option.setName("option-c").setDescription("Optional answer C.").setMaxLength(200))
      .addStringOption((option) => option.setName("option-d").setDescription("Optional answer D.").setMaxLength(200))
      .addStringOption((option) => option.setName("explanation").setDescription("Optional explanation revealed afterward.").setMaxLength(1000)))
    .addSubcommand((sub) => sub.setName("publish").setDescription("Open a draft quiz lobby.").addIntegerOption((option) => option.setName("quiz-id").setDescription("Quiz number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("start").setDescription("Start the first question.").addIntegerOption((option) => option.setName("quiz-id").setDescription("Quiz number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("next").setDescription("Start the next question.").addIntegerOption((option) => option.setName("quiz-id").setDescription("Quiz number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("close-question").setDescription("Close the current question early.").addIntegerOption((option) => option.setName("quiz-id").setDescription("Quiz number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("end").setDescription("End a quiz and publish final standings.").addIntegerOption((option) => option.setName("quiz-id").setDescription("Quiz number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel a draft, lobby, or live quiz.").addIntegerOption((option) => option.setName("quiz-id").setDescription("Quiz number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("status").setDescription("View a quiz's private host status.").addIntegerOption((option) => option.setName("quiz-id").setDescription("Quiz number.").setMinValue(1).setRequired(true))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      const quiz = await createQuiz(interaction.guildId, { title: interaction.options.getString("title", true), hostId: interaction.user.id, channelId: interaction.channelId, secondsPerQuestion: interaction.options.getInteger("timer", true) });
      await interaction.reply({ content: `Created draft quiz **#${quiz.id} · ${quiz.title}**. Add questions with \`/quiz question quiz-id:${quiz.id}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const quizId = interaction.options.getInteger("quiz-id", true);
    const quiz = await getQuiz(interaction.guildId, quizId);
    if (!quiz) {
      await interaction.reply({ content: `Quiz #${quizId} was not found.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!allowed(quiz.hostId, interaction.user.id, interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))) {
      await interaction.reply({ content: "Only the quiz host or a server manager can control this quiz.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === "question") {
      const optionC = interaction.options.getString("option-c");
      const optionD = interaction.options.getString("option-d");
      if (optionD && !optionC) {
        await interaction.reply({ content: "Add option C before adding option D.", flags: MessageFlags.Ephemeral });
        return;
      }
      const options = [interaction.options.getString("option-a", true), interaction.options.getString("option-b", true), optionC, optionD].filter((value): value is string => Boolean(value));
      const correctIndex = "ABCD".indexOf(interaction.options.getString("correct", true));
      if (correctIndex >= options.length) {
        await interaction.reply({ content: "The selected correct letter does not have a matching answer option.", flags: MessageFlags.Ephemeral });
        return;
      }
      const updated = await addQuizQuestion(interaction.guildId, quizId, { prompt: interaction.options.getString("prompt", true), options, correctIndex, explanation: interaction.options.getString("explanation") ?? undefined });
      await interaction.reply({ content: updated ? `Added question **${updated.questions.length}** to quiz #${quizId}.` : "Questions can only be added while the quiz is a draft.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === "publish") {
      if (quiz.status !== "draft" || !quiz.questions.length) {
        await interaction.reply({ content: "Only a draft containing at least one question can be published.", flags: MessageFlags.Ephemeral });
        return;
      }
      await publishQuizLobby(interaction.guild, quiz);
      await interaction.reply({ content: `Quiz #${quizId} lobby published.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === "start" || subcommand === "next") {
      try {
        await startNextQuizQuestion(interaction.guild, quizId);
        await interaction.reply({ content: `Question ${quiz.currentQuestion + 2} started.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        await interaction.reply({ content: error instanceof Error && error.message === "NO_MORE_QUESTIONS" ? "There are no more questions. Use `/quiz end`." : "That quiz is not ready for another question.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (subcommand === "close-question") {
      await finishQuizQuestion(interaction.guild, quizId);
      await interaction.reply({ content: "The current question was closed.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === "end") {
      try {
        await finishQuiz(interaction.guild, quizId);
        await interaction.reply({ content: "Final standings published.", flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.reply({ content: "Close the current question before ending the quiz.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (subcommand === "cancel") {
      await updateQuiz(interaction.guildId, quizId, { status: "cancelled" });
      await interaction.reply({ content: `Quiz #${quizId} cancelled.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const questionNumber = quiz.currentQuestion >= 0 ? `${quiz.currentQuestion + 1}/${quiz.questions.length}` : `0/${quiz.questions.length}`;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x7188a0).setTitle(`Quiz #${quiz.id} · ${quiz.title}`).addFields(
      { name: "Status", value: quiz.status, inline: true },
      { name: "Question", value: questionNumber, inline: true },
      { name: "Participants", value: String(quiz.participants.length), inline: true },
      { name: "Private responses", value: String(Object.keys(quiz.currentResponses).length), inline: true },
    )], flags: MessageFlags.Ephemeral });
  },
};
