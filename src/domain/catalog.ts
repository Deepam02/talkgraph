/**
 * The allowlisted component catalog. Every node on the canvas is one of these
 * kinds; the voice agent can only reference ids from this list (they are the
 * `enum` in the tool schemas), so nothing is ever invented.
 */
import type { BrandIconKey } from "./brand-icons.generated";

export const CATEGORIES = [
  "client",
  "gateway",
  "service",
  "database",
  "queue",
  "cache",
  "security",
  "observability",
  "external",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface CategoryMeta {
  label: string;
  plural: string;
  color: string;
  /** Soft tint used for node fills and chips. */
  tint: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  client: { label: "Client", plural: "Clients", color: "#64748B", tint: "#EEF1F6" },
  gateway: { label: "Gateway", plural: "Gateways & edge", color: "#38BDF8", tint: "#E6F6FE" },
  service: { label: "Service", plural: "Services", color: "#5B6CFF", tint: "#ECEEFF" },
  database: { label: "Database", plural: "Databases & storage", color: "#8B5CF6", tint: "#F1ECFE" },
  queue: { label: "Queue", plural: "Queues & streams", color: "#F59E0B", tint: "#FEF5E4" },
  cache: { label: "Cache", plural: "Caches", color: "#FB7185", tint: "#FFEEF1" },
  security: { label: "Security", plural: "Security", color: "#D946EF", tint: "#FBEBFD" },
  observability: { label: "Observability", plural: "Observability", color: "#FB923C", tint: "#FFF1E6" },
  external: { label: "External", plural: "External services", color: "#64748B", tint: "#EEF1F6" },
};

/** Glyphs rendered from lucide-react in the UI layer; the domain only names them. */
export type GlyphKey =
  | "globe"
  | "smartphone"
  | "cpu"
  | "router"
  | "split"
  | "radio-tower"
  | "signpost"
  | "server"
  | "key-round"
  | "cog"
  | "zap"
  | "plug-zap"
  | "clock"
  | "brain"
  | "database"
  | "hard-drive"
  | "warehouse"
  | "boxes"
  | "table"
  | "inbox"
  | "megaphone"
  | "workflow"
  | "shield"
  | "fingerprint"
  | "lock-keyhole"
  | "activity"
  | "scroll-text"
  | "waypoints"
  | "layout-dashboard"
  | "credit-card"
  | "mail"
  | "message-square"
  | "sparkles"
  | "cloud"
  | "monitor";

export type IconRef = { type: "brand"; key: BrandIconKey } | { type: "glyph"; key: GlyphKey };

export interface ComponentSpec {
  kind: string;
  label: string;
  category: Category;
  icon: IconRef;
  /** One-line description shown in the palette and read to the model. */
  blurb: string;
  /** Phrases people actually say. Used by the offline parser and resolver. */
  aliases: string[];
  /** Default node name stem, slugified. `{stem}` is replaced with an upstream name stem. */
  defaultName: string;
  contextualName?: string;
  /** Requests per second one instance can serve before saturating. */
  capacity: number;
  /** For request sources (clients, inbound externals): baseline requests per second. */
  sourceRps?: number;
  /** Words to boost in speech-to-text. */
  keyterms: string[];
}

const g = (key: GlyphKey): IconRef => ({ type: "glyph", key });
const b = (key: BrandIconKey): IconRef => ({ type: "brand", key });

export const COMPONENTS = [
  // ── Clients ────────────────────────────────────────────────────────────
  {
    kind: "web_app",
    label: "Web App",
    category: "client",
    icon: g("globe"),
    blurb: "Browser front end or single-page app.",
    aliases: ["web app", "web", "frontend", "front end", "browser", "website", "web client", "spa", "react app", "next app"],
    defaultName: "web",
    capacity: 1_000_000,
    sourceRps: 1200,
    keyterms: ["frontend"],
  },
  {
    kind: "mobile_app",
    label: "Mobile App",
    category: "client",
    icon: g("smartphone"),
    blurb: "iOS or Android client.",
    aliases: ["mobile app", "mobile", "ios app", "android app", "phone app", "mobile client"],
    defaultName: "mobile",
    capacity: 1_000_000,
    sourceRps: 800,
    keyterms: ["iOS", "Android"],
  },
  {
    kind: "iot_device",
    label: "IoT Devices",
    category: "client",
    icon: g("cpu"),
    blurb: "Fleet of sensors or devices sending telemetry.",
    aliases: ["iot", "iot devices", "devices", "sensors", "device fleet"],
    defaultName: "devices",
    capacity: 1_000_000,
    sourceRps: 2000,
    keyterms: ["IoT"],
  },
  // ── Gateways & edge ────────────────────────────────────────────────────
  {
    kind: "api_gateway",
    label: "API Gateway",
    category: "gateway",
    icon: b("kong"),
    blurb: "Single front door: routing, auth, rate limits.",
    aliases: ["api gateway", "gateway", "front door", "kong", "apigee", "edge gateway", "api management"],
    defaultName: "api-gateway",
    capacity: 20_000,
    keyterms: ["API gateway", "Kong"],
  },
  {
    kind: "load_balancer",
    label: "Load Balancer",
    category: "gateway",
    icon: g("split"),
    blurb: "Spreads traffic across instances.",
    aliases: ["load balancer", "lb", "alb", "nlb", "elb", "nginx", "reverse proxy", "balancer", "haproxy"],
    defaultName: "lb",
    capacity: 50_000,
    keyterms: ["load balancer", "NGINX", "HAProxy"],
  },
  {
    kind: "cdn",
    label: "CDN",
    category: "gateway",
    icon: b("cloudflare"),
    blurb: "Edge cache for static assets and pages.",
    aliases: ["cdn", "content delivery network", "cloudfront", "cloudflare", "edge cache", "fastly", "akamai"],
    defaultName: "cdn",
    capacity: 200_000,
    keyterms: ["CDN", "CloudFront", "Cloudflare", "Fastly"],
  },
  {
    kind: "dns",
    label: "DNS",
    category: "gateway",
    icon: g("signpost"),
    blurb: "Name resolution and traffic steering.",
    aliases: ["dns", "route 53", "route53", "domain", "name server"],
    defaultName: "dns",
    capacity: 1_000_000,
    keyterms: ["DNS", "Route 53"],
  },
  // ── Services ───────────────────────────────────────────────────────────
  {
    kind: "service",
    label: "Service",
    category: "service",
    icon: g("server"),
    blurb: "A stateless backend service or microservice.",
    aliases: ["service", "microservice", "backend", "server", "api", "api service", "app server", "backend service", "rest api", "monolith", "api server"],
    defaultName: "service",
    capacity: 2_500,
    keyterms: ["microservice"],
  },
  {
    kind: "auth_service",
    label: "Auth Service",
    category: "service",
    icon: g("key-round"),
    blurb: "Issues and verifies sessions and tokens.",
    aliases: ["auth service", "authentication service", "login service", "auth", "token service", "session service"],
    defaultName: "auth",
    capacity: 4_000,
    keyterms: ["OAuth", "JWT"],
  },
  {
    kind: "worker",
    label: "Worker",
    category: "service",
    icon: g("cog"),
    blurb: "Background consumer that processes jobs.",
    aliases: ["worker", "consumer", "background worker", "job runner", "processor", "background job", "workers"],
    defaultName: "worker",
    contextualName: "{stem}-worker",
    capacity: 1_500,
    keyterms: ["worker"],
  },
  {
    kind: "function",
    label: "Serverless Function",
    category: "service",
    icon: g("zap"),
    blurb: "Event-driven function that scales to zero.",
    aliases: ["lambda", "serverless function", "function", "cloud function", "serverless", "edge function"],
    defaultName: "fn",
    contextualName: "{stem}-fn",
    capacity: 3_000,
    keyterms: ["Lambda", "serverless"],
  },
  {
    kind: "websocket_server",
    label: "Realtime Server",
    category: "service",
    icon: b("socketio"),
    blurb: "Holds WebSocket connections for live updates.",
    aliases: ["websocket server", "websocket", "websockets", "realtime server", "socket server", "realtime", "live updates server"],
    defaultName: "realtime",
    capacity: 5_000,
    keyterms: ["WebSocket", "Socket.IO"],
  },
  {
    kind: "graphql_api",
    label: "GraphQL API",
    category: "service",
    icon: b("graphql"),
    blurb: "GraphQL layer that federates services.",
    aliases: ["graphql", "graphql api", "graphql server", "graph ql", "apollo"],
    defaultName: "graphql",
    capacity: 2_000,
    keyterms: ["GraphQL", "Apollo"],
  },
  {
    kind: "scheduler",
    label: "Scheduler",
    category: "service",
    icon: g("clock"),
    blurb: "Cron-style scheduled jobs.",
    aliases: ["scheduler", "cron", "cron job", "scheduled job", "timer"],
    defaultName: "scheduler",
    capacity: 500,
    keyterms: ["cron"],
  },
  {
    kind: "ml_inference",
    label: "ML Inference",
    category: "service",
    icon: g("brain"),
    blurb: "Model server for predictions or embeddings.",
    aliases: ["ml inference", "inference service", "model server", "ml model", "ml service", "recommendation service", "embedding service", "inference"],
    defaultName: "inference",
    capacity: 600,
    keyterms: ["inference", "embeddings"],
  },
  // ── Databases & storage ────────────────────────────────────────────────
  {
    kind: "postgres",
    label: "PostgreSQL",
    category: "database",
    icon: b("postgres"),
    blurb: "Relational database, the safe default.",
    aliases: ["postgres", "postgresql", "postgre sql", "pg", "psql", "relational database", "sql database", "database", "db", "aurora", "rds"],
    defaultName: "postgres",
    contextualName: "{stem}-db",
    capacity: 3_000,
    keyterms: ["Postgres", "PostgreSQL", "Aurora"],
  },
  {
    kind: "mysql",
    label: "MySQL",
    category: "database",
    icon: b("mysql"),
    blurb: "Relational database.",
    aliases: ["mysql", "my sql", "mariadb", "maria db"],
    defaultName: "mysql",
    contextualName: "{stem}-db",
    capacity: 3_000,
    keyterms: ["MySQL", "MariaDB"],
  },
  {
    kind: "mongodb",
    label: "MongoDB",
    category: "database",
    icon: b("mongodb"),
    blurb: "Document database.",
    aliases: ["mongodb", "mongo", "mongo db", "document database", "document store", "documentdb"],
    defaultName: "mongo",
    contextualName: "{stem}-docs",
    capacity: 5_000,
    keyterms: ["MongoDB", "Mongo"],
  },
  {
    kind: "dynamodb",
    label: "DynamoDB",
    category: "database",
    icon: g("table"),
    blurb: "Serverless key-value store.",
    aliases: ["dynamodb", "dynamo", "dynamo db", "key value store", "key-value store", "kv store"],
    defaultName: "dynamo",
    contextualName: "{stem}-table",
    capacity: 40_000,
    keyterms: ["DynamoDB", "Dynamo"],
  },
  {
    kind: "cassandra",
    label: "Cassandra",
    category: "database",
    icon: b("cassandra"),
    blurb: "Wide-column store for heavy writes.",
    aliases: ["cassandra", "scylla", "scylladb", "wide column store"],
    defaultName: "cassandra",
    contextualName: "{stem}-store",
    capacity: 20_000,
    keyterms: ["Cassandra", "ScyllaDB"],
  },
  {
    kind: "elasticsearch",
    label: "Search Index",
    category: "database",
    icon: b("elasticsearch"),
    blurb: "Full-text search (Elasticsearch/OpenSearch).",
    aliases: ["elasticsearch", "elastic search", "elastic", "opensearch", "open search", "search index", "search", "algolia"],
    defaultName: "search",
    contextualName: "{stem}-search",
    capacity: 4_000,
    keyterms: ["Elasticsearch", "OpenSearch"],
  },
  {
    kind: "object_storage",
    label: "Object Storage",
    category: "database",
    icon: b("minio"),
    blurb: "Blobs, files, media (S3, GCS).",
    aliases: ["object storage", "s3", "s3 bucket", "bucket", "blob storage", "file storage", "gcs", "media storage", "storage"],
    defaultName: "bucket",
    contextualName: "{stem}-bucket",
    capacity: 50_000,
    keyterms: ["S3", "GCS", "bucket"],
  },
  {
    kind: "data_warehouse",
    label: "Data Warehouse",
    category: "database",
    icon: b("snowflake"),
    blurb: "Analytics warehouse (Snowflake, BigQuery).",
    aliases: ["data warehouse", "warehouse", "snowflake", "bigquery", "big query", "redshift", "analytics database", "clickhouse"],
    defaultName: "warehouse",
    capacity: 400,
    keyterms: ["Snowflake", "BigQuery", "Redshift", "ClickHouse"],
  },
  {
    kind: "vector_db",
    label: "Vector DB",
    category: "database",
    icon: b("qdrant"),
    blurb: "Embeddings store for semantic search and RAG.",
    aliases: ["vector database", "vector db", "vector store", "pinecone", "qdrant", "weaviate", "pgvector", "embeddings store"],
    defaultName: "vectors",
    capacity: 5_000,
    keyterms: ["Pinecone", "Qdrant", "Weaviate", "pgvector"],
  },
  // ── Queues & streams ───────────────────────────────────────────────────
  {
    kind: "kafka",
    label: "Kafka",
    category: "queue",
    icon: b("kafka"),
    blurb: "Durable, replayable event stream.",
    aliases: ["kafka", "apache kafka", "event stream", "event streaming", "stream", "kinesis", "redpanda", "event log", "msk"],
    defaultName: "events",
    contextualName: "{stem}-events",
    capacity: 150_000,
    keyterms: ["Kafka", "Kinesis", "Redpanda"],
  },
  {
    kind: "rabbitmq",
    label: "RabbitMQ",
    category: "queue",
    icon: b("rabbitmq"),
    blurb: "Message broker with routing and acks.",
    aliases: ["rabbitmq", "rabbit mq", "rabbit", "amqp broker", "message broker", "broker"],
    defaultName: "broker",
    contextualName: "{stem}-broker",
    capacity: 25_000,
    keyterms: ["RabbitMQ", "AMQP"],
  },
  {
    kind: "sqs",
    label: "Queue",
    category: "queue",
    icon: g("inbox"),
    blurb: "Managed work queue (SQS-style).",
    aliases: ["queue", "message queue", "sqs", "work queue", "job queue", "task queue", "celery", "bullmq", "mq"],
    defaultName: "queue",
    contextualName: "{stem}-queue",
    capacity: 60_000,
    keyterms: ["SQS", "BullMQ", "Celery"],
  },
  {
    kind: "pubsub",
    label: "Pub/Sub Topic",
    category: "queue",
    icon: b("pubsub"),
    blurb: "Fan-out topic (SNS, Google Pub/Sub).",
    aliases: ["pub sub", "pubsub", "pub/sub", "topic", "sns", "event bus", "eventbridge", "fan out", "nats"],
    defaultName: "topic",
    contextualName: "{stem}-topic",
    capacity: 80_000,
    keyterms: ["Pub/Sub", "SNS", "EventBridge", "NATS"],
  },
  // ── Caches ─────────────────────────────────────────────────────────────
  {
    kind: "redis",
    label: "Redis",
    category: "cache",
    icon: b("redis"),
    blurb: "In-memory cache and fast key-value store.",
    aliases: ["redis", "cache", "in memory cache", "valkey", "elasticache", "caching layer", "session store"],
    defaultName: "cache",
    contextualName: "{stem}-cache",
    capacity: 90_000,
    keyterms: ["Redis", "Valkey", "ElastiCache"],
  },
  {
    kind: "memcached",
    label: "Memcached",
    category: "cache",
    icon: g("boxes"),
    blurb: "Simple distributed memory cache.",
    aliases: ["memcached", "memcache", "mem cache"],
    defaultName: "memcached",
    contextualName: "{stem}-memcache",
    capacity: 90_000,
    keyterms: ["Memcached"],
  },
  // ── Security ───────────────────────────────────────────────────────────
  {
    kind: "waf",
    label: "WAF",
    category: "security",
    icon: g("shield"),
    blurb: "Web application firewall at the edge.",
    aliases: ["waf", "web application firewall", "firewall", "ddos protection", "shield"],
    defaultName: "waf",
    capacity: 40_000,
    keyterms: ["WAF", "DDoS"],
  },
  {
    kind: "identity_provider",
    label: "Identity Provider",
    category: "security",
    icon: b("auth0"),
    blurb: "SSO and user identity (Auth0, Okta, Cognito).",
    aliases: ["identity provider", "idp", "auth0", "okta", "cognito", "sso", "clerk", "keycloak", "oauth provider"],
    defaultName: "idp",
    capacity: 5_000,
    keyterms: ["Auth0", "Okta", "Cognito", "Clerk", "Keycloak", "SSO"],
  },
  {
    kind: "secrets_vault",
    label: "Secrets Vault",
    category: "security",
    icon: b("vault"),
    blurb: "Stores keys and credentials.",
    aliases: ["secrets vault", "vault", "secrets manager", "secret manager", "kms", "key vault", "secrets"],
    defaultName: "vault",
    capacity: 2_000,
    keyterms: ["Vault", "KMS"],
  },
  // ── Observability ──────────────────────────────────────────────────────
  {
    kind: "metrics",
    label: "Metrics",
    category: "observability",
    icon: b("prometheus"),
    blurb: "Time-series metrics (Prometheus).",
    aliases: ["metrics", "prometheus", "monitoring", "metrics store"],
    defaultName: "metrics",
    capacity: 100_000,
    keyterms: ["Prometheus"],
  },
  {
    kind: "logging",
    label: "Logging",
    category: "observability",
    icon: g("scroll-text"),
    blurb: "Central log aggregation.",
    aliases: ["logging", "logs", "log aggregator", "loki", "elk", "splunk", "log store", "cloudwatch"],
    defaultName: "logs",
    capacity: 100_000,
    keyterms: ["Loki", "Splunk", "CloudWatch"],
  },
  {
    kind: "tracing",
    label: "Tracing",
    category: "observability",
    icon: b("opentelemetry"),
    blurb: "Distributed tracing (OpenTelemetry, Jaeger).",
    aliases: ["tracing", "traces", "opentelemetry", "open telemetry", "otel", "jaeger", "tempo", "distributed tracing", "observability"],
    defaultName: "tracing",
    capacity: 100_000,
    keyterms: ["OpenTelemetry", "OTel", "Jaeger"],
  },
  {
    kind: "dashboards",
    label: "Dashboards",
    category: "observability",
    icon: b("grafana"),
    blurb: "Dashboards and alerting (Grafana, Datadog).",
    aliases: ["dashboards", "dashboard", "grafana", "datadog", "alerting", "alerts"],
    defaultName: "dashboards",
    capacity: 100_000,
    keyterms: ["Grafana", "Datadog"],
  },
  // ── External ───────────────────────────────────────────────────────────
  {
    kind: "payments",
    label: "Payments",
    category: "external",
    icon: b("stripe"),
    blurb: "Payment processor (Stripe, Adyen).",
    aliases: ["payments", "payment provider", "stripe", "payment gateway", "adyen", "paypal", "braintree"],
    defaultName: "stripe",
    capacity: 1_000,
    keyterms: ["Stripe", "Adyen", "PayPal"],
  },
  {
    kind: "email_provider",
    label: "Email",
    category: "external",
    icon: g("mail"),
    blurb: "Transactional email (SendGrid, SES).",
    aliases: ["email provider", "email", "email service", "sendgrid", "send grid", "ses", "mailgun", "postmark", "resend"],
    defaultName: "email",
    capacity: 500,
    keyterms: ["SendGrid", "Mailgun", "Postmark", "Resend"],
  },
  {
    kind: "sms_provider",
    label: "SMS",
    category: "external",
    icon: g("message-square"),
    blurb: "SMS and push notifications (Twilio).",
    aliases: ["sms provider", "sms", "twilio", "text messages", "push notifications", "notifications provider"],
    defaultName: "sms",
    capacity: 500,
    keyterms: ["Twilio", "SMS"],
  },
  {
    kind: "llm_api",
    label: "LLM API",
    category: "external",
    icon: b("anthropic"),
    blurb: "Hosted large language model.",
    aliases: ["llm api", "llm", "language model", "openai", "anthropic", "claude", "gpt", "ai model", "model api", "assemblyai"],
    defaultName: "llm",
    capacity: 400,
    keyterms: ["LLM", "OpenAI", "Anthropic", "Claude", "AssemblyAI"],
  },
  {
    kind: "third_party_api",
    label: "Third-party API",
    category: "external",
    icon: g("cloud"),
    blurb: "Any external API or partner system.",
    aliases: ["third party api", "third-party api", "external api", "partner api", "partner", "vendor api", "saas", "webhook source"],
    defaultName: "partner",
    capacity: 500,
    sourceRps: 50,
    keyterms: ["webhook"],
  },
] as const satisfies readonly ComponentSpec[];

export type ComponentKind = (typeof COMPONENTS)[number]["kind"];

export const COMPONENT_KINDS = COMPONENTS.map((c) => c.kind) as [ComponentKind, ...ComponentKind[]];

const BY_KIND = new Map<string, ComponentSpec>(COMPONENTS.map((c) => [c.kind, c]));

export function isComponentKind(value: string): value is ComponentKind {
  return BY_KIND.has(value);
}

export function spec(kind: ComponentKind): ComponentSpec {
  const s = BY_KIND.get(kind);
  if (!s) throw new Error(`Unknown component kind: ${kind}`);
  return s;
}

export function categoryOf(kind: ComponentKind): Category {
  return spec(kind).category;
}

export function componentsIn(category: Category): ComponentSpec[] {
  return COMPONENTS.filter((c) => c.category === category);
}

/**
 * Map a spoken phrase ("a postgres database", "message queue") to a catalog kind.
 * Longest alias wins so "api gateway" beats "api", "event stream" beats "stream".
 */
export function kindFromPhrase(phrase: string): ComponentKind | null {
  const text = ` ${normalizePhrase(phrase)} `;
  // English noun phrases put the head noun last ("payments service" is a service,
  // "postgres database" is Postgres), so an alias ending the phrase wins, then length.
  let best: { kind: ComponentKind; score: number } | null = null;
  for (const c of COMPONENTS) {
    for (const alias of [c.label.toLowerCase(), ...c.aliases]) {
      const a = normalizePhrase(alias);
      if (!a) continue;
      if (text.includes(` ${a} `) || text.includes(` ${a}s `)) {
        const atEnd = text.endsWith(` ${a} `) || text.endsWith(` ${a}s `);
        const score = (atEnd ? 1000 : 0) + a.length;
        if (!best || score > best.score) best = { kind: c.kind, score };
      }
    }
  }
  return best?.kind ?? null;
}

export function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keyterms for speech-to-text boosting: brand and jargon words only, deduped. */
export function catalogKeyterms(): string[] {
  const set = new Set<string>();
  for (const c of COMPONENTS) for (const k of c.keyterms) set.add(k);
  for (const k of ["gRPC", "HTTPS", "Terraform", "Mermaid", "ADR", "TLS", "replica", "idempotent"]) set.add(k);
  return [...set];
}
