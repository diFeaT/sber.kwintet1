/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VIBLY_URL?: string;
  readonly VITE_VIBLY_ANON_KEY?: string;
  readonly VITE_VIBLY_PROJECT_ID?: string;
}

interface ImportMeta { readonly env: ImportMetaEnv }
