export interface AchievementDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const achievementDefinitions: AchievementDefinition[] = [
  { id: "realm-founder", name: "Founder of the Realm", emoji: "🏰", description: "Owned the server when its history was first recorded." },
  { id: "first-tilt", name: "First Tilt", emoji: "🐎", description: "Won a jousting tilt." },
  { id: "tourney-champion", name: "Champion of the Lists", emoji: "🏆", description: "Won a Grey Ghost jousting tournament." },
  { id: "quiz-champion", name: "Scholar of the Citadel", emoji: "📚", description: "Finished first in a Grey Ghost quiz." },
  { id: "season-victor", name: "Victor of the Season", emoji: "👑", description: "Belonged to a House that won a completed season." },
  { id: "quest-contributor", name: "Quest Contributor", emoji: "📜", description: "Made credited progress toward a House quest." },
];

export const achievementMap = new Map(achievementDefinitions.map((achievement) => [achievement.id, achievement]));
