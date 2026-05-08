// Next.js / Turbopack only inlines `process.env.NAME` when the property is
// accessed literally in source. Bracket-access (`process.env[key]`) is left
// as a runtime lookup, which works on the server but is undefined in client
// bundles — so the env values must be read with literal keys here.
function requireEnv(key: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;
