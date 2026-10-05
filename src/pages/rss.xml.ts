import { createContentFeed } from "@lib/rss";

export const GET = () =>
  createContentFeed({
    collections: ["blog"],
    label: "技术",
    path: "/rss.xml",
    limit: 25,
  });
