export type SlackMentionUser = {
  userId: string;
  username?: string;
};

function escapeJsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function buildSlackMentionsFilterCode(user: SlackMentionUser): string {
  const clauses = [`u?.userId === '${escapeJsString(user.userId)}'`];
  if (user.username) {
    clauses.push(`u?.username === '${escapeJsString(user.username)}'`);
  }

  return [
    "if (!Array.isArray(data)) return [];",
    `return data.filter((m) => m?.mentions?.some((u) => ${clauses.join(" || ")}));`,
  ].join("\n");
}

