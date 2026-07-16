/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the EngageOS Next.js API. Empty = same origin. */
  readonly VITE_API_BASE?: string;
  /** Supabase project URL — used only for the anon `campaign_display` RPC. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
