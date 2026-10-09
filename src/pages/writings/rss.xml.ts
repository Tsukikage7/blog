import { createContentFeed } from "@lib/rss";

export const GET = () =>
  createContentFeed({
    collections: ["writings"],
    label: "创作",
    path: "/writings/rss.xml",
  });
