import { randomBytes } from "node:crypto";

export interface PendingCollectionConfiguration {
  guildId: string;
  userId: string;
  name: string;
  titleRoleId: string;
  requiredCount?: number;
}

const pendingConfigurations = new Map<string, PendingCollectionConfiguration>();

export function createPendingCollectionConfiguration(
  configuration: PendingCollectionConfiguration,
): string {
  const token = randomBytes(6).toString("hex");
  pendingConfigurations.set(token, configuration);

  const timeout = setTimeout(() => pendingConfigurations.delete(token), 15 * 60 * 1000);
  timeout.unref();
  return token;
}

export function takePendingCollectionConfiguration(
  token: string,
): PendingCollectionConfiguration | undefined {
  const configuration = pendingConfigurations.get(token);
  pendingConfigurations.delete(token);
  return configuration;
}
