import { createContentFeed } from "@lib/rss";

export const GET = () =>
  createContentFeed({
    collections: ["writings"],
    label: "文字",
    path: "/writings/rss.xml",
  });
