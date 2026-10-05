

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_DEBUG: string;
  readonly PUBLIC_LOG_LEVEL: string;
  readonly PUBLIC_TWIKOO_ENV_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}