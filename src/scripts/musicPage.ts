import {
  getPlaylist,
  restorePlayback,
  restorePosition,
  savePlayback,
  textElement,
  type Song,
} from "@lib/musicPlaylist";

let cleanup: (() => void) | undefined;
let currentRoot: HTMLElement | null = null;

function initialize() {
  const root = document.getElementById("music-page");
  if (!root || root === currentRoot) return;
  cleanup?.();
  currentRoot = root;
  const controller = new AbortController();
  const { signal } = controller;
  const playlistId = root.dataset.playlistId!;
  const audio = document.getElementById("audio-player") as HTMLAudioElement;
  const element = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  let songs: Song[] = [];
  let index = 0;
  let mode = root.dataset.mode || "random";
  let lyrics: { time: number; text: string }[] = [];
  let lyricsIndex = -1;
  let lyricsRequest: AbortController | undefined;
  let loading = false;
  let lastSaved = 0;
  const save = () => savePlayback(playlistId, songs, index, audio);
  const play = () =>
    audio.play().catch(() => {
      element("song-title").textContent = "播放失败，请重试或切换歌曲";
    });
  const showError = (message: string) => {
    const error = textElement("div", "error-state");
    error.append(textElement("p", "", message));
    element("playlist-container").replaceChildren(error);
    element("playlist-count").textContent = "(加载失败)";
  };
  const loadLyrics = async (song: Song) => {
    lyricsRequest?.abort();
    const request = new AbortController();
    lyricsRequest = request;
    lyrics = [];
    lyricsIndex = -1;
    const area = element("lyrics-area");
    area.replaceChildren(textElement("div", "lyrics-placeholder", "暂无歌词"));
    if (!song.lrc) return;
    try {
      const response = await fetch(song.lrc, { signal: request.signal });
      if (!response.ok) return;
      const text = await response.text();
      if (request.signal.aborted || signal.aborted) return;
      const timeRegex = /\[(\d{2,}):(\d{2})(?:\.(\d{1,3}))?\]/g;
      lyrics = text
        .split("\n")
        .flatMap((line) => {
          const matches = [...line.matchAll(timeRegex)];
          const value = line.replace(timeRegex, "").trim();
          return value
            ? matches.map((match) => ({
                time:
                  Number(match[1]) * 60 +
                  Number(match[2]) +
                  Number(`0.${match[3] || 0}`),
                text: value,
              }))
            : [];
        })
        .sort((a, b) => a.time - b.time);
      if (lyrics.length)
        area.replaceChildren(
          ...lyrics.map((line) => textElement("div", "lyrics-line", line.text)),
        );
    } catch {
      /* 无歌词时保留占位提示。 */
    }
  };
  const loadSong = (next: number, position = 0) => {
    const song = songs[next];
    if (!song) return;
    index = next;
    audio.src = song.url;
    restorePosition(audio, position, signal);
    element("song-title").textContent = song.title;
    element("song-artist").textContent = song.artist;
    element<HTMLImageElement>("cover-img").src = song.cover;
    element("music-bg").style.backgroundImage =
      `url(${JSON.stringify(song.cover)})`;
    element("progress-fill").style.width = "0%";
    element("time-current").textContent = "0:00";
    element("time-total").textContent = "0:00";
    root
      .querySelectorAll(".song-item")
      .forEach((item, i) => item.classList.toggle("active", i === index));
    void loadLyrics(song);
  };
  const renderPlaylist = () => {
    element("playlist-container").replaceChildren(
      ...songs.map((song, i) => {
        const item = textElement(
          "button",
          `song-item${i === index ? " active" : ""}`,
        ) as HTMLButtonElement;
        item.type = "button";
        item.dataset.index = String(i);
        const cover = textElement("div", "song-cover");
        const image = document.createElement("img");
        image.src = song.cover;
        image.alt = "";
        image.loading = "lazy";
        cover.append(image);
        const details = textElement("div", "song-details");
        details.append(
          textElement("div", "song-name", song.title),
          textElement("div", "song-singer", song.artist),
        );
        item.append(
          textElement("span", "song-index", String(i + 1).padStart(2, "0")),
          cover,
          details,
        );
        return item;
      }),
    );
  };
  const load = async (refresh = false) => {
    if (loading) return;
    loading = true;
    element("refresh-btn").classList.add("spinning");
    try {
      const playlist = await getPlaylist(playlistId, refresh);
      if (signal.aborted) return;
      save();
      audio.pause();
      songs = playlist;
      const saved = restorePlayback(playlistId, songs);
      index = saved?.index ?? 0;
      renderPlaylist();
      loadSong(index, saved?.currentTime ?? 0);
      element("playlist-count").textContent = `(${songs.length} 首)`;
    } catch {
      if (!signal.aborted) showError("加载歌单失败，请点击刷新重试");
    } finally {
      loading = false;
      element("refresh-btn").classList.remove("spinning");
    }
  };
  const next = (direction: number, autoplay = !audio.paused) => {
    if (!songs.length) return;
    loadSong(
      mode === "random"
        ? Math.floor(Math.random() * songs.length)
        : (index + direction + songs.length) % songs.length,
    );
    if (autoplay) void play();
  };
  const showMode = () => {
    element("icon-random").classList.toggle("hidden", mode !== "random");
    element("icon-loop").classList.toggle("hidden", mode !== "loop");
  };
  const formatTime = (seconds: number) =>
    Number.isFinite(seconds)
      ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
      : "0:00";
  const updatePlayback = () => {
    element("icon-play").classList.toggle("hidden", !audio.paused);
    element("icon-pause").classList.toggle("hidden", audio.paused);
    element("play-btn").setAttribute(
      "aria-label",
      audio.paused ? "播放" : "暂停",
    );
    root
      .querySelector(".bar-cover")!
      .classList.toggle("playing", !audio.paused);
    save();
  };
  for (const event of ["play", "pause"] as const)
    audio.addEventListener(event, updatePlayback, { signal });
  element("play-btn").addEventListener(
    "click",
    () => {
      if (audio.paused) void play();
      else audio.pause();
    },
    { signal },
  );
  element("prev-btn").addEventListener("click", () => next(-1), { signal });
  element("next-btn").addEventListener("click", () => next(1), { signal });
  element("mode-btn").addEventListener(
    "click",
    () => {
      mode = mode === "random" ? "loop" : "random";
      showMode();
    },
    { signal },
  );
  element("shuffle-btn").addEventListener(
    "click",
    () => {
      if (songs.length) {
        loadSong(Math.floor(Math.random() * songs.length));
        void play();
      }
    },
    { signal },
  );
  element("refresh-btn").addEventListener("click", () => void load(true), {
    signal,
  });
  element("playlist-container").addEventListener(
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
  const volume = element<HTMLInputElement>("volume-slider");
  volume.addEventListener(
    "input",
    () => {
      audio.volume = Number(volume.value) / 100;
    },
    { signal },
  );
  audio.volume = Number(volume.value) / 100;
  audio.addEventListener(
    "timeupdate",
    () => {
      element("progress-fill").style.width =
        `${(audio.currentTime / audio.duration) * 100 || 0}%`;
      element("time-current").textContent = formatTime(audio.currentTime);
      let activeIndex = -1;
      for (
        let i = 0;
        i < lyrics.length && lyrics[i].time <= audio.currentTime;
        i++
      )
        activeIndex = i;
      if (lyricsIndex !== activeIndex) {
        lyricsIndex = activeIndex;
        const lines =
          element("lyrics-area").querySelectorAll<HTMLElement>(".lyrics-line");
        lines.forEach((line, i) =>
          line.classList.toggle("active", i === activeIndex),
        );
        const line = lines[activeIndex];
        if (line)
          element("lyrics-area").scrollTo({
            top: line.offsetTop - element("lyrics-area").clientHeight / 2,
            behavior: "smooth",
          });
      }
      if (Date.now() - lastSaved > 5000) {
        save();
        lastSaved = Date.now();
      }
    },
    { signal },
  );
  audio.addEventListener(
    "loadedmetadata",
    () => {
      element("time-total").textContent = formatTime(audio.duration);
    },
    { signal },
  );
  audio.addEventListener("ended", () => next(1, true), { signal });
  const progress = element("progress-bar");
  const seek = (event: MouseEvent) => {
    if (!Number.isFinite(audio.duration)) return;
    const rect = progress.getBoundingClientRect();
    audio.currentTime =
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) *
      audio.duration;
  };
  let dragging = false;
  progress.addEventListener("click", seek, { signal });
  progress.addEventListener(
    "mousedown",
    () => {
      dragging = true;
    },
    { signal },
  );
  document.addEventListener(
    "mouseup",
    () => {
      dragging = false;
    },
    { signal },
  );
  document.addEventListener(
    "mousemove",
    (event) => {
      if (dragging) seek(event);
    },
    { signal },
  );
  window.addEventListener("pagehide", save, { signal });
  cleanup = () => {
    save();
    controller.abort();
    lyricsRequest?.abort();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  };
  showMode();
  void load();
}

document.addEventListener("astro:before-swap", () => {
  cleanup?.();
  cleanup = undefined;
  currentRoot = null;
});
document.addEventListener("astro:page-load", initialize);
initialize();
