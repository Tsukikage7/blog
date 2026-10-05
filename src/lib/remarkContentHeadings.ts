import { visit } from "unist-util-visit";
import type { Node, Parent } from "unist";

interface Heading extends Parent {
  type: "heading";
  depth: number;
}

// 页面模板负责一级标题；旧正文包含一级标题时，整体下移以保留层级关系。
export function remarkContentHeadings() {
  return (tree: Parent) => {
    const headings: Heading[] = [];
    visit(tree, "heading", (node: Node) => {
      headings.push(node as Heading);
    });
    if (headings.some((heading) => heading.depth === 1)) {
      headings.forEach((heading) => {
        heading.depth = Math.min(heading.depth + 1, 6);
      });
    }
  };
}
