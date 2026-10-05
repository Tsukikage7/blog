import { SITE_INFO } from "./config";

export interface Song {
  id: string;
  title: string;
  artist: string;
  url: string;
  cover: string;
  lrc?: string;
}

interface PlaybackState {
  playlistId?: string;
  index: number;
  songId: string | number;
  currentTime: number;
  timestamp: number;
}

const pending = new Map<string, Promise<Song[]>>();
const STATE_KEY = "music_player_state";

function mediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    /* 忽略无效的第三方媒体地址。 */
  }
}

function normalize(data: unknown): Song[] {
  if (!Array.isArray(data)) throw new Error("歌单格式错误");
  return data.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const url = mediaUrl(item.url);
    if (!url) return [];
    return [
      {
        id: String(item.id ?? index),
        title: String(item.name || item.title || "未知歌曲"),
        artist: Array.isArray(item.artist)
          ? item.artist.join("/")
          : String(item.artist || item.author || "未知歌手"),
        url,
        cover: mediaUrl(item.pic || item.cover) || SITE_INFO.AUTHOR_AVATAR,
        lrc: mediaUrl(item.lrc),
      },
    ];
  });
}

// 两种播放器共享歌单缓存和请求，存储被禁用时仍可正常使用。
export function getPlaylist(
  playlistId: string,
  refresh = false,
): Promise<Song[]> {
  const existing = pending.get(playlistId);
  if (existing) return existing;
  const task = (async () => {
    const cacheKey = `music_playlist_${playlistId}`;
    if (!refresh) {
      try {
        const timestamp = Number(localStorage.getItem(`${cacheKey}_time`));
        if (Date.now() - timestamp < 3600000) {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const songs = normalize(JSON.parse(cached));
            if (songs.length) return songs;
          }
        }
      } catch {
        /* 缓存损坏时重新获取。 */
      }
    }
    const response = await fetch(
      `https://api.i-meto.com/meting/api?server=netease&type=playlist&id=${encodeURIComponent(playlistId)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error("歌单服务暂不可用");
    const data: unknown = await response.json();
    const songs = normalize(data);
    if (!songs.length) throw new Error("歌单为空");
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
      localStorage.setItem(`${cacheKey}_time`, String(Date.now()));
    } catch {
      /* 存储不可用不影响播放。 */
    }
    return songs;
  })();
  pending.set(playlistId, task);
  void task.finally(() => pending.delete(playlistId)).catch(() => {});
  return task;
}

export function savePlayback(
  playlistId: string,
  songs: Song[],
  index: number,
  audio: HTMLAudioElement,
) {
  if (!songs[index]) return;
  try {
    const state: PlaybackState = {
      playlistId,
      index,
      songId: songs[index].id,
      currentTime: audio.currentTime || 0,
      timestamp: Date.now(),
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时跳过进度同步。 */
  }
}

export function restorePlayback(playlistId: string, songs: Song[]) {
  try {
    const saved: PlaybackState = JSON.parse(
      localStorage.getItem(STATE_KEY) || "null",
    );
    if (
      !saved ||
      (saved.playlistId && saved.playlistId !== playlistId) ||
      !Number.isFinite(saved.timestamp) ||
      Date.now() - saved.timestamp > 86400000
    )
      return;
    let index = songs.findIndex((song) => song.id === String(saved.songId));
    // 旧版浮动播放器仅保存歌曲序号，升级后兼容其播放进度。
    if (
      index < 0 &&
      !saved.playlistId &&
      Number.isInteger(saved.index) &&
      saved.index >= 0 &&
      saved.index < songs.length
    )
      index = saved.index;
    if (
      index < 0 ||
      !Number.isFinite(saved.currentTime) ||
      saved.currentTime < 0
    )
      return;
    return { index, currentTime: saved.currentTime };
  } catch {
    return;
  }
}

export function restorePosition(
  audio: HTMLAudioElement,
  time: number,
  signal: AbortSignal,
) {
  if (!time) return;
  const source = audio.src;
  audio.addEventListener(
    "loadedmetadata",
    () => {
      if (audio.src === source && Number.isFinite(audio.duration))
        audio.currentTime = Math.min(time, audio.duration);
    },
    { once: true, signal },
  );
}

export function textElement(tag: string, className: string, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
