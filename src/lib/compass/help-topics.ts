/** Topics a help article can sit under. Matches the help_articles check in the database. */
export const HELP_ARTICLE_TOPICS = ["general", "leads", "results", "agents", "connections", "team", "onboarding", "privacy", "billing"] as const;
export type HelpArticleTopic = (typeof HELP_ARTICLE_TOPICS)[number];
