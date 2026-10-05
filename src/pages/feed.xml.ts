import { createContentFeed } from "@lib/rss";

export const GET = () =>
  createContentFeed({
    collections: ["blog", "notes", "writings"],
    label: "全站内容",
    path: "/feed.xml",
  });
