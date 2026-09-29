import type { Edge, Node } from "@xyflow/react";
import type { ArchEdge, ArchNode } from "@/domain/graph";
import type { Finding, Severity } from "@/domain/lint";
import type { EdgeSim, NodeSim } from "@/domain/sim";

export type ArchNodeData = {
  node: ArchNode;
  sim?: NodeSim;
  simActive: boolean;
  severity?: Severity;
  findings: Finding[];
  /** Changes whenever the node is edited, to replay the "updated" pulse. */
  pulse?: number;
  chaos: boolean;
  [key: string]: unknown;
};

export type FlowEdgeData = {
  edge: ArchEdge;
  sim?: EdgeSim;
  simActive: boolean;
  severity?: Severity;
  replication: boolean;
  [key: string]: unknown;
};

export type ArchFlowNode = Node<ArchNodeData, "arch">;
export type ArchFlowEdge = Edge<FlowEdgeData, "flow">;

export const HEALTH_COLOR = {
  idle: "#8A8FB3",
  healthy: "#38BDF8",
  warning: "#F59E0B",
  failed: "#F43F5E",
  down: "#F43F5E",
} as const;
