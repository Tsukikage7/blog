// 供应商返回的数据也设上限，避免异常响应占满 Worker 内存。
export async function providerJson<T>(
  response: Response,
  limit = 8 * 1024 * 1024,
): Promise<T> {
  if (Number(response.headers.get("Content-Length") || 0) > limit)
    throw new Error("供应商响应超过大小限制");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("供应商响应为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("供应商响应超过大小限制");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
