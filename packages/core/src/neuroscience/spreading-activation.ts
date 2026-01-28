/**
 * Spreading Activation Module
 *
 * Implements semantic network activation propagation:
 * - Memories are nodes in an associative network
 * - Activation spreads along edges with decay
 * - Enables associative retrieval and priming
 *
 * Based on:
 * - Collins & Loftus (1975) - Spreading activation theory
 * - Anderson (1983) - ACT* architecture
 */

import { nanoid } from 'nanoid';

/** Types of associative links */
export enum LinkType {
  /** Semantic/conceptual relationship */
  Semantic = 'semantic',
  /** Temporal proximity */
  Temporal = 'temporal',
  /** Spatial proximity */
  Spatial = 'spatial',
  /** Cause-effect relationship */
  Causal = 'causal',
  /** Part-whole relationship */
  PartOf = 'part_of',
  /** User-defined custom link */
  UserDefined = 'user_defined',
}

/** Default configuration */
export const DEFAULT_DECAY_FACTOR = 0.7; // 70% retention per hop
export const DEFAULT_MIN_ACTIVATION = 0.1; // Minimum threshold to propagate
export const DEFAULT_MAX_HOPS = 3; // Maximum propagation depth
export const MAX_ACTIVATION = 1.0;

/** Association edge between nodes */
export interface AssociationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  strength: number; // 0.0 - 1.0
  linkType: LinkType;
  activationCount: number;
  createdAt: Date;
  lastActivated: Date | null;
  metadata?: Record<string, unknown>;
}

/** Network node representing a memory */
export interface ActivationNode {
  id: string;
  memoryId: string;
  activation: number; // Current activation level 0.0 - 1.0
  lastActivated: Date | null;
  edgeIds: string[]; // Outgoing edges
  metadata?: Record<string, unknown>;
}

/** Result of spreading activation */
export interface ActivatedMemory {
  memoryId: string;
  activation: number;
  distance: number; // Hops from source
  path: string[]; // Node IDs in path
  linkType: LinkType | null; // Primary link type
}

/** Network configuration */
export interface ActivationConfig {
  decayFactor: number;
  minActivation: number;
  maxHops: number;
  normalizeActivation: boolean;
}

/**
 * Create an association edge
 */
export function createEdge(
  sourceId: string,
  targetId: string,
  strength: number = 0.5,
  linkType: LinkType = LinkType.Semantic,
  metadata?: Record<string, unknown>
): AssociationEdge {
  return {
    id: nanoid(),
    sourceId,
    targetId,
    strength: Math.max(0, Math.min(1, strength)),
    linkType,
    activationCount: 0,
    createdAt: new Date(),
    lastActivated: null,
    metadata,
  };
}

/**
 * Create a network node
 */
export function createNode(
  memoryId: string,
  metadata?: Record<string, unknown>
): ActivationNode {
  return {
    id: nanoid(),
    memoryId,
    activation: 0,
    lastActivated: null,
    edgeIds: [],
    metadata,
  };
}

/**
 * Reinforce an edge (increase strength)
 */
export function reinforceEdge(
  edge: AssociationEdge,
  amount: number = 0.1
): AssociationEdge {
  return {
    ...edge,
    strength: Math.min(1, edge.strength + amount),
    activationCount: edge.activationCount + 1,
    lastActivated: new Date(),
  };
}

/**
 * Apply decay to an edge
 */
export function decayEdge(
  edge: AssociationEdge,
  decayRate: number = 0.99
): AssociationEdge {
  return {
    ...edge,
    strength: Math.max(0, edge.strength * decayRate),
  };
}

/**
 * Activation Network for spreading activation
 */
export class ActivationNetwork {
  private nodes: Map<string, ActivationNode> = new Map();
  private nodesByMemory: Map<string, string> = new Map(); // memoryId -> nodeId
  private edges: Map<string, AssociationEdge> = new Map();
  private config: ActivationConfig;

  constructor(config?: Partial<ActivationConfig>) {
    this.config = {
      decayFactor: config?.decayFactor ?? DEFAULT_DECAY_FACTOR,
      minActivation: config?.minActivation ?? DEFAULT_MIN_ACTIVATION,
      maxHops: config?.maxHops ?? DEFAULT_MAX_HOPS,
      normalizeActivation: config?.normalizeActivation ?? false,
    };
  }

  /**
   * Add a node to the network
   */
  addNode(memoryId: string, metadata?: Record<string, unknown>): ActivationNode {
    // Check if already exists
    const existingNodeId = this.nodesByMemory.get(memoryId);
    if (existingNodeId) {
      return this.nodes.get(existingNodeId)!;
    }

    const node = createNode(memoryId, metadata);
    this.nodes.set(node.id, node);
    this.nodesByMemory.set(memoryId, node.id);
    return node;
  }

  /**
   * Get or create a node for a memory
   */
  getOrCreateNode(memoryId: string): ActivationNode {
    const nodeId = this.nodesByMemory.get(memoryId);
    if (nodeId) {
      return this.nodes.get(nodeId)!;
    }
    return this.addNode(memoryId);
  }

  /**
   * Add an edge between two memories
   */
  addEdge(
    sourceMemoryId: string,
    targetMemoryId: string,
    strength: number = 0.5,
    linkType: LinkType = LinkType.Semantic,
    metadata?: Record<string, unknown>
  ): AssociationEdge {
    // Ensure nodes exist
    const sourceNode = this.getOrCreateNode(sourceMemoryId);
    const targetNode = this.getOrCreateNode(targetMemoryId);

    // Check for existing edge
    for (const edgeId of sourceNode.edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge && edge.targetId === targetNode.id && edge.linkType === linkType) {
        // Reinforce existing edge
        const reinforced = reinforceEdge(edge, strength * 0.1);
        this.edges.set(edgeId, reinforced);
        return reinforced;
      }
    }

    // Create new edge
    const edge = createEdge(sourceNode.id, targetNode.id, strength, linkType, metadata);
    this.edges.set(edge.id, edge);

    // Update source node
    const updatedSource: ActivationNode = {
      ...sourceNode,
      edgeIds: [...sourceNode.edgeIds, edge.id],
    };
    this.nodes.set(sourceNode.id, updatedSource);

    return edge;
  }

  /**
   * Add bidirectional edge
   */
  addBidirectionalEdge(
    memoryId1: string,
    memoryId2: string,
    strength: number = 0.5,
    linkType: LinkType = LinkType.Semantic
  ): [AssociationEdge, AssociationEdge] {
    const edge1 = this.addEdge(memoryId1, memoryId2, strength, linkType);
    const edge2 = this.addEdge(memoryId2, memoryId1, strength, linkType);
    return [edge1, edge2];
  }

  /**
   * Activate a memory and spread activation through the network
   */
  activate(
    memoryId: string,
    initialActivation: number = 1.0
  ): ActivatedMemory[] {
    const startNodeId = this.nodesByMemory.get(memoryId);
    if (!startNodeId) {
      return [];
    }

    // Clear previous activations
    this.clearActivations();

    // BFS queue: [nodeId, activation, distance, path, linkType]
    type QueueItem = [string, number, number, string[], LinkType | null];
    const queue: QueueItem[] = [[startNodeId, initialActivation, 0, [startNodeId], null]];

    // Track visited nodes with their best activation
    const visited = new Map<string, number>();
    visited.set(startNodeId, initialActivation);

    const results: ActivatedMemory[] = [];

    // Set initial node activation
    const startNode = this.nodes.get(startNodeId)!;
    this.nodes.set(startNodeId, {
      ...startNode,
      activation: initialActivation,
      lastActivated: new Date(),
    });

    results.push({
      memoryId,
      activation: initialActivation,
      distance: 0,
      path: [memoryId],
      linkType: null,
    });

    while (queue.length > 0) {
      const [currentNodeId, currentActivation, distance, path, primaryLinkType] = queue.shift()!;

      if (distance >= this.config.maxHops) continue;

      const currentNode = this.nodes.get(currentNodeId)!;

      // Propagate to connected nodes
      for (const edgeId of currentNode.edgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge) continue;

        // Calculate propagated activation
        const propagatedActivation =
          currentActivation * edge.strength * this.config.decayFactor;

        // Skip if below threshold
        if (propagatedActivation < this.config.minActivation) continue;

        // Skip if already visited with higher activation
        const previousActivation = visited.get(edge.targetId) ?? 0;
        if (propagatedActivation <= previousActivation) continue;

        visited.set(edge.targetId, propagatedActivation);

        // Update target node
        const targetNode = this.nodes.get(edge.targetId)!;
        this.nodes.set(edge.targetId, {
          ...targetNode,
          activation: propagatedActivation,
          lastActivated: new Date(),
        });

        // Record edge activation
        this.edges.set(edgeId, {
          ...edge,
          activationCount: edge.activationCount + 1,
          lastActivated: new Date(),
        });

        // Determine link type (first hop's link type)
        const linkType = primaryLinkType ?? edge.linkType;

        // Add to results
        results.push({
          memoryId: targetNode.memoryId,
          activation: propagatedActivation,
          distance: distance + 1,
          path: [...path, targetNode.memoryId],
          linkType,
        });

        // Add to queue for further propagation
        queue.push([
          edge.targetId,
          propagatedActivation,
          distance + 1,
          [...path, targetNode.memoryId],
          linkType,
        ]);
      }
    }

    // Sort by activation level descending
    results.sort((a, b) => b.activation - a.activation);

    // Normalize if configured
    if (this.config.normalizeActivation && results.length > 0) {
      const maxActivation = results[0]!.activation;
      if (maxActivation > 0) {
        return results.map(r => ({
          ...r,
          activation: r.activation / maxActivation,
        }));
      }
    }

    return results;
  }

  /**
   * Get direct associations for a memory
   */
  getAssociations(memoryId: string): { memory: ActivatedMemory; edge: AssociationEdge }[] {
    const nodeId = this.nodesByMemory.get(memoryId);
    if (!nodeId) return [];

    const node = this.nodes.get(nodeId)!;
    const results: { memory: ActivatedMemory; edge: AssociationEdge }[] = [];

    for (const edgeId of node.edgeIds) {
      const edge = this.edges.get(edgeId);
      if (!edge) continue;

      const targetNode = this.nodes.get(edge.targetId);
      if (!targetNode) continue;

      results.push({
        memory: {
          memoryId: targetNode.memoryId,
          activation: edge.strength,
          distance: 1,
          path: [memoryId, targetNode.memoryId],
          linkType: edge.linkType,
        },
        edge,
      });
    }

    // Sort by strength
    results.sort((a, b) => b.edge.strength - a.edge.strength);
    return results;
  }

  /**
   * Reinforce an edge between two memories
   */
  reinforceEdgeBetween(
    sourceMemoryId: string,
    targetMemoryId: string,
    amount: number = 0.1
  ): boolean {
    const sourceNodeId = this.nodesByMemory.get(sourceMemoryId);
    const targetNodeId = this.nodesByMemory.get(targetMemoryId);
    if (!sourceNodeId || !targetNodeId) return false;

    const sourceNode = this.nodes.get(sourceNodeId)!;

    for (const edgeId of sourceNode.edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge && edge.targetId === targetNodeId) {
        const reinforced = reinforceEdge(edge, amount);
        this.edges.set(edgeId, reinforced);
        return true;
      }
    }

    return false;
  }

  /**
   * Clear all activation levels
   */
  clearActivations(): void {
    for (const [nodeId, node] of this.nodes) {
      this.nodes.set(nodeId, {
        ...node,
        activation: 0,
      });
    }
  }

  /**
   * Decay all edge strengths
   */
  decayAllEdges(decayRate: number = 0.99): number {
    let decayedCount = 0;
    const toRemove: string[] = [];

    for (const [edgeId, edge] of this.edges) {
      const decayed = decayEdge(edge, decayRate);
      if (decayed.strength < 0.01) {
        toRemove.push(edgeId);
      } else {
        this.edges.set(edgeId, decayed);
        decayedCount++;
      }
    }

    // Remove very weak edges
    for (const edgeId of toRemove) {
      this.removeEdge(edgeId);
    }

    return decayedCount;
  }

  /**
   * Remove an edge
   */
  private removeEdge(edgeId: string): void {
    const edge = this.edges.get(edgeId);
    if (!edge) return;

    // Remove from source node
    const sourceNode = this.nodes.get(edge.sourceId);
    if (sourceNode) {
      this.nodes.set(edge.sourceId, {
        ...sourceNode,
        edgeIds: sourceNode.edgeIds.filter(id => id !== edgeId),
      });
    }

    this.edges.delete(edgeId);
  }

  /**
   * Get network statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    avgEdgesPerNode: number;
    totalActivations: number;
    avgEdgeStrength: number;
  } {
    const nodeCount = this.nodes.size;
    const edgeCount = this.edges.size;

    let totalActivations = 0;
    let totalStrength = 0;

    for (const edge of this.edges.values()) {
      totalActivations += edge.activationCount;
      totalStrength += edge.strength;
    }

    return {
      nodeCount,
      edgeCount,
      avgEdgesPerNode: nodeCount > 0 ? edgeCount / nodeCount : 0,
      totalActivations,
      avgEdgeStrength: edgeCount > 0 ? totalStrength / edgeCount : 0,
    };
  }

  /**
   * Get node for a memory
   */
  getNode(memoryId: string): ActivationNode | null {
    const nodeId = this.nodesByMemory.get(memoryId);
    if (!nodeId) return null;
    return this.nodes.get(nodeId) ?? null;
  }

  /**
   * Check if memory exists in network
   */
  hasMemory(memoryId: string): boolean {
    return this.nodesByMemory.has(memoryId);
  }

  /**
   * Remove a memory and its edges from the network
   */
  removeMemory(memoryId: string): boolean {
    const nodeId = this.nodesByMemory.get(memoryId);
    if (!nodeId) return false;

    const node = this.nodes.get(nodeId)!;

    // Remove outgoing edges
    for (const edgeId of node.edgeIds) {
      this.edges.delete(edgeId);
    }

    // Remove incoming edges
    for (const [edgeId, edge] of this.edges) {
      if (edge.targetId === nodeId) {
        this.removeEdge(edgeId);
      }
    }

    // Remove node
    this.nodes.delete(nodeId);
    this.nodesByMemory.delete(memoryId);

    return true;
  }

  /**
   * Export network as JSON-serializable object
   */
  export(): { nodes: ActivationNode[]; edges: AssociationEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  /**
   * Import network from exported data
   */
  import(data: { nodes: ActivationNode[]; edges: AssociationEdge[] }): void {
    this.nodes.clear();
    this.nodesByMemory.clear();
    this.edges.clear();

    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
      this.nodesByMemory.set(node.memoryId, node.id);
    }

    for (const edge of data.edges) {
      this.edges.set(edge.id, edge);
    }
  }
}

/**
 * Find shortest path between two memories
 */
export function findShortestPath(
  network: ActivationNetwork,
  sourceMemoryId: string,
  targetMemoryId: string
): string[] | null {
  const activated = network.activate(sourceMemoryId, 1.0);
  const target = activated.find(a => a.memoryId === targetMemoryId);
  return target?.path ?? null;
}

/**
 * Get strongly connected memories (bidirectional edges with high strength)
 */
export function getStronglyConnected(
  network: ActivationNetwork,
  memoryId: string,
  minStrength: number = 0.5
): string[] {
  const associations = network.getAssociations(memoryId);
  return associations
    .filter(a => a.edge.strength >= minStrength)
    .map(a => a.memory.memoryId);
}
