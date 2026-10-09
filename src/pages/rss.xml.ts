import { createContentFeed } from "@lib/rss";

export const GET = () =>
  createContentFeed({
    collections: ["blog"],
    label: "文章",
    path: "/rss.xml",
    limit: 25,
  });
