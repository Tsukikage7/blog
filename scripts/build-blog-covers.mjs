import { mkdir, writeFile } from "node:fs/promises";

// 技术封面使用固定的浅色底与蓝绿配色，图形表达对应文章的问题。
const directory = new URL("../public/images/blog-covers/", import.meta.url);
const palette = {
  ink: "#263641",
  green: "#438b7e",
  blue: "#82a8ce",
  pale: "#dbece7",
  line: "#adc6d7",
};
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const text = (x, y, value, size = 28, fill = palette.green, weight = 500) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escape(value)}</text>`;
const circle = (x, y, radius = 15, fill = palette.blue) =>
  `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}"/>`;
const box = (
  x,
  y,
  width,
  height,
  fill = palette.pale,
  stroke = "none",
  radius = 16,
) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
const path = (d, stroke = palette.line, arrow = false, dash = false) =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" ${arrow ? 'marker-end="url(#arrow)"' : ""} ${dash ? 'stroke-dasharray="7 11"' : ""}/>`;
const labelBox = (x, y, label, fill = palette.pale, width = 150) =>
  box(x, y, width, 82, fill) + text(x + 22, y + 51, label, 27);

function queue() {
  let art = "";
  for (let i = 0; i < 7; i++)
    art +=
      circle(830, 280 + i * 54, 13) +
      path(`M850 ${280 + i * 54} C920 ${280 + i * 54} 910 465 970 465`);
  art += box(970, 358, 110, 218, "#edf4f5", palette.line);
  for (let i = 0; i < 4; i++)
    art += box(
      992,
      378 + i * 45,
      66,
      28,
      i < 3 ? palette.blue : "#dfe9ee",
      "none",
      7,
    );
  for (let i = 0; i < 3; i++) {
    const y = 310 + i * 115;
    art += path(
      `M1080 467 C1150 467 1125 ${y + 40} 1190 ${y + 40}`,
      palette.green,
      true,
    );
    art += labelBox(1210, y, `worker ${i + 1}`);
  }
  return (
    art +
    text(797, 708, "WAIT", 24, "#7892a2") +
    text(969, 708, "QUEUE", 24, "#7892a2") +
    text(1214, 708, "EXECUTE", 24, "#7892a2")
  );
}

function dependencies() {
  return (
    path("M1135 367 C1135 430 943 440 943 495", palette.green, true) +
    path("M1135 367 C1135 430 1323 440 1323 495", palette.green, true) +
    labelBox(1050, 280, "Service", palette.pale, 170) +
    labelBox(850, 510, "Store", "#e3edf5", 180) +
    labelBox(1240, 510, "Cache", palette.pale, 180) +
    path("M1290 640 C1190 735 1010 735 935 642", palette.blue, true, true) +
    text(1010, 780, "reverse cleanup", 26, "#7892a2")
  );
}

function map() {
  let art = "";
  for (let i = 0; i < 4; i++) {
    const y = 290 + i * 95;
    art += box(813, y, 68, 44, "#e1ebf4", "none", 10);
    art += path(
      `M891 ${y + 22} C985 ${y + 22} 951 477 1038 477`,
      palette.blue,
      true,
    );
  }
  art +=
    box(1053, 391, 188, 164, palette.pale, "#83b6aa", 24) +
    text(1081, 462, "shared", 31) +
    text(1081, 510, "Future", 36, palette.ink, 650);
  art +=
    path("M1247 478 H1340", palette.green, true) +
    box(1352, 435, 68, 86, "#d5e8e2", "none", 13);
  return (
    art +
    text(817, 708, "MANY REQUESTS", 24, "#7892a2") +
    text(1090, 708, "ONE LOAD", 24, "#7892a2")
  );
}

function asyncState() {
  return (
    text(835, 250, "request", 25, "#7892a2") +
    text(1225, 250, "completion", 25, "#7892a2") +
    circle(860, 345, 23, palette.blue) +
    circle(860, 555, 23, palette.green) +
    path("M895 345 C1095 345 1130 560 1290 560", palette.blue, true, true) +
    path("M895 555 C1070 555 1095 345 1290 345", palette.green, true) +
    labelBox(1305, 303, "APPLY", palette.pale, 160) +
    labelBox(1305, 516, "IGNORE", "#e9eef2", 160) +
    text(831, 660, "epoch 1", 28, palette.blue) +
    text(1165, 715, "epoch 2 wins", 28)
  );
}

function fencing() {
  return (
    labelBox(810, 280, "token 1", "#e1ebf4", 158) +
    labelBox(810, 560, "token 2", palette.pale, 158) +
    box(1113, 320, 95, 280, "#e5eeeb", "#8dbbad", 18) +
    text(1129, 474, "2", 66, palette.green, 700) +
    path("M978 320 C1040 320 1010 390 1100 390", palette.blue, false, true) +
    path("M1081 376 l23 26 M1104 376 l-23 26", "#ae9580") +
    path("M978 600 C1060 600 1030 541 1100 541", palette.green, true) +
    path("M1220 541 H1290", palette.green, true) +
    labelBox(1305, 501, "COMMIT", palette.pale, 165) +
    text(1103, 710, "FENCE", 25, "#7892a2")
  );
}

function shuffle() {
  let art = box(819, 380, 120, 210, "#e1ebf4", "#a7c4db", 18);
  for (let i = 0; i < 6; i++)
    art += box(842, 406 + i * 26, 74, 13, palette.blue, "none", 4);
  for (let i = 0; i < 5; i++) {
    const y = 275 + i * 92;
    art += path(
      `M952 485 C1080 485 1080 ${y + 29} 1220 ${y + 29}`,
      palette.green,
      true,
    );
    art += box(1240, y, 153, 61, palette.pale, "none", 12);
    for (let j = 0; j < 3; j++)
      art += box(1262 + j * 38, y + 20, 25, 21, "#8ab6aa", "none", 5);
  }
  return (
    art +
    text(817, 747, "HOT KEY", 26, "#7892a2") +
    text(1210, 793, "PARTITIONS", 26, "#7892a2")
  );
}

function warehouse() {
  let art = "";
  for (let i = 0; i < 3; i++) {
    const y = 290 + i * 120;
    art += labelBox(
      810,
      y,
      `v${i + 1}`,
      i === 2 ? palette.pale : "#e1ebf4",
      105,
    );
    art += path(
      `M928 ${y + 41} C1010 ${y + 41} 1010 451 1072 451`,
      palette.line,
      true,
    );
  }
  art +=
    labelBox(1087, 410, "snapshot", palette.pale, 190) +
    path("M1290 451 H1360", palette.green, true);
  art += box(1375, 370, 90, 168, "#dfede8", "#91bdb0", 16);
  for (let i = 0; i < 4; i++)
    art += path(`M1394 ${400 + i * 31} H1448`, palette.green);
  art += path("M1355 635 C1225 745 983 740 876 690", palette.blue, true, true);
  return art + text(1090, 790, "REPLAY · PUBLISH", 25, "#7892a2");
}

function cluster() {
  let art = path("M890 470 H1365", palette.line);
  for (let i = 0; i < 3; i++) {
    const x = 805 + i * 230;
    art += box(
      x,
      370,
      160,
      190,
      i === 1 ? "#f1e9df" : "#e3eeea",
      i === 1 ? "#c1a98c" : "none",
      20,
    );
    for (let j = 0; j < 3; j++)
      art += box(
        x + 28,
        397 + j * 43,
        103,
        22,
        i === 1 ? "#c7b197" : "#a6c9be",
        "none",
        5,
      );
    art += circle(
      x + 80,
      589,
      13,
      i === 1 ? "#b39978" : i === 0 ? palette.green : "#c5d3d7",
    );
  }
  return (
    art +
    text(819, 710, "READY", 25) +
    text(1039, 710, "STOP", 25, "#a58b6c") +
    text(1280, 710, "WAIT", 25, "#7892a2")
  );
}

function arthas() {
  let art = box(820, 300, 335, 330, "#edf2f3", "#b6cad5", 23);
  for (let i = 0; i < 5; i++)
    art += box(
      849,
      333 + i * 51,
      i === 2 ? 254 : 205 - i * 9,
      28,
      i === 2 ? "#9fc7ba" : "#c4d7e7",
      "none",
      6,
    );
  art +=
    circle(1300, 450, 91, "#dfede8") +
    `<circle cx="1300" cy="450" r="49" fill="none" stroke="${palette.green}" stroke-width="7"/>`;
  art +=
    path("M1336 488 l42 48", palette.green) +
    path("M1120 450 H1180", palette.green, true);
  return (
    art +
    text(844, 720, "TRACE", 27, "#7892a2") +
    text(1235, 720, "INSPECT", 27, "#7892a2")
  );
}

const covers = [
  [
    "golang-concurrency-control",
    "Go · concurrency",
    ["并发控制", "准入与背压"],
    queue,
  ],
  [
    "golang-wire-dependency-injection",
    "Go · lifecycle",
    ["依赖装配", "资源生命周期"],
    dependencies,
  ],
  ["java-map-selection", "Java · collections", ["Map 的", "并发边界"], map],
  [
    "async-task-ordering",
    "Async tasks",
    ["异步任务", "结果与并发"],
    asyncState,
  ],
  [
    "task-lease-fencing",
    "Distributed tasks",
    ["任务接管", "过期写入隔离"],
    fencing,
  ],
  ["spark-shuffle-skew", "Spark", ["Shuffle", "数据倾斜"], shuffle],
  [
    "data-warehouse-layering",
    "Data engineering",
    ["增量数仓", "可重放发布"],
    warehouse,
  ],
  [
    "big-data-cluster-scripts",
    "Cluster operations",
    ["集群运维", "失败的边界"],
    cluster,
  ],
  ["arthas-debugging-guide", "Arthas", ["线上诊断", "追踪与观察"], arthas],
];

await mkdir(directory, { recursive: true });
for (const [slug, label, headline, illustrate] of covers) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="960" viewBox="0 0 1536 960" role="img" aria-labelledby="title desc">
<title id="title">${escape(label + "：" + headline.join("，"))}</title>
<desc id="desc">浅色技术图形封面，无人物；用蓝绿结构图表达文章主题。</desc>
<defs><linearGradient id="paper" x2="1" y2="1"><stop stop-color="#fcfbf7"/><stop offset="1" stop-color="#f5f8f6"/></linearGradient>
<marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1 L7 4 L1 7" fill="none" stroke="#83aeb0" stroke-width="1.6"/></marker></defs>
<rect width="1536" height="960" fill="url(#paper)"/>
<path d="M0 835 C330 700 570 995 1030 865 C1300 790 1430 780 1536 809 V960 H0Z" fill="#e5eeea" opacity=".5"/>
<path d="M0 895 C420 795 595 935 1000 915 C1290 900 1385 850 1536 870 V960 H0Z" fill="#dce9e4" opacity=".36"/>
<g font-family="'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif">
${text(96, 290, label, 38, "#65817e", 600)}
${text(91, 445, headline[0], 96, palette.ink, 750)}
${text(91, 571, headline[1], 92, palette.ink, 750)}
${illustrate()}
</g></svg>`;
  await writeFile(new URL(`${slug}.svg`, directory), svg);
}
console.log(`已生成 ${covers.length} 张技术封面。`);
