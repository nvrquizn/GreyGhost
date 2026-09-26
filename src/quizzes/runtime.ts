import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  MessageFlags,
  type Client,
  type Guild,
} from "discord.js";
import {
  closeQuizQuestion,
  getGuildQuizzes,
  getQuiz,
  joinQuiz,
  recordQuizAnswer,
  updateQuiz,
  awardAchievement,
  type Quiz,
} from "../services/guild-settings.js";

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const answerEmojis = ["🇦", "🇧", "🇨", "🇩"];

function timerKey(guildId: string, quizId: number): string {
  return `${guildId}:${quizId}`;
}

function answerRow(quiz: Quiz, disabled = false): ActionRowBuilder<ButtonBuilder> {
  const question = quiz.questions[quiz.currentQuestion];
  const row = new ActionRowBuilder<ButtonBuilder>();
  question?.options.forEach((_, index) => row.addComponents(
    new ButtonBuilder()
      .setCustomId(`quiz:answer:${quiz.id}:${index}`)
      .setEmoji(answerEmojis[index]!)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  ));
  return row;
}

function leaderboard(scores: Record<string, number>, limit = 10): string {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  return entries.length
    ? entries.map(([userId, score], index) => `**${index + 1}.** <@${userId}> — **${score}** point${score === 1 ? "" : "s"}`).join("\n")
    : "No points have been earned yet.";
}

export async function publishQuizLobby(guild: Guild, quiz: Quiz): Promise<Quiz> {
  const channel = await guild.channels.fetch(quiz.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error("QUIZ_CHANNEL_INVALID");
  const updated = await updateQuiz(guild.id, quiz.id, { status: "lobby" });
  if (!updated) throw new Error("QUIZ_NOT_FOUND");
  const embed = new EmbedBuilder()
    .setColor(0x87ceeb)
    .setTitle(`Quiz #${quiz.id} · ${quiz.title}`)
    .setDescription("Press **Join Quiz** before the host begins. Answers will be submitted privately through emoji buttons.")
    .addFields(
      { name: "Questions", value: String(quiz.questions.length), inline: true },
      { name: "Timer", value: `${quiz.secondsPerQuestion} seconds`, inline: true },
      { name: "Host", value: `<@${quiz.hostId}>`, inline: true },
    )
    .setFooter({ text: "Correct answers earn 3, 2, or 1 point depending on response speed." });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`quiz:join:${quiz.id}`).setLabel("Join Quiz").setEmoji("🏇").setStyle(ButtonStyle.Primary),
  );
  const message = await channel.send({ embeds: [embed], components: [row] });
  return (await updateQuiz(guild.id, quiz.id, { lobbyMessageId: message.id })) ?? updated;
}

export async function startNextQuizQuestion(guild: Guild, quizId: number): Promise<Quiz> {
  const quiz = await getQuiz(guild.id, quizId);
  if (!quiz || !["lobby", "results"].includes(quiz.status)) throw new Error("QUIZ_NOT_READY");
  const nextIndex = quiz.currentQuestion + 1;
  const question = quiz.questions[nextIndex];
  if (!question) throw new Error("NO_MORE_QUESTIONS");
  const startedAt = Date.now();
  const endsAt = startedAt + quiz.secondsPerQuestion * 1000;
  const updated = await updateQuiz(guild.id, quiz.id, {
    status: "question",
    currentQuestion: nextIndex,
    currentResponses: {},
    questionStartedAt: startedAt,
    questionEndsAt: endsAt,
    questionMessageId: undefined,
  });
  if (!updated) throw new Error("QUIZ_NOT_FOUND");
  const channel = await guild.channels.fetch(updated.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error("QUIZ_CHANNEL_INVALID");
  const choices = question.options.map((option, index) => `${answerEmojis[index]} ${option}`).join("\n");
  const message = await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x87ceeb)
      .setTitle(`${updated.title} · Question ${nextIndex + 1}/${updated.questions.length}`)
      .setDescription(`### ${question.prompt}\n\n${choices}`)
      .addFields({ name: "Time Remaining", value: `<t:${Math.floor(endsAt / 1000)}:R>` })
      .setFooter({ text: "Your selection and all answer totals remain private." })],
    components: [answerRow(updated)],
  });
  const saved = (await updateQuiz(guild.id, quiz.id, { questionMessageId: message.id })) ?? updated;
  scheduleQuizClose(guild, saved);
  return saved;
}

export async function finishQuizQuestion(guild: Guild, quizId: number): Promise<void> {
  const key = timerKey(guild.id, quizId);
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  const result = await closeQuizQuestion(guild.id, quizId);
  if (!result) return;
  const { quiz, awarded } = result;
  const question = quiz.questions[quiz.currentQuestion]!;
  const channel = await guild.channels.fetch(quiz.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  if (quiz.questionMessageId) {
    const message = await channel.messages.fetch(quiz.questionMessageId).catch(() => null);
    await message?.edit({ components: [answerRow(quiz, true)] }).catch(() => undefined);
  }
  const correctCount = Object.keys(awarded).length;
  const embed = new EmbedBuilder()
    .setColor(0x6fa36f)
    .setTitle(`Question ${quiz.currentQuestion + 1} · Answer`)
    .setDescription(`**${answerEmojis[question.correctIndex]} ${question.options[question.correctIndex]}**${question.explanation ? `\n\n${question.explanation}` : ""}`)
    .addFields(
      { name: "Correct Responses", value: String(correctCount), inline: true },
      { name: "Current Standings", value: leaderboard(quiz.scores) },
    )
    .setFooter({ text: quiz.currentQuestion + 1 < quiz.questions.length ? "The host may now use /quiz next." : "That was the final question; the host may use /quiz end." });
  await channel.send({ embeds: [embed] });
}

function scheduleQuizClose(guild: Guild, quiz: Quiz): void {
  if (!quiz.questionEndsAt) return;
  const key = timerKey(guild.id, quiz.id);
  const old = timers.get(key);
  if (old) clearTimeout(old);
  const delay = Math.max(0, quiz.questionEndsAt - Date.now());
  timers.set(key, setTimeout(() => void finishQuizQuestion(guild, quiz.id).catch((error) => console.error("Quiz close failed:", error)), delay));
}

export async function finishQuiz(guild: Guild, quizId: number): Promise<Quiz> {
  const quiz = await getQuiz(guild.id, quizId);
  if (!quiz || !["results", "lobby"].includes(quiz.status)) throw new Error("QUIZ_NOT_READY");
  const updated = await updateQuiz(guild.id, quizId, { status: "finished" });
  if (!updated) throw new Error("QUIZ_NOT_FOUND");
  const channel = await guild.channels.fetch(updated.channelId);
  if (channel?.type === ChannelType.GuildText) {
    const highest = Math.max(0, ...Object.values(updated.scores));
    const winnerIds = Object.entries(updated.scores).filter(([, score]) => score === highest && highest > 0).map(([id]) => id);
    const winners = winnerIds.map((id) => `<@${id}>`);
    await Promise.all(winnerIds.map((userId) => awardAchievement(guild.id, userId, "quiz-champion")));
    await channel.send({ embeds: [new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle(`${updated.title} · Final Results`)
      .setDescription(winners.length ? `### Winner${winners.length === 1 ? "" : "s"}: ${winners.join(", ")}\n\n${leaderboard(updated.scores, 20)}` : "The quiz ended without any scored answers.")
      .setFooter({ text: `Quiz #${updated.id} · ${updated.participants.length} participant(s)` })] });
  }
  return updated;
}

export function registerQuizInteractions(client: Client): void {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      for (const quiz of await getGuildQuizzes(guild.id)) {
        if (quiz.status !== "question") continue;
        if ((quiz.questionEndsAt ?? 0) <= Date.now()) await finishQuizQuestion(guild, quiz.id).catch(() => undefined);
        else scheduleQuizClose(guild, quiz);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.inCachedGuild() || !interaction.customId.startsWith("quiz:")) return;
    const [, action, rawId, rawChoice] = interaction.customId.split(":");
    const quizId = Number(rawId);
    if (!Number.isInteger(quizId)) return;
    if (action === "join") {
      const quiz = await joinQuiz(interaction.guildId, quizId, interaction.user.id);
      await interaction.reply({ content: quiz ? `You joined **${quiz.title}**.` : "That quiz lobby is no longer open.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "answer") {
      const choice = Number(rawChoice);
      const result = await recordQuizAnswer(interaction.guildId, quizId, interaction.user.id, choice);
      const message = result === "saved" ? `${answerEmojis[choice]} saved privately. You may change it until time expires.`
        : result === "not_joined" ? "You did not join this quiz lobby."
          : "Answers for that question are closed.";
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  });
}
