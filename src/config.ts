import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  CLIENT_ID: z.string().regex(/^\d+$/, "CLIENT_ID must be a Discord ID"),
  GUILD_ID: z.string().regex(/^\d+$/, "GUILD_ID must be a Discord ID"),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const problems = result.error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Grey Ghost is missing configuration:\n${problems}`);
}

export const config = result.data;
