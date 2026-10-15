import { CmsError } from "./types";
export async function imageFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024)
    throw new CmsError(413, "图片大小需在 1 B 到 8 MiB 之间");
  const ascii = (start: number, length: number) =>
    new TextDecoder().decode(bytes.slice(start, start + length));
  let extension: string;
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  )
    extension = "png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    extension = "jpg";
  else if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) extension = "gif";
  else if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") extension = "webp";
  else throw new CmsError(415, "仅支持 PNG、JPEG、GIF、WebP 图片");
  const type = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  return { bytes, extension, type };
}
