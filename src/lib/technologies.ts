import type { IconType } from "react-icons";
import {
  SiGo,
  SiConsul,
  SiMysql,
  SiPostgresql,
  SiRedis,
  SiClickhouse,
  SiApachekafka,
  SiNatsdotio,
  SiNginx,
  SiOpentelemetry,
  SiPrometheus,
  SiGrafana,
  SiDocker,
  SiOpenapiinitiative,
  SiOpenid,
  SiAstro,
  SiTypescript,
  SiTailwindcss,
  SiJavascript,
  SiHelm,
  SiKubernetes,
} from "react-icons/si";

export interface Technology {
  url: string;
  icon?: IconType;
  image?: string;
  color?: string;
  concept?: boolean;
}
const asset = (name: string) => `/images/technologies/${name}`;
// 品牌标识来自项目官网、官方仓库及 Simple Icons；无独立标识的条目保留文字链接。
export const technologies: Record<string, Technology> = {
  VoyraCloud: {
    url: "https://www.voyracloud.com/zh",
    image: asset("voyracloud.ico"),
  },
  ALB: {
    url: "https://docs.ucloud.cn/ulb/alb/guide/listeners/forwarding",
    image: "/images/about/ucloud.png",
  },
  PathX: {
    url: "https://www.ucloud.cn/site/product/pathx.html",
    image: "/images/about/ucloud.png",
  },
  UCloud: { url: "https://www.ucloud.cn/", image: "/images/about/ucloud.png" },
  Go: { url: "https://go.dev/", icon: SiGo, color: "#007d9c" },
  Hertz: {
    url: "https://www.cloudwego.io/docs/hertz/",
    image: asset("cloudwego.png"),
  },
  Kitex: {
    url: "https://www.cloudwego.io/docs/kitex/",
    image: asset("cloudwego.png"),
  },
  gRPC: { url: "https://grpc.io/", image: asset("grpc.png") },
  Protobuf: { url: "https://protobuf.dev/", image: asset("protobuf.png") },
  "gRPC-Gateway": {
    url: "https://grpc-ecosystem.github.io/grpc-gateway/",
    image: asset("grpc.png"),
  },
  DDD: {
    url: "https://martinfowler.com/bliki/DomainDrivenDesign.html",
    concept: true,
  },
  CQRS: { url: "https://martinfowler.com/bliki/CQRS.html", concept: true },
  契约优先: { url: "https://learn.openapis.org/", concept: true },
  Consul: {
    url: "https://developer.hashicorp.com/consul",
    icon: SiConsul,
    color: "#ca2171",
  },
  Wire: { url: "https://github.com/google/wire" },
  Fx: { url: "https://uber-go.github.io/fx/" },
  MySQL: { url: "https://www.mysql.com/", icon: SiMysql, color: "#4479a1" },
  PostgreSQL: {
    url: "https://www.postgresql.org/",
    icon: SiPostgresql,
    color: "#4169a1",
  },
  Redis: { url: "https://redis.io/", icon: SiRedis, color: "#c6302b" },
  ClickHouse: {
    url: "https://clickhouse.com/",
    icon: SiClickhouse,
    color: "#9b8700",
  },
  S3: { url: "https://aws.amazon.com/s3/", image: asset("s3.png") },
  GORM: { url: "https://gorm.io/", image: asset("gorm.png") },
  pgx: { url: "https://github.com/jackc/pgx" },
  Kafka: {
    url: "https://kafka.apache.org/",
    icon: SiApachekafka,
    color: "#231f20",
  },
  NATS: { url: "https://nats.io/", icon: SiNatsdotio, color: "#27aae1" },
  JetStream: {
    url: "https://docs.nats.io/nats-concepts/jetstream",
    icon: SiNatsdotio,
    color: "#27aae1",
  },
  幂等: {
    url: "https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/",
    concept: true,
  },
  失败补偿: {
    url: "https://learn.microsoft.com/azure/architecture/patterns/compensating-transaction",
    concept: true,
  },
  到期处理: {
    url: "https://docs.nats.io/using-nats/developer/develop_jetstream/model_deep_dive",
    concept: true,
  },
  Outbox: {
    url: "https://microservices.io/patterns/data/transactional-outbox.html",
    concept: true,
  },
  Inbox: {
    url: "https://microservices.io/patterns/communication-style/idempotent-consumer.html",
    concept: true,
  },
  异步事件: {
    url: "https://learn.microsoft.com/azure/architecture/guide/architecture-styles/event-driven",
    concept: true,
  },
  Nginx: { url: "https://nginx.org/", icon: SiNginx, color: "#009639" },
  OpenResty: { url: "https://openresty.org/", image: asset("openresty.webp") },
  LuaJIT: { url: "https://luajit.org/" },
  APISIX: { url: "https://apisix.apache.org/", image: asset("apisix.svg") },
  "L7 路由": {
    url: "https://apisix.apache.org/docs/apisix/terminology/route/",
    concept: true,
  },
  "动态 upstream": {
    url: "https://apisix.apache.org/docs/apisix/terminology/upstream/",
    concept: true,
  },
  WRR: {
    url: "https://nginx.org/en/docs/http/load_balancing.html",
    concept: true,
  },
  一致性哈希: {
    url: "https://nginx.org/en/docs/http/ngx_http_upstream_module.html#hash",
    concept: true,
  },
  健康检查: {
    url: "https://apisix.apache.org/docs/apisix/tutorials/health-check/",
    concept: true,
  },
  TCP: { url: "https://www.rfc-editor.org/rfc/rfc9293", concept: true },
  UDP: { url: "https://www.rfc-editor.org/rfc/rfc768", concept: true },
  HTTP: { url: "https://www.rfc-editor.org/rfc/rfc9110", concept: true },
  WebSocket: { url: "https://www.rfc-editor.org/rfc/rfc6455", concept: true },
  OpenTelemetry: {
    url: "https://opentelemetry.io/",
    icon: SiOpentelemetry,
    color: "#425cc7",
  },
  Prometheus: {
    url: "https://prometheus.io/",
    icon: SiPrometheus,
    color: "#e6522c",
  },
  Grafana: { url: "https://grafana.com/", icon: SiGrafana, color: "#d96d13" },
  Loki: { url: "https://grafana.com/oss/loki/", image: asset("loki.svg") },
  Tempo: { url: "https://grafana.com/oss/tempo/", image: asset("tempo.svg") },
  "Docker Compose": {
    url: "https://docs.docker.com/compose/",
    icon: SiDocker,
    color: "#2496ed",
  },
  OpenAPI: {
    url: "https://www.openapis.org/",
    icon: SiOpenapiinitiative,
    color: "#6b9600",
  },
  OIDC: {
    url: "https://openid.net/developers/how-connect-works/",
    icon: SiOpenid,
    color: "#dc8615",
  },
  Cerbos: { url: "https://www.cerbos.dev/", image: asset("cerbos.png") },
  "PostgreSQL RLS": {
    url: "https://www.postgresql.org/docs/current/ddl-rowsecurity.html",
    icon: SiPostgresql,
    color: "#4169a1",
  },
  Eino: {
    url: "https://www.cloudwego.io/docs/eino/",
    image: asset("cloudwego.png"),
  },
  "ReAct Agent": { url: "https://react-lm.github.io/", concept: true },
  "Tool Calling": {
    url: "https://platform.openai.com/docs/guides/function-calling",
    concept: true,
  },
  OpenAI: { url: "https://openai.com/", image: asset("openai.png") },
  Dubbo: { url: "https://dubbo.apache.org/", image: "/images/about/dubbo.png" },
  Triple: {
    url: "https://dubbo.apache.org/en/overview/reference/protocols/triple/",
    image: "/images/about/dubbo.png",
  },
  泛化调用: {
    url: "https://github.com/apache/dubbo-go-samples/tree/main/generic",
    concept: true,
  },
  "gRPC Server Reflection": {
    url: "https://grpc.io/docs/guides/reflection/",
    image: asset("grpc.png"),
  },
  Benchmark: {
    url: "https://pkg.go.dev/testing#hdr-Benchmarks",
    concept: true,
  },
  Astro: { url: "https://astro.build/", icon: SiAstro, color: "#bc52ee" },
  TypeScript: {
    url: "https://www.typescriptlang.org/",
    icon: SiTypescript,
    color: "#3178c6",
  },
  "Tailwind CSS": {
    url: "https://tailwindcss.com/",
    icon: SiTailwindcss,
    color: "#087f9c",
  },
  JavaScript: {
    url: "https://developer.mozilla.org/docs/Web/JavaScript",
    icon: SiJavascript,
    color: "#9b8700",
  },
  Helm: { url: "https://helm.sh/", icon: SiHelm, color: "#0f1689" },
  Kubernetes: {
    url: "https://kubernetes.io/",
    icon: SiKubernetes,
    color: "#326ce5",
  },
  "dubbo-go": {
    url: "https://github.com/apache/dubbo-go",
    image: "/images/about/dubbo.png",
  },
  Pixiu: {
    url: "https://github.com/apache/dubbo-go-pixiu",
    image: "/images/about/dubbo.png",
  },
  "dubbo-go-pixiu": {
    url: "https://github.com/apache/dubbo-go-pixiu",
    image: "/images/about/dubbo.png",
  },
};

export function getTechnology(name: string): Technology {
  const technology = technologies[name];
  if (!technology) throw new Error(`缺少技术条目：${name}`);
  return technology;
}
