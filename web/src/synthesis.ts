// Accounts allowed to ask for a synthesis (each one costs OpenAI credits).
// The server checks it for real (api/_synthese.ts, same default): this only greys out the button.
export const SYNTHESIS_USERS = (import.meta.env.VITE_SYNTHESE_AUTORISES || "thalia")
  .split(",")
  .map((name: string) => name.trim().toLowerCase())
  .filter(Boolean);
