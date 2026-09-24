import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const suggestionStatusSchema = z.enum([
  "pending",
  "considering",
  "accepted",
  "denied",
  "implemented",
]);

export const suggestionSchema = z.object({
  id: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  messageId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.string(),
  body: z.string(),
  upvotes: z.array(z.string()),
  downvotes: z.array(z.string()),
  createdAt: z.number(),
  status: suggestionStatusSchema.default("pending"),
  staffResponse: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.number().optional(),
});

const suggestionFileSchema = z.record(z.string(), suggestionSchema);
export type Suggestion = z.infer<typeof suggestionSchema>;
export type SuggestionVote = "up" | "down";
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;

export function isSuggestionVotingOpen(status: SuggestionStatus): boolean {
  return status === "pending" || status === "considering";
}

const suggestionsPath = resolve(process.cwd(), "data", "suggestions.json");
let suggestionCache: Record<string, Suggestion> | undefined;
let writeQueue = Promise.resolve();

async function loadSuggestions(): Promise<Record<string, Suggestion>> {
  if (suggestionCache) return suggestionCache;

  try {
    const contents = await readFile(suggestionsPath, "utf8");
    suggestionCache = suggestionFileSchema.parse(JSON.parse(contents));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    suggestionCache = {};
  }

  return suggestionCache;
}

async function saveSuggestions(): Promise<void> {
  const suggestions = await loadSuggestions();
  const temporaryPath = `${suggestionsPath}.tmp`;

  await mkdir(dirname(suggestionsPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(suggestions, null, 2)}\n`, "utf8");
  await rename(temporaryPath, suggestionsPath);
}

export async function saveSuggestion(suggestion: Suggestion): Promise<Suggestion> {
  const suggestions = await loadSuggestions();
  suggestions[suggestion.id] = suggestion;
  writeQueue = writeQueue.then(saveSuggestions);
  await writeQueue;
  return suggestion;
}

export async function getSuggestion(id: string): Promise<Suggestion | undefined> {
  const suggestions = await loadSuggestions();
  return suggestions[id];
}

export async function castSuggestionVote(
  id: string,
  userId: string,
  vote: SuggestionVote,
): Promise<Suggestion | undefined> {
  const suggestions = await loadSuggestions();
  const suggestion = suggestions[id];
  if (!suggestion) return undefined;
  if (!isSuggestionVotingOpen(suggestion.status)) return suggestion;

  const alreadySelected =
    vote === "up" ? suggestion.upvotes.includes(userId) : suggestion.downvotes.includes(userId);

  suggestion.upvotes = suggestion.upvotes.filter((id) => id !== userId);
  suggestion.downvotes = suggestion.downvotes.filter((id) => id !== userId);

  if (!alreadySelected) {
    (vote === "up" ? suggestion.upvotes : suggestion.downvotes).push(userId);
  }

  writeQueue = writeQueue.then(saveSuggestions);
  await writeQueue;
  return suggestion;
}

export async function updateSuggestionReview(
  id: string,
  guildId: string,
  status: SuggestionStatus,
  staffResponse: string | undefined,
  reviewedBy: string,
): Promise<Suggestion | undefined> {
  const suggestions = await loadSuggestions();
  const suggestion = suggestions[id];
  if (!suggestion || suggestion.guildId !== guildId) return undefined;

  suggestion.status = status;
  suggestion.staffResponse = staffResponse?.trim() || undefined;
  suggestion.reviewedBy = reviewedBy;
  suggestion.reviewedAt = Date.now();

  writeQueue = writeQueue.then(saveSuggestions);
  await writeQueue;
  return suggestion;
}

export async function getGuildSuggestions(guildId: string): Promise<Suggestion[]> {
  const suggestions = await loadSuggestions();
  return Object.values(suggestions).filter((suggestion) => suggestion.guildId === guildId);
}

export async function replaceGuildSuggestions(
  guildId: string,
  replacements: unknown[],
): Promise<Suggestion[]> {
  const validated = replacements.map((suggestion) => suggestionSchema.parse(suggestion));
  if (validated.some((suggestion) => suggestion.guildId !== guildId)) {
    throw new Error("Backup contains suggestions from a different server.");
  }

  const suggestions = await loadSuggestions();
  for (const [id, suggestion] of Object.entries(suggestions)) {
    if (suggestion.guildId === guildId) delete suggestions[id];
  }
  for (const suggestion of validated) suggestions[suggestion.id] = suggestion;

  writeQueue = writeQueue.then(saveSuggestions);
  await writeQueue;
  return validated;
}
