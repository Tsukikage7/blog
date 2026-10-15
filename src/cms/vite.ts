import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { createLocalBackend } from "./local";
import { handleApi, json } from "./http";
import { Readable } from "node:stream";

export function cmsLocalApi(): Plugin {
  return {
    name: "blog-cms-local-api",
    apply: "serve",
    async configureServer(server) {
      const root = server.config.root;
      const local = await createLocalBackend(
        root,
        loadEnv(server.config.mode, root, ""),
      );
      server.httpServer?.once("close", local.close);
      server.middlewares.use(async (incoming, outgoing, next) => {
        if (!incoming.url?.startsWith("/admin")) return next();
        const host = incoming.headers.host || "";
        const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          incoming.socket.remoteAddress || "",
        );
        if (
          !loopback ||
          !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
        ) {
          outgoing.writeHead(403, { "Content-Type": "application/json" });
          outgoing.end(JSON.stringify({ error: "本地 CMS 仅允许从本机访问" }));
          return;
        }
        if (!incoming.url.startsWith("/admin/api/")) return next();
        try {
          const body = ["GET", "HEAD"].includes(incoming.method || "GET")
            ? undefined
            : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(",") : value);
          }
          const request = new Request(`http://${host}${incoming.url}`, {
            method: incoming.method,
            headers,
            body,
            ...(body ? { duplex: "half" } : {}),
          } as RequestInit);
          const response = await handleApi(request, local.backend);
          outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
          );
          outgoing.end(await response.text());
        } catch (error) {
          const response = json(
            { error: error instanceof Error ? error.message : "本地 API 错误" },
            500,
          );
          outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
          );
          outgoing.end(await response.text());
        }
      });
    },
  };
}
