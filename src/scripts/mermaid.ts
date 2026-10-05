const colorCanvas = document.createElement("canvas");
colorCanvas.width = 1;
colorCanvas.height = 1;
const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });

function tokenAsHex(name: string, computed: CSSStyleDeclaration) {
  const token = computed.getPropertyValue(name).trim();
  if (!colorContext || !token) return "";
  colorContext.clearRect(0, 0, 1, 1);
  colorContext.fillStyle = `hsl(${token})`;
  colorContext.fillRect(0, 0, 1, 1);
  const [red, green, blue] = colorContext.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getThemeConfig(dark: boolean) {
  const computed = getComputedStyle(document.documentElement);
  const color = (name: string) => tokenAsHex(name, computed);
  return {
    theme: "base" as const,
    themeVariables: {
      darkMode: dark,
      background: color("--background"),
      primaryColor: color("--card"),
      primaryTextColor: color("--card-foreground"),
      primaryBorderColor: color("--border"),
      lineColor: color("--primary"),
      secondaryColor: color("--secondary"),
      tertiaryColor: color("--muted"),
      mainBkg: color("--card"),
      nodeBorder: color("--border"),
      clusterBkg: color("--muted"),
      clusterBorder: color("--border"),
      titleColor: color("--foreground"),
      edgeLabelBackground: color("--background"),
      actorBkg: color("--primary"),
      actorBorder: color("--ring"),
      actorTextColor: color("--primary-foreground"),
      actorLineColor: color("--primary"),
      signalColor: color("--primary"),
      signalTextColor: color("--foreground"),
      labelBoxBkgColor: color("--muted"),
      labelBoxBorderColor: color("--border"),
      labelTextColor: color("--foreground"),
      loopTextColor: color("--muted-foreground"),
      noteBorderColor: color("--primary"),
      noteBkgColor: color("--card"),
      noteTextColor: color("--foreground"),
      activationBorderColor: color("--border"),
      activationBkgColor: color("--muted"),
      sequenceNumberColor: color("--foreground"),
    },
  };
}

// 页面包含图表时才下载 Mermaid，主题切换和导航通过同一个队列渲染。
let queue = Promise.resolve();
let revision = 0;
let renderedTheme: boolean | undefined;
const isDark = () => document.documentElement.classList.contains("dark");

function schedule(force = false) {
  const containers = [
    ...document.querySelectorAll<HTMLElement>(".mermaid-container"),
  ];
  if (!containers.length) return;
  const version = ++revision;
  const dark = isDark();
  queue = queue
    .then(async () => {
      if (version !== revision) return;
      const { default: mermaid } = await import("mermaid");
      if (version !== revision) return;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        ...getThemeConfig(dark),
      });
      for (const container of containers) {
        if (version !== revision || !container.isConnected) return;
        if (
          !force &&
          container.dataset.rendered === "true" &&
          renderedTheme === dark
        )
          continue;
        const code = container.dataset.chart;
        const id = container.dataset.chartId;
        if (!code || !id) continue;
        try {
          const { svg, bindFunctions } = await mermaid.render(
            `${id}-${version}`,
            code,
          );
          if (version !== revision || !container.isConnected) return;
          container.innerHTML = svg;
          bindFunctions?.(container);
          container.dataset.rendered = "true";
        } catch (error) {
          console.error("图表渲染失败", error);
          container.textContent = "图表渲染失败";
        }
      }
      renderedTheme = dark;
    })
    .catch((error) => console.error("图表加载失败", error));
}

let observer: MutationObserver | undefined;
function initialize() {
  observer?.disconnect();
  if (!document.querySelector(".mermaid-container")) return;
  let dark = isDark();
  observer = new MutationObserver(() => {
    const next = isDark();
    if (next !== dark) {
      dark = next;
      schedule(true);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  schedule();
}
document.addEventListener("astro:before-swap", () => {
  revision++;
  observer?.disconnect();
});
document.addEventListener("astro:page-load", initialize);
initialize();
