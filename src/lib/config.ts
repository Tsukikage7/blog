import { SITE_URL } from "./site";
import avatar from "@assets/avatar.webp";
import avatarThumbnail from "@assets/avatar-thumbnail.webp";

export const AVATAR_IMAGE = avatar;

export const PAGINATION_CONFIG = {
  BLOG_ENTRIES_PER_PAGE: 10,

  NOTES_DEFAULT_PAGE_SIZE: 10,

  WRITINGS_ENTRIES_PER_PAGE: 10,

  DEFAULT_PAGE_SIZE: 8,
} as const;

export const getPageSize = (
  type: "blog" | "notes" | "writings" = "blog",
): number => {
  switch (type) {
    case "blog":
      return PAGINATION_CONFIG.BLOG_ENTRIES_PER_PAGE;
    case "notes":
      return PAGINATION_CONFIG.NOTES_DEFAULT_PAGE_SIZE;
    case "writings":
      return PAGINATION_CONFIG.WRITINGS_ENTRIES_PER_PAGE;
    default:
      return PAGINATION_CONFIG.DEFAULT_PAGE_SIZE;
  }
};

export type PageType = "blog" | "notes" | "writings";

export const SITE_INFO = {
  NAME: (import.meta.env.PUBLIC_SITE_NAME as string) || "Tsukikage",
  SITE_NAME: (import.meta.env.PUBLIC_SITE_NAME as string) || "Tsukikage",
  SUBNAME:
    (import.meta.env.PUBLIC_SITE_SUBTITLE as string) || "文字、音乐与日常",

  DESCRIPTION:
    (import.meta.env.PUBLIC_SITE_DESCRIPTION as string) ||
    "一个爱读书、听歌和写字的人。这里存放文字、音乐与日常。",

  URL: SITE_URL,
  AUTHOR: (import.meta.env.PUBLIC_SITE_AUTHOR as string) || "Tsukikage",

  LOGO_IMAGE: avatar.src,

  AUTHOR_AVATAR: avatarThumbnail.src,
  KEY_WORDS:
    (import.meta.env.PUBLIC_SITE_KEYWORDS as string) ||
    "Tsukikage, 个人博客, 写作, 阅读, 音乐, 日常",
  GOOGLE_ANALYTICS_ID:
    (import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID as string) || "",
  BAIDU_ANALYTICS_ID:
    (import.meta.env.PUBLIC_BAIDU_ANALYTICS_ID as string) || "",

  START_DATE: "2023-01-01" as const,
};

export const UI_CONFIG = {
  ENABLE_GLASS_EFFECT: true,
  GLASS_BLUR_INTENSITY: "light", // 'light' | 'medium' | 'heavy'
} as const;

export const MUSIC_PLAYER_CONFIG = {
  ENABLED: true,

  PLAYLIST_ID: "2539599584",

  FIXED: true,

  SHOW_LRC: true,

  ORDER: "random" as "circulation" | "order" | "random" | "single",

  PRELOAD: "auto" as "none" | "metadata" | "auto",

  AUTOPLAY: false,
} as const;
