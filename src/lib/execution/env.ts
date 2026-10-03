import "server-only";

import { appUrl } from "@/lib/app-url";

/**
 * App-level credentials for the three write destinations. These belong to
 * Vistrial, not to a client: each client authorises through OAuth and never
 * pastes anything. Values come from the deployment environment only.
 */

export function executionOAuthRedirectUri(): string {
  return `${appUrl()}/api/execution/oauth/callback`;
}

function read(name: string, env: NodeJS.ProcessEnv): string {
  return env[name]?.trim() ?? "";
}

export function slackConfigured(env = process.env): boolean {
  return Boolean(read("SLACK_CLIENT_ID", env) && read("SLACK_CLIENT_SECRET", env));
}
export function slackClientId(env = process.env): string {
  return read("SLACK_CLIENT_ID", env);
}
export function slackClientSecret(env = process.env): string {
  return read("SLACK_CLIENT_SECRET", env);
}

export function discordConfigured(env = process.env): boolean {
  return Boolean(
    read("DISCORD_CLIENT_ID", env) && read("DISCORD_CLIENT_SECRET", env) && read("DISCORD_BOT_TOKEN", env)
  );
}
export function discordClientId(env = process.env): string {
  return read("DISCORD_CLIENT_ID", env);
}
export function discordClientSecret(env = process.env): string {
  return read("DISCORD_CLIENT_SECRET", env);
}
/** One bot for every server. Lists and posts to channels; never leaves this module. */
export function discordBotToken(env = process.env): string {
  return read("DISCORD_BOT_TOKEN", env);
}

export function googleDriveConfigured(env = process.env): boolean {
  return Boolean(
    read("GOOGLE_DRIVE_CLIENT_ID", env) &&
      read("GOOGLE_DRIVE_CLIENT_SECRET", env) &&
      read("GOOGLE_PICKER_API_KEY", env) &&
      read("GOOGLE_CLOUD_PROJECT_NUMBER", env)
  );
}
export function googleDriveClientId(env = process.env): string {
  return read("GOOGLE_DRIVE_CLIENT_ID", env);
}
export function googleDriveClientSecret(env = process.env): string {
  return read("GOOGLE_DRIVE_CLIENT_SECRET", env);
}
/** Browser key for Google's picker. Restrict it to this app's origins in the Cloud console. */
export function googlePickerApiKey(env = process.env): string {
  return read("GOOGLE_PICKER_API_KEY", env);
}
/** The picker needs the Cloud project number so Google grants access to the folder picked. */
export function googleCloudProjectNumber(env = process.env): string {
  return read("GOOGLE_CLOUD_PROJECT_NUMBER", env);
}

export function executionOAuthCookieName(kind: string): string {
  return `vistrial_exec_oauth_${kind}`;
}
