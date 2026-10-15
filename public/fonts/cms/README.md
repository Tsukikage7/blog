# 后台字体

后台使用自托管的 Noto Sans SC 可变字体（400–700 字重），授权见 `OFL.txt`，来源与校验值见 `source.json`。

`noto-sans-sc.woff2` 包含后台界面、现有文章使用的字符和可打印 ASCII 字符。未包含的字符由系统中文字体补齐。

新增文章或修改后台文案后，可在项目根目录运行 `pnpm run cms:font` 重新生成字体子集。脚本优先使用 `.cms/font-source/` 中的缓存；首次生成时会从 Google Fonts 官方仓库下载源字体。常规构建直接使用已生成的 WOFF2 文件。
