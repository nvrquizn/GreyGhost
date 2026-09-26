export type JoustHorse = "destrier" | "courser";

export interface JoustFighter {
  userId: string;
  horse: JoustHorse;
  houseRoleId: string;
  health: number;
  damage: number;
  resistance: number;
}

export interface TiltPass {
  pass: number;
  leftAttack: number;
  rightAttack: number;
  leftGuard: number;
  rightGuard: number;
  leftRemaining: number;
  rightRemaining: number;
}

export interface TiltResult {
  winnerId: string;
  loserId: string;
  passes: TiltPass[];
  decidedBy: "unhorsed" | "endurance" | "sudden-death";
}

export interface JoustPairing {
  leftId: string;
  rightId: string;
}

export interface PairingDraw {
  pairs: JoustPairing[];
  byes: string[];
}

const integer = (minimum: number, maximum: number, random: () => number): number =>
  Math.floor(random() * (maximum - minimum + 1)) + minimum;

function shuffledCopy<T>(values: T[], random: () => number): T[] {
  const copy = values.map((value) => ({ ...value }));
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
}

export function validJoustBuild(health: number, damage: number, resistance: number): boolean {
  return [health, damage, resistance].every((value) => Number.isInteger(value) && value >= -3 && value <= 8)
    && health + damage + resistance === 2;
}

export function balanceJoustHouses<T extends { userId: string; houseRoleId: string }>(
  entrants: T[],
  availableHouseRoleIds: string[],
  random: () => number = Math.random,
): { entrants: T[]; moved: Array<{ userId: string; from: string; to: string }> } {
  const houses = [...new Set(availableHouseRoleIds)];
  const shuffled = shuffledCopy(entrants, random);
  if (houses.length < 2 || shuffled.length < 2) return { entrants: shuffled, moved: [] };
  if (new Set(shuffled.map((entrant) => entrant.houseRoleId)).size > 1) {
    return { entrants: shuffled, moved: [] };
  }

  const counts = new Map(houses.map((house) => [house, 0]));
  for (const entrant of shuffled) counts.set(entrant.houseRoleId, (counts.get(entrant.houseRoleId) ?? 0) + 1);
  const moved: Array<{ userId: string; from: string; to: string }> = [];

  while (true) {
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const fullest = ordered[0];
    const emptiest = ordered[ordered.length - 1];
    if (!fullest || !emptiest || fullest[1] - emptiest[1] <= 1) break;
    const candidate = shuffled.find((entrant) => entrant.houseRoleId === fullest[0]);
    if (!candidate) break;
    const from = candidate.houseRoleId;
    candidate.houseRoleId = emptiest[0];
    counts.set(from, fullest[1] - 1);
    counts.set(emptiest[0], emptiest[1] + 1);
    moved.push({ userId: candidate.userId, from, to: emptiest[0] });
  }
  return { entrants: shuffled, moved };
}

export function drawCrossHousePairings<T extends { userId: string; houseRoleId: string }>(
  entrants: T[],
  random: () => number = Math.random,
): PairingDraw {
  const remaining = shuffledCopy(entrants, random);
  const pairs: JoustPairing[] = [];

  while (remaining.length > 1) {
    let leftIndex = -1;
    let rightIndex = -1;
    for (let i = 0; i < remaining.length && leftIndex < 0; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        if (remaining[i]!.houseRoleId !== remaining[j]!.houseRoleId) {
          leftIndex = i;
          rightIndex = j;
          break;
        }
      }
    }
    if (leftIndex < 0 || rightIndex < 0) break;
    const right = remaining.splice(rightIndex, 1)[0]!;
    const left = remaining.splice(leftIndex, 1)[0]!;
    pairs.push({ leftId: left.userId, rightId: right.userId });
  }
  return { pairs, byes: remaining.map((entrant) => entrant.userId) };
}


export function drawRenownAwarePairings<T extends { userId: string; houseRoleId: string }>(
  entrants: T[],
  renown: Map<string, number>,
  random: () => number = Math.random,
): PairingDraw {
  if (!entrants.some((entrant) => (renown.get(entrant.userId) ?? 0) > 0)) return drawCrossHousePairings(entrants, random);
  const remaining = [...entrants].sort((a, b) => (renown.get(b.userId) ?? 0) - (renown.get(a.userId) ?? 0) || (random() < 0.5 ? -1 : 1));
  const pairs: JoustPairing[] = [];
  while (remaining.length > 1) {
    const left = remaining.shift()!;
    let bestIndex = -1;
    let bestDifference = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]!;
      if (candidate.houseRoleId === left.houseRoleId) continue;
      const difference = Math.abs((renown.get(candidate.userId) ?? 0) - (renown.get(left.userId) ?? 0));
      if (difference < bestDifference) {
        bestDifference = difference;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) {
      remaining.unshift(left);
      break;
    }
    const right = remaining.splice(bestIndex, 1)[0]!;
    pairs.push({ leftId: left.userId, rightId: right.userId });
  }
  return { pairs, byes: remaining.map((entrant) => entrant.userId) };
}

export function simulateTilt(left: JoustFighter, right: JoustFighter, random: () => number = Math.random): TiltResult {
  const horse = {
    destrier: { health: 3, damage: 0, resistance: 1 },
    courser: { health: 0, damage: 1, resistance: 0 },
  } as const;
  let leftRemaining = Math.max(1, 10 + left.health * 2 + horse[left.horse].health);
  let rightRemaining = Math.max(1, 10 + right.health * 2 + horse[right.horse].health);
  const passes: TiltPass[] = [];

  for (let pass = 1; pass <= 3; pass += 1) {
    const leftAttack = integer(1, 12, random) + left.damage + horse[left.horse].damage;
    const rightAttack = integer(1, 12, random) + right.damage + horse[right.horse].damage;
    const leftGuard = integer(1, 8, random) + left.resistance + horse[left.horse].resistance;
    const rightGuard = integer(1, 8, random) + right.resistance + horse[right.horse].resistance;
    leftRemaining -= Math.max(0, rightAttack - leftGuard);
    rightRemaining -= Math.max(0, leftAttack - rightGuard);
    passes.push({ pass, leftAttack, rightAttack, leftGuard, rightGuard, leftRemaining, rightRemaining });

    if (leftRemaining <= 0 || rightRemaining <= 0) {
      if (leftRemaining === rightRemaining) {
        const leftWins = random() < 0.5;
        return { winnerId: leftWins ? left.userId : right.userId, loserId: leftWins ? right.userId : left.userId, passes, decidedBy: "sudden-death" };
      }
      const leftWins = leftRemaining > rightRemaining;
      return { winnerId: leftWins ? left.userId : right.userId, loserId: leftWins ? right.userId : left.userId, passes, decidedBy: "unhorsed" };
    }
  }

  if (leftRemaining === rightRemaining) {
    const leftWins = random() < 0.5;
    return { winnerId: leftWins ? left.userId : right.userId, loserId: leftWins ? right.userId : left.userId, passes, decidedBy: "sudden-death" };
  }
  const leftWins = leftRemaining > rightRemaining;
  return { winnerId: leftWins ? left.userId : right.userId, loserId: leftWins ? right.userId : left.userId, passes, decidedBy: "endurance" };
}
