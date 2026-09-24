import {
  getGuildSettings,
  removeLoreEntry,
  saveLoreEntry,
  type LoreEntry,
  type LoreEntryType,
} from "../services/guild-settings.js";
import { starterLoreEntries } from "./starter-entries.js";

const starterById = new Map(starterLoreEntries.map((entry) => [entry.id, entry]));

export function makeLoreId(type: LoreEntryType, name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${type}-${slug || "entry"}`;
}

export async function getLoreEntries(guildId: string): Promise<LoreEntry[]> {
  const settings = await getGuildSettings(guildId);
  const hidden = new Set(settings.hiddenLoreEntryIds ?? []);
  const entries = new Map(
    starterLoreEntries.filter((entry) => !hidden.has(entry.id)).map((entry) => [entry.id, entry]),
  );
  for (const entry of Object.values(settings.loreEntries ?? {})) entries.set(entry.id, entry);
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function findLoreEntry(
  guildId: string,
  value: string,
  type?: LoreEntryType,
): Promise<LoreEntry | undefined> {
  const query = value.trim().toLowerCase();
  const entries = await getLoreEntries(guildId);
  return entries.find(
    (entry) =>
      (!type || entry.type === type) &&
      (entry.id === query ||
        entry.name.toLowerCase() === query ||
        entry.aliases.some((alias) => alias.toLowerCase() === query)),
  );
}

export async function searchLoreEntries(
  guildId: string,
  value: string,
  type?: LoreEntryType,
  limit = 25,
): Promise<LoreEntry[]> {
  const query = value.trim().toLowerCase();
  const entries = (await getLoreEntries(guildId)).filter((entry) => !type || entry.type === type);
  if (!query) return entries.slice(0, limit);
  return entries
    .map((entry) => {
      const terms = [entry.name, ...entry.aliases].map((term) => term.toLowerCase());
      const score = terms.some((term) => term === query)
        ? 0
        : terms.some((term) => term.startsWith(query))
          ? 1
          : terms.some((term) => term.includes(query))
            ? 2
            : entry.overview.toLowerCase().includes(query)
              ? 3
              : 99;
      return { entry, score };
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export async function upsertLoreEntry(guildId: string, entry: LoreEntry): Promise<LoreEntry> {
  return saveLoreEntry(guildId, entry);
}

export async function deleteLoreEntry(guildId: string, entry: LoreEntry): Promise<void> {
  await removeLoreEntry(guildId, entry.id, starterById.has(entry.id));
}

export function isStarterLoreEntry(entryId: string): boolean {
  return starterById.has(entryId);
}
