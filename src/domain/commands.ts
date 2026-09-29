/**
 * Deterministic domain commands. Voice tools, the command bar, drag-and-drop,
 * linter fixes, and simulation remedies all compile down to these.
 *
 * Node references inside a transaction may be an existing node id or a symbol
 * (`$name`) bound earlier in the same transaction by `addNode.as`, so a fix can
 * say "add a worker, then connect the queue to it" without knowing future ids.
 */
import type { ComponentKind } from "./catalog";
import type { EdgeKind, Graph, Protocol, XY } from "./graph";

export type NodeRef = string;

export type Command =
  | {
      type: "addNode";
      kind: ComponentKind;
      name?: string;
      replicas?: number;
      position?: XY;
      /** Bind the new node's id to a symbol for later commands in this transaction. */
      as?: string;
      /** Upstream nodes that should call the new node. */
      connectFrom?: NodeRef[];
      /** Downstream nodes the new node should call. */
      connectTo?: NodeRef[];
      edgeKind?: EdgeKind;
      protocol?: Protocol;
      /** Let the inference engine add obvious connections when none were given. */
      autoConnect?: boolean;
    }
  | { type: "connect"; from: NodeRef; to: NodeRef; kind?: EdgeKind; protocol?: Protocol; encrypted?: boolean; label?: string }
  | { type: "insertBetween"; kind: ComponentKind; name?: string; from: NodeRef; to: NodeRef; as?: string }
  | { type: "updateNode"; id: NodeRef; name?: string; replicas?: number; kind?: ComponentKind; notes?: string }
  | { type: "updateEdge"; id: string; kind?: EdgeKind; protocol?: Protocol; encrypted?: boolean; label?: string }
  | { type: "reverseEdge"; id: string }
  | { type: "removeNodes"; ids: NodeRef[] }
  | { type: "removeEdges"; ids: string[] }
  | { type: "moveNode"; id: NodeRef; position: XY; pin?: boolean }
  | { type: "replaceGraph"; graph: Graph }
  | { type: "autoLayout"; unpinAll?: boolean }
  | { type: "clearInference"; id: string };

/** A proposed remedy the user can apply in one tap (or by saying "yes"). */
export interface Suggestion {
  /** Short button label: "Insert a service". */
  label: string;
  /** Spoken/written sentence explaining the fix. */
  text: string;
  commands: Command[];
}

export type DomainErrorCode =
  | "not_found"
  | "ambiguous"
  | "illegal_connection"
  | "duplicate_connection"
  | "self_loop"
  | "invalid_value"
  | "needs_confirmation"
  | "nothing_to_do";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly suggestion?: Suggestion,
    public readonly candidates?: string[],
  ) {
    super(message);
    this.name = "DomainError";
  }
}
