import { absoluteUrl } from "@lib/site";
export function GET() {
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${absoluteUrl("/sitemap-index.xml")}\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
