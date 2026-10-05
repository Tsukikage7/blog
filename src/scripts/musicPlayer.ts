import type Plyr = require("plyr");
import {
  getPlaylist,
  restorePlayback,
  restorePosition,
  savePlayback,
  textElement,
  type Song,
} from "@lib/musicPlaylist";

let active: { root: HTMLElement; dispose: () => void } | undefined;

function initialize() {
  const root = document.getElementById("music-player-fab");
  if (!root || active?.root === root) return;
  active?.dispose();
  const controller = new AbortController();
  const { signal } = controller;
  const playlistId = root.dataset.playlistId!;
  const audio = root.querySelector<HTMLAudioElement>("audio")!;
  const button = root.querySelector<HTMLButtonElement>("#fab-button")!;
  const list = root.querySelector<HTMLElement>("#playlist-list")!;
  const title = root.querySelector<HTMLElement>("#panel-title")!;
  let songs: Song[] = [];
  let index = 0;
  let player: Plyr | undefined;
  let loading = false;
  let lastSaved = 0;

  const save = () => savePlayback(playlistId, songs, index, audio);
  const loadSong = (next: number) => {
    const song = songs[next];
    if (!song) return;
    index = next;
    audio.src = song.url;
    root.querySelector<HTMLImageElement>("#fab-cover")!.src = song.cover;
    root.querySelector<HTMLImageElement>("#panel-cover")!.src = song.cover;
    title.textContent = song.title;
    root.querySelector<HTMLElement>("#panel-artist")!.textContent = song.artist;
    list
      .querySelectorAll(".playlist-item-compact")
      .forEach((item, i) => item.classList.toggle("active", i === index));
  };
  const play = () =>
    audio.play().catch(() => {
      title.textContent = "播放失败，请重试或切换歌曲";
    });
  const renderPlaylist = () => {
    list.replaceChildren(
      ...songs.map((song, i) => {
        const item = textElement(
          "button",
          "playlist-item-compact",
        ) as HTMLButtonElement;
        item.type = "button";
        item.dataset.index = String(i);
        const image = document.createElement("img");
        image.src = song.cover;
        image.alt = "";
        image.loading = "lazy";
        const info = textElement("div", "item-info-compact");
        info.append(
          textElement("div", "item-name", song.title),
          textElement("div", "item-singer", song.artist),
        );
        item.append(image, info, textElement("div", "item-playing-icon", "♪"));
        return item;
      }),
    );
  };
  const load = async () => {
    if (player || loading) return;
    loading = true;
    title.textContent = "加载中…";
    try {
      const [playlist, { default: Player }] = await Promise.all([
        getPlaylist(playlistId),
        import("plyr") as unknown as Promise<{ default: typeof Plyr }>,
      ]);
      if (signal.aborted) return;
      songs = playlist;
      player = new Player(audio, {
        controls: ["play", "progress", "current-time", "mute", "volume"],
        volume: 0.7,
        autoplay: false,
      });
      renderPlaylist();
      const saved = restorePlayback(playlistId, songs);
      loadSong(saved?.index ?? 0);
      restorePosition(audio, saved?.currentTime ?? 0, signal);
      if (root.dataset.autoplay === "true") void play();
    } catch {
      if (signal.aborted) return;
      title.textContent = "歌单加载失败";
      const retry = textElement(
        "button",
        "p-4 underline",
        "重试",
      ) as HTMLButtonElement;
      retry.type = "button";
      retry.addEventListener("click", () => void load(), { signal });
      list.replaceChildren(retry);
    } finally {
      loading = false;
    }
  };
  const expand = (expanded: boolean) => {
    root.classList.toggle("expanded", expanded);
    button.setAttribute("aria-expanded", String(expanded));
    if (expanded) void load();
  };
  button.addEventListener(
    "click",
    () => expand(!root.classList.contains("expanded")),
    { signal },
  );
  root
    .querySelector("#close-panel-btn")!
    .addEventListener("click", () => expand(false), { signal });
  document.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Node && !root.contains(event.target))
        expand(false);
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") expand(false);
    },
    { signal },
  );
  list.addEventListener(
    "click",
    (event) => {
      const item = (event.target as Element).closest<HTMLButtonElement>(
        "[data-index]",
      );
      if (item) {
        loadSong(Number(item.dataset.index));
        void play();
      }
    },
    { signal },
  );
  audio.addEventListener(
    "ended",
    () => {
      if (!songs.length) return;
      loadSong(
        root.dataset.mode === "shuffle"
          ? Math.floor(Math.random() * songs.length)
          : (index + 1) % songs.length,
      );
      void play();
    },
    { signal },
  );
  for (const event of ["play", "pause"] as const)
    audio.addEventListener(
      event,
      () => {
        root.classList.toggle("playing", !audio.paused);
        save();
      },
      { signal },
    );
  audio.addEventListener(
    "timeupdate",
    () => {
      if (Date.now() - lastSaved > 5000) {
        save();
        lastSaved = Date.now();
      }
    },
    { signal },
  );
  window.addEventListener("pagehide", save, { signal });
  active = {
    root,
    dispose: () => {
      save();
      controller.abort();
      audio.pause();
      player?.destroy();
      audio.removeAttribute("src");
    },
  };
}

// 普通页面保留同一个播放器，切换到音乐馆时释放音频及所有事件。
document.addEventListener("astro:before-swap", (event) => {
  if (
    !(event as Event & { newDocument: Document }).newDocument.getElementById(
      "music-player-fab",
    )
  ) {
    active?.dispose();
    active = undefined;
  }
});
document.addEventListener("astro:page-load", initialize);
initialize();
