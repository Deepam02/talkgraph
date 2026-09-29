/**
 * Starter architectures, built through the same validated commands as any
 * edit, so templates can never contain an illegal connection.
 */
import { applyCommands } from "./apply";
import type { ComponentKind } from "./catalog";
import type { Command } from "./commands";
import { emptyGraph, type Graph } from "./graph";

export const TEMPLATE_IDS = ["ecommerce", "chat", "rag", "rides"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface Template {
  id: TemplateId;
  name: string;
  description: string;
  commands: Command[];
}

const add = (kind: ComponentKind, name: string, extra: Partial<Extract<Command, { type: "addNode" }>> = {}): Command => ({
  type: "addNode",
  kind,
  name,
  as: `$${name}`,
  autoConnect: false,
  ...extra,
});
const link = (from: string, to: string, extra: Partial<Extract<Command, { type: "connect" }>> = {}): Command => ({
  type: "connect",
  from: `$${from}`,
  to: `$${to}`,
  ...extra,
});

export const TEMPLATES: Record<TemplateId, Template> = {
  ecommerce: {
    id: "ecommerce",
    name: "E-commerce checkout",
    description: "Storefront, orders, payments, and async notifications.",
    commands: [
      add("web_app", "storefront"),
      add("mobile_app", "mobile"),
      add("api_gateway", "api-gateway"),
      add("service", "catalog"),
      add("service", "orders"),
      add("postgres", "orders-db"),
      add("postgres", "catalog-db"),
      add("payments", "stripe"),
      add("kafka", "order-events"),
      add("worker", "notifier"),
      add("email_provider", "email"),
      link("storefront", "api-gateway"),
      link("mobile", "api-gateway"),
      link("api-gateway", "catalog"),
      link("api-gateway", "orders"),
      link("catalog", "catalog-db"),
      link("orders", "orders-db"),
      link("orders", "stripe"),
      link("orders", "order-events"),
      link("order-events", "notifier"),
      link("notifier", "email"),
    ],
  },
  chat: {
    id: "chat",
    name: "Realtime chat",
    description: "WebSockets, presence cache, message fan-out, and history.",
    commands: [
      add("web_app", "web"),
      add("mobile_app", "mobile"),
      add("load_balancer", "lb"),
      add("websocket_server", "realtime", { replicas: 3 }),
      add("service", "messages"),
      add("redis", "presence"),
      add("pubsub", "fanout"),
      add("cassandra", "history"),
      add("worker", "push"),
      add("sms_provider", "push-provider"),
      link("web", "lb"),
      link("mobile", "lb"),
      link("lb", "realtime"),
      link("realtime", "presence"),
      link("realtime", "messages"),
      link("messages", "history"),
      link("messages", "fanout"),
      link("fanout", "push"),
      link("push", "push-provider"),
    ],
  },
  rag: {
    id: "rag",
    name: "AI assistant (RAG)",
    description: "Ingestion pipeline, vector search, and an LLM behind an API.",
    commands: [
      add("web_app", "app"),
      add("api_gateway", "api-gateway"),
      add("service", "assistant"),
      add("vector_db", "embeddings"),
      add("llm_api", "llm"),
      add("object_storage", "documents"),
      add("sqs", "ingest-queue"),
      add("worker", "indexer"),
      add("postgres", "conversations"),
      link("app", "api-gateway"),
      link("api-gateway", "assistant"),
      link("assistant", "embeddings"),
      link("assistant", "llm"),
      link("assistant", "conversations"),
      link("assistant", "ingest-queue"),
      link("ingest-queue", "indexer"),
      link("indexer", "documents"),
      link("indexer", "embeddings"),
    ],
  },
  rides: {
    id: "rides",
    name: "Ride sharing",
    description: "Dispatch, location streaming, pricing, and trips.",
    commands: [
      add("mobile_app", "rider-app"),
      add("mobile_app", "driver-app"),
      add("api_gateway", "api-gateway"),
      add("service", "dispatch", { replicas: 2 }),
      add("service", "pricing"),
      add("kafka", "locations"),
      add("worker", "matcher"),
      add("redis", "geo-cache"),
      add("postgres", "trips-db"),
      add("payments", "payments"),
      link("rider-app", "api-gateway"),
      link("driver-app", "api-gateway"),
      link("api-gateway", "dispatch"),
      link("api-gateway", "pricing"),
      link("dispatch", "locations"),
      link("locations", "matcher"),
      link("matcher", "geo-cache"),
      link("dispatch", "trips-db"),
      link("pricing", "geo-cache"),
      link("dispatch", "payments"),
    ],
  },
};

export function buildTemplate(id: TemplateId): Graph {
  return applyCommands(emptyGraph(), TEMPLATES[id].commands).graph;
}
