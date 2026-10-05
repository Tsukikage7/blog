import { SITE_INFO } from "./config";

export const NODE_ENV = import.meta.env.PROD ? "production" : "development";

export type Environment = "development" | "production";

export interface EnvConfig {
  SITE_URL: string;
  ENV: Environment;
  DEBUG: boolean;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
}

export function getEnvConfig(): EnvConfig {
  return {
    SITE_URL: SITE_INFO.URL,
    ENV: NODE_ENV,
    DEBUG: import.meta.env.PUBLIC_DEBUG === "true",
    LOG_LEVEL:
      (import.meta.env.PUBLIC_LOG_LEVEL as EnvConfig["LOG_LEVEL"]) || "info",
  };
}

export const isDevelopment = () => NODE_ENV === "development";
export const isProduction = () => NODE_ENV === "production";

export const envConfig = getEnvConfig();

export const logger = {
  debug: (...args: any[]) => {
    if (envConfig.DEBUG && ["debug"].includes(envConfig.LOG_LEVEL)) {
      console.debug("[DEBUG]", ...args);
    }
  },
  info: (...args: any[]) => {
    if (["debug", "info"].includes(envConfig.LOG_LEVEL)) {
      console.info("[INFO]", ...args);
    }
  },
  warn: (...args: any[]) => {
    if (["debug", "info", "warn"].includes(envConfig.LOG_LEVEL)) {
      console.warn("[WARN]", ...args);
    }
  },
  error: (...args: any[]) => {
    console.error("[ERROR]", ...args);
  },
};
