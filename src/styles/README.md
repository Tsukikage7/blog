# 样式维护约定

项目使用 Tailwind CSS 4，配置以 CSS 为入口，不再维护 JavaScript 配置或旧颜色别名。

| 位置                    | 唯一职责                                                   |
| ----------------------- | ---------------------------------------------------------- |
| `main.css`              | 导入样式和声明官方插件，不写页面修补规则                   |
| `theme.css`             | 全站浅色/深色语义变量、字体、字号、圆角、断点、通用动效    |
| `fonts.css`             | 字体文件注册，不决定正文用什么字体                         |
| `base.css`              | HTML 元素默认样式、焦点和减少动态效果设置                  |
| `layout.css`            | `site-container` 和通用区块尺寸                            |
| `prose.css`             | `prose-site` 正文排版，包含引用、表格、行内代码和链接      |
| `markdown.css`          | 代码高亮、复制/折叠、Mermaid、图片放大等 Markdown 交互样式 |
| `twikoo-custom.css`     | 第三方评论组件的主题适配                                   |
| `components/toast.css`  | 静态和动态 Toast 共用的样式                                |
| 各组件 scoped `<style>` | 仅属于该组件的布局和交互状态                               |

## 修改方式

- 全站换色、字体和圆角，只修改 `theme.css`；组件通过语义变量或 Tailwind 类消费它们。
- 正文容器统一使用 `prose prose-site`。字号允许选择 `prose-sm`、`prose-base` 或 `prose-lg`；不再叠加颜色主题或 `prose-invert`。
- 常规布局优先使用 Tailwind；复杂组件保留局部 CSS，但不得重定义 Tailwind 的 `.rounded-*`、`.container`、`.line-clamp-*` 等类。
- 组件状态在所属组件中定义；调用方通过 props 或组件明确提供的 CSS 变量传值，不用跨组件 `!important` 覆盖。
- 脚本可设置进度、动画时长、定位等运行时值，不注入静态样式表。
- 只有第三方样式适配、Shiki 内联颜色和减少动态效果等确有需要的规则使用 `!important`，并说明原因。
- Astro scoped CSS 使用 `@apply` 时，通过 `@reference` 引用 `main.css`，避免生成第二份全局样式。

修改共享样式后执行生产构建、TypeScript 检查，并在浏览器核对桌面和手机、浅色和深色的代表页面。依赖版本以 npm 官方 `latest` 标签为准；Tailwind 核心与 Vite 插件保持相同稳定版本并锁定。
