import { getEntries } from "@lib/contentParser";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  try {
    const allPosts = await getEntries("blog");

    
    const articles = allPosts.map((post) => ({
      slug: post.id,
      title: post.data.title,
      description: post.data.description,
      created: post.data.created,
      categories: post.data.categories,
      tags: post.data.tags || [],
    }));


    articles.sort((a, b) => {
      const dateA = new Date(a.created || 0);
      const dateB = new Date(b.created || 0);
      return dateB.getTime() - dateA.getTime();
    });

    return new Response(JSON.stringify(articles), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", 
      },
    });
  } catch (error) {
    console.error("获取博客文章失败:", error);
    return new Response(
      JSON.stringify({ error: "获取博客文章失败" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
