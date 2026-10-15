// 博客自有图片统一从 R2 资源域名加载，本地文件只保留为编辑原稿。
export const imageAsset = (path: string): string =>
  `https://assets.tsukikage7.com/blog/${path}?v=20261010b`;

export const avatarImage = (
  size: 16 | 32 | 64 | 144 | 180 | 240 | 288 | 480,
): string => imageAsset(`site/avatar-${size}.webp`);
