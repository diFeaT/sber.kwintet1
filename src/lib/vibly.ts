import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const apiUrl = import.meta.env.VITE_VIBLY_URL?.trim();
const anonKey = import.meta.env.VITE_VIBLY_ANON_KEY?.trim();
const projectId = import.meta.env.VITE_VIBLY_PROJECT_ID?.trim();

export const isViblyConfigured = Boolean(apiUrl && anonKey && projectId);
export const viblyConfigurationError =
  "Vibly Cloud is not configured for this project. Use cloud_setup; managed credentials must not be copied into source files or .env.";

const client = createClient(
  apiUrl || "https://vaibly.dev/cloud/not-configured",
  anonKey || "not-configured",
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: projectId ? { "x-project-id": projectId } : {} },
  },
);

/** One browser client per project. Never create a second raw Supabase client. */
export const vibly: SupabaseClient = client;

/** Use at the start of code paths that require Cloud; static projects can ignore it. */
export function requireVibly(): SupabaseClient {
  if (!isViblyConfigured) throw new Error(viblyConfigurationError);
  return client;
}
