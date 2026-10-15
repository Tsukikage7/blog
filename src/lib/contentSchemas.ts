import { z } from "astro/zod";

const baseContent = z.object({
  title: z.string(),
  description: z.string().optional(),
  created: z.coerce.date().optional(),
  updated: z.coerce.date().optional(),
  draft: z.boolean().default(false),
});

// 三种正文共享合集标识和章节顺序，跨集合校验由 seriesModel 完成。
const seriesFields = {
  series: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  seriesOrder: z.number().int().positive().optional(),
};

const social = z.object({
  discord: z.string().optional(),
  email: z.string().optional(),
  facebook: z.string().optional(),
  github: z.string().optional(),
  instagram: z.string().optional(),
  linkedIn: z.string().optional(),
  pinterest: z.string().optional(),
  tiktok: z.string().optional(),
  website: z.string().optional(),
  youtube: z.string().optional(),
  wechat: z.string().optional(),
  xhs: z.string().optional(),
  weibo: z.string().optional(),
  rss: z.string().optional(),
});

export function createContentSchemas<Image extends z.ZodType>(
  image: () => Image,
) {
  return {
    about: baseContent.extend({
      image: z.union([z.string().url(), image()]).optional(),
      imageAlt: z.string().optional(),
      // 个人信息
      info: z
        .object({
          name: z.string(),
          title: z.string(),
          location: z.string().optional(),
          summary: z.string().optional(),
          age: z.number().optional(),
        })
        .optional(),
      // 技能分类
      skillCategories: z
        .array(
          z.object({
            name: z.string(),
            icon: z.string().optional(),
            skills: z.array(z.string()),
          }),
        )
        .optional(),
      // 兼容旧的 skills 字段
      skills: z.array(z.string()).optional(),
      // 工作经历
      experience: z
        .array(
          z.object({
            title: z.string(),
            company: z.string(),
            logo: z.string().optional(),
            period: z.string(),
            location: z.string().optional(),
            description: z.string().optional(),
            highlights: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      // 教育背景
      education: z
        .array(
          z.object({
            degree: z.string(),
            school: z.string(),
            logo: z.string().optional(),
            period: z.string().optional(),
            badge: z.string().optional(),
            location: z.string().optional(),
          }),
        )
        .optional(),
      // 开源项目
      openSource: z
        .array(
          z.object({
            name: z.string(),
            logo: z.string().optional(),
            role: z.string(),
            period: z.string(),
            description: z.string().optional(),
            url: z.string().optional(),
            contributions: z.array(z.string()).optional(),
            links: z
              .array(
                z.object({
                  label: z.string(),
                  url: z.string().url(),
                  status: z.enum(["已合入", "评审中", "讨论中"]),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
      social: social.optional(),
    }),
    blog: baseContent.extend({
      // public 目录和远程图片按 URL 使用，内容旁的相对路径交给 Astro 解析。
      image: z
        .union([z.string().regex(/^(?:\/(?!\/)|https?:\/\/)/), image()])
        .optional(),
      categories: z.array(z.string()),
      tags: z.array(z.string()).optional(),
      ...seriesFields,
    }),
    series: baseContent.extend({
      description: z.string(),
      kind: z.enum(["technical", "literary"]).default("technical"),
      genre: z
        .enum(["小说", "短篇小说", "散文", "诗歌", "杂文", "随笔"])
        .optional(),
      audience: z.string().optional(),
      prerequisites: z.string().optional(),
    }),
    categories: baseContent.extend({
      slug: z.string().optional(),
      icon: z.string().optional(),
      image: image().optional(),
      color: z.string().default("#007bff"),
      parentId: z.string().optional(),
    }),
    tags: baseContent.extend({
      color: z.string().default("#007bff"),
    }),
    notes: baseContent.extend({
      images: z
        .array(
          z.object({
            src: image(),
            alt: z.string().default(""),
          }),
        )
        .optional(),

      image: z.union([image(), z.string()]).optional(),
      tags: z.array(z.string()).optional(),
      ...seriesFields,
      mood: z.string().optional(),
      location: z.string().optional(),
    }),
    home: baseContent.extend({
      image: image().optional(),
      hero: z
        .object({
          title: z.string(),
          subtitle: z.string().optional(),
          backgroundImage: z.string().optional(),
          ctaButton: z
            .object({
              text: z.string(),
              link: z.string(),
            })
            .optional(),
        })
        .optional(),
      features: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            icon: z.string().optional(),
          }),
        )
        .optional(),
    }),
    search: baseContent.extend({
      searchableCollections: z
        .array(z.string())
        .default(["blog", "notes", "writings"]),
      searchConfig: z
        .object({
          placeholder: z.string().default("搜索内容..."),
          maxResults: z.number().default(10),
          enableHighlight: z.boolean().default(true),
        })
        .optional(),
    }),
    socialConfig: baseContent.extend({
      platforms: social,
      displayOrder: z.array(z.string()).optional(),
      showInHeader: z.boolean().default(true),
      showInFooter: z.boolean().default(true),
    }),
    terms: baseContent,
    writings: baseContent.extend({
      // public 目录和远程封面按 URL 使用，相对路径交给 Astro 解析。
      image: z
        .union([z.string().regex(/^(?:\/(?!\/)|https?:\/\/)/), image()])
        .optional(),
      // 体裁：短篇小说、散文、诗歌、杂文等
      genre: z
        .enum(["小说", "短篇小说", "散文", "诗歌", "杂文", "随笔"])
        .optional(),
      ...seriesFields,
      // 目录中的章节名，可与正文标题分别维护。
      chapterTitle: z.string().optional(),
      // 字数（可自动计算或手动指定）
      wordCount: z.number().optional(),
      // 氛围/情绪标签
      mood: z.string().optional(),
      // 标签
      tags: z.array(z.string()).optional(),
    }),
  };
}
