import { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  const slackBot = Boolean(process.env.SLACK_BOT_TOKEN);
  const slackUser = Boolean(process.env.SLACK_USER_TOKEN);
  const posthog = Boolean(process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID);
  const vercel = Boolean(process.env.VERCEL_TOKEN);
  const github = Boolean(process.env.GITHUB_TOKEN);

  return Response.json({
    slack: { bot: slackBot, user: slackUser },
    posthog,
    vercel,
    github,
  });
}
