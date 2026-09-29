/**
 * Terraform skeleton for AWS, generated from the typed graph. It is a starting
 * point, not a deployable stack: one resource per component, security-group
 * rules derived from connections, and TODOs where real decisions are needed.
 */
import { categoryOf, spec, type ComponentKind } from "../catalog";
import type { ArchNode, Graph, Protocol } from "../graph";
import { PRODUCT } from "@/config/product";

const PORTS: Partial<Record<Protocol, number>> = {
  HTTPS: 443,
  HTTP: 80,
  gRPC: 443,
  GraphQL: 443,
  WebSocket: 443,
  AMQP: 5671,
  Kafka: 9094,
  MQTT: 8883,
  OTLP: 4317,
};

function tf(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}

function dbPort(kind: ComponentKind): number {
  switch (kind) {
    case "postgres":
      return 5432;
    case "mysql":
      return 3306;
    case "mongodb":
      return 27017;
    case "redis":
      return 6379;
    case "memcached":
      return 11211;
    case "cassandra":
      return 9142;
    default:
      return 443;
  }
}

function resource(n: ArchNode, graph: Graph): string {
  const id = tf(n.name);
  const replicated = graph.edges.some((e) => e.kind === "replication" && e.source === n.id);
  const comment = `# ${n.name}: ${spec(n.kind).label}${n.replicas > 1 ? ` (×${n.replicas})` : ""}`;
  const body = (() => {
    switch (n.kind) {
      case "service":
      case "auth_service":
      case "worker":
      case "graphql_api":
      case "websocket_server":
      case "ml_inference":
      case "scheduler":
        return `resource "aws_ecs_service" "${id}" {
  name            = "${n.name}"
  cluster         = aws_ecs_cluster.main.id
  desired_count   = ${n.replicas}
  launch_type     = "FARGATE"
  task_definition = "${n.name}" # TODO: aws_ecs_task_definition with your image

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.${id}.id]
  }
}`;
      case "function":
        return `resource "aws_lambda_function" "${id}" {
  function_name = "${n.name}"
  role          = var.lambda_role_arn # TODO
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  filename      = "${n.name}.zip" # TODO: build artifact
}`;
      case "postgres":
      case "mysql":
        return `resource "aws_db_instance" "${id}" {
  identifier             = "${n.name}"
  engine                 = "${n.kind === "postgres" ? "postgres" : "mysql"}"
  instance_class         = "db.t4g.medium"
  allocated_storage      = 50
  multi_az               = ${replicated || n.replicas > 1 ? "true" : "false"}
  storage_encrypted      = true
  username               = "app"
  manage_master_user_password = true
  vpc_security_group_ids = [aws_security_group.${id}.id]
  skip_final_snapshot    = false
}`;
      case "mongodb":
        return `resource "aws_docdb_cluster" "${id}" {
  cluster_identifier     = "${n.name}"
  engine                 = "docdb"
  master_username        = "app"
  manage_master_user_password = true
  storage_encrypted      = true
  vpc_security_group_ids = [aws_security_group.${id}.id]
}`;
      case "dynamodb":
        return `resource "aws_dynamodb_table" "${id}" {
  name         = "${n.name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }
}`;
      case "cassandra":
        return `resource "aws_keyspaces_keyspace" "${id}" {
  name = "${id}"
}`;
      case "elasticsearch":
      case "vector_db":
        return `resource "aws_opensearch_domain" "${id}" {
  domain_name = "${n.name.slice(0, 28)}"
  cluster_config {
    instance_type  = "r6g.large.search"
    instance_count = ${Math.max(n.replicas, 2)}
  }
  encrypt_at_rest { enabled = true }
  node_to_node_encryption { enabled = true }${n.kind === "vector_db" ? "\n  # Vector search: enable the k-NN plugin, or swap for a managed vector DB." : ""}
}`;
      case "object_storage":
        return `resource "aws_s3_bucket" "${id}" {
  bucket = "${n.name}-\${var.env}"
}

resource "aws_s3_bucket_public_access_block" "${id}" {
  bucket                  = aws_s3_bucket.${id}.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`;
      case "data_warehouse":
        return `resource "aws_redshiftserverless_workgroup" "${id}" {
  workgroup_name = "${n.name}"
  namespace_name = "${n.name}"
}`;
      case "kafka":
        return `resource "aws_msk_serverless_cluster" "${id}" {
  cluster_name = "${n.name}"
  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.${id}.id]
  }
  client_authentication {
    sasl { iam { enabled = true } }
  }
}`;
      case "rabbitmq":
        return `resource "aws_mq_broker" "${id}" {
  broker_name        = "${n.name}"
  engine_type        = "RabbitMQ"
  engine_version     = "3.13"
  host_instance_type = "mq.m5.large"
  deployment_mode    = "${n.replicas > 1 ? "CLUSTER_MULTI_AZ" : "SINGLE_INSTANCE"}"
  security_groups    = [aws_security_group.${id}.id]
  user {
    username = "app"
    password = var.mq_password
  }
}`;
      case "sqs":
        return `resource "aws_sqs_queue" "${id}_dlq" {
  name = "${n.name}-dlq"
}

resource "aws_sqs_queue" "${id}" {
  name                    = "${n.name}"
  sqs_managed_sse_enabled = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.${id}_dlq.arn
    maxReceiveCount     = 5
  })
}`;
      case "pubsub":
        return `resource "aws_sns_topic" "${id}" {
  name              = "${n.name}"
  kms_master_key_id = "alias/aws/sns"
}`;
      case "redis":
      case "memcached":
        return `resource "aws_elasticache_replication_group" "${id}" {
  replication_group_id       = "${n.name.slice(0, 40)}"
  description                = "${n.name}"
  engine                     = "${n.kind === "redis" ? "redis" : "memcached"}"
  node_type                  = "cache.t4g.medium"
  num_cache_clusters         = ${Math.max(n.replicas, 2)}
  automatic_failover_enabled = true
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  security_group_ids         = [aws_security_group.${id}.id]
}`;
      case "api_gateway":
        return `resource "aws_apigatewayv2_api" "${id}" {
  name          = "${n.name}"
  protocol_type = "HTTP"
}`;
      case "load_balancer":
        return `resource "aws_lb" "${id}" {
  name               = "${n.name.slice(0, 32)}"
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [aws_security_group.${id}.id]
  drop_invalid_header_fields = true
}`;
      case "cdn":
        return `resource "aws_cloudfront_distribution" "${id}" {
  enabled = true
  # TODO: origin pointing at your gateway or bucket
  default_cache_behavior {
    target_origin_id       = "primary"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}`;
      case "dns":
        return `resource "aws_route53_zone" "${id}" {
  name = var.domain
}`;
      case "waf":
        return `resource "aws_wafv2_web_acl" "${id}" {
  name  = "${n.name}"
  scope = "REGIONAL"
  default_action {
    allow {}
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${id}"
    sampled_requests_enabled   = true
  }
  # TODO: add AWSManagedRulesCommonRuleSet and rate-based rules
}`;
      case "identity_provider":
        return `resource "aws_cognito_user_pool" "${id}" {
  name = "${n.name}"
  mfa_configuration = "OPTIONAL"
}`;
      case "secrets_vault":
        return `resource "aws_secretsmanager_secret" "${id}" {
  name = "${n.name}"
}`;
      case "metrics":
        return `resource "aws_prometheus_workspace" "${id}" {
  alias = "${n.name}"
}`;
      case "logging":
        return `resource "aws_cloudwatch_log_group" "${id}" {
  name              = "/${PRODUCT.slug}/${n.name}"
  retention_in_days = 30
}`;
      case "tracing":
        return `resource "aws_xray_group" "${id}" {
  group_name        = "${n.name}"
  filter_expression = "responsetime > 1"
}`;
      case "dashboards":
        return `resource "aws_grafana_workspace" "${id}" {
  name                     = "${n.name}"
  account_access_type      = "CURRENT_ACCOUNT"
  authentication_providers = ["AWS_SSO"]
  permission_type          = "SERVICE_MANAGED"
}`;
      default:
        return `# ${spec(n.kind).label} is outside AWS: manage credentials in Secrets Manager and call it over HTTPS.`;
    }
  })();
  return `${comment}\n${body}`;
}

const NEEDS_SG: ReadonlySet<string> = new Set(["service", "database", "cache", "queue"]);

export function toTerraform(graph: Graph, title = "architecture"): string {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  out.push(
    [`# ${title}`, `# Generated by ${PRODUCT.name} from the typed architecture graph.`, `# A skeleton to start from: review every TODO before applying.`].join("\n"),
    `terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.region
}

variable "region" { default = "us-east-1" }
variable "env" { default = "prod" }
variable "domain" { default = "example.com" }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "public_subnet_ids" { type = list(string) }
variable "lambda_role_arn" { default = "" }
variable "mq_password" {
  type      = string
  sensitive = true
  default   = ""
}`,
  );

  if (graph.nodes.some((n) => ["service", "auth_service", "worker", "graphql_api", "websocket_server", "ml_inference", "scheduler"].includes(n.kind))) {
    out.push(`resource "aws_ecs_cluster" "main" {\n  name = "${title.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "main"}"\n}`);
  }

  for (const n of graph.nodes) {
    if (categoryOf(n.kind) === "client") {
      out.push(`# ${n.name}: ${spec(n.kind).label} (client, not provisioned here)`);
      continue;
    }
    out.push(resource(n, graph));
  }

  // Security groups: one per networked component, ingress only from its callers.
  const sgNodes = graph.nodes.filter((n) => NEEDS_SG.has(categoryOf(n.kind)) || n.kind === "load_balancer");
  for (const n of sgNodes) {
    const id = tf(n.name);
    out.push(`resource "aws_security_group" "${id}" {\n  name   = "${n.name}"\n  vpc_id = var.vpc_id\n}`);
  }
  const sgIds = new Set(sgNodes.map((n) => n.id));
  for (const e of graph.edges) {
    if (e.kind === "replication") continue;
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t || !sgIds.has(t.id)) continue;
    const port = PORTS[e.protocol] ?? dbPort(t.kind);
    const from = sgIds.has(s.id) ? `  source_security_group_id = aws_security_group.${tf(s.name)}.id` : `  cidr_blocks              = ["0.0.0.0/0"] # public entry`;
    out.push(
      `# ${s.name} → ${t.name} (${e.kind}, ${e.protocol}${e.encrypted ? ", TLS" : ", PLAINTEXT"})\nresource "aws_security_group_rule" "${tf(s.name)}_to_${tf(t.name)}" {\n  type                     = "ingress"\n  security_group_id        = aws_security_group.${tf(t.name)}.id\n  protocol                 = "tcp"\n  from_port                = ${port}\n  to_port                  = ${port}\n${from}\n}`,
    );
  }

  return out.join("\n\n") + "\n";
}
