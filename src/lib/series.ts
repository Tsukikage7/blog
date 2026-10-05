import { getCollection } from "astro:content";
import { buildSeries } from "./seriesModel";

export async function getSeries() {
  const [definitions, posts, notes, writings] = await Promise.all([
    getCollection("series"),
    getCollection("blog"),
    getCollection("notes"),
    getCollection("writings"),
  ]);
  return buildSeries(definitions, [...posts, ...notes, ...writings]);
}
