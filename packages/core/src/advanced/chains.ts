/**
 * Memory Chains Module
 *
 * Organizes memories into coherent sequences for:
 * - Temporal narratives (what happened in order)
 * - Causal chains (A led to B led to C)
 * - Learning progressions (concept building)
 * - Task sequences (step-by-step processes)
 *
 * Chains preserve the logical flow of information that would
 * be lost if memories were only stored as isolated facts.
 */

import { nanoid } from 'nanoid';

/** Types of memory chains */
export enum ChainType {
  /** Chronological sequence of events */
  Temporal = 'temporal',
  /** Cause-effect relationships */
  Causal = 'causal',
  /** Concept building progression */
  Learning = 'learning',
  /** Step-by-step process */
  Process = 'process',
  /** Problem-solving journey */
  ProblemSolving = 'problem_solving',
  /** Related topics */
  Thematic = 'thematic',
}

/** A link between memories in a chain */
export interface ChainLink {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  linkType: LinkType;
  strength: number;
  description?: string;
  createdAt: Date;
}

/** Types of links between chain elements */
export enum LinkType {
  Next = 'next',
  Previous = 'previous',
  Causes = 'causes',
  CausedBy = 'caused_by',
  Prerequisite = 'prerequisite',
  Enables = 'enables',
  FollowsFrom = 'follows_from',
  LeadsTo = 'leads_to',
}

/** A memory chain */
export interface MemoryChain {
  id: string;
  name: string;
  type: ChainType;
  description: string;
  memoryIds: string[];
  links: ChainLink[];
  headId: string | null;
  tailId: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

/** Create a new chain link */
export function createLink(
  sourceMemoryId: string,
  targetMemoryId: string,
  linkType: LinkType,
  strength: number = 0.5,
  description?: string
): ChainLink {
  return {
    id: nanoid(),
    sourceMemoryId,
    targetMemoryId,
    linkType,
    strength: Math.max(0, Math.min(1, strength)),
    description,
    createdAt: new Date(),
  };
}

/** Create a new memory chain */
export function createChain(
  name: string,
  type: ChainType,
  description: string = ''
): MemoryChain {
  const now = new Date();
  return {
    id: nanoid(),
    name,
    type,
    description,
    memoryIds: [],
    links: [],
    headId: null,
    tailId: null,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };
}

/** Get the appropriate link type for a chain type */
export function getDefaultLinkType(chainType: ChainType): LinkType {
  switch (chainType) {
    case ChainType.Temporal:
      return LinkType.Next;
    case ChainType.Causal:
      return LinkType.Causes;
    case ChainType.Learning:
      return LinkType.Prerequisite;
    case ChainType.Process:
      return LinkType.LeadsTo;
    case ChainType.ProblemSolving:
      return LinkType.FollowsFrom;
    case ChainType.Thematic:
      return LinkType.Next;
  }
}

/**
 * Memory Chain Manager
 *
 * Manages memory chains for organizing sequential/related memories.
 */
export class ChainManager {
  private chains: Map<string, MemoryChain> = new Map();
  private memoryToChains: Map<string, string[]> = new Map();

  /**
   * Create a new chain
   */
  createChain(name: string, type: ChainType, description: string = ''): MemoryChain {
    const chain = createChain(name, type, description);
    this.chains.set(chain.id, chain);
    return chain;
  }

  /**
   * Get a chain by ID
   */
  getChain(chainId: string): MemoryChain | null {
    return this.chains.get(chainId) ?? null;
  }

  /**
   * Get all chains
   */
  getAllChains(): MemoryChain[] {
    return Array.from(this.chains.values());
  }

  /**
   * Get chains by type
   */
  getChainsByType(type: ChainType): MemoryChain[] {
    return Array.from(this.chains.values()).filter(c => c.type === type);
  }

  /**
   * Get chains containing a memory
   */
  getChainsForMemory(memoryId: string): MemoryChain[] {
    const chainIds = this.memoryToChains.get(memoryId) ?? [];
    return chainIds
      .map(id => this.chains.get(id))
      .filter((c): c is MemoryChain => c !== undefined);
  }

  /**
   * Add a memory to a chain
   */
  addToChain(
    chainId: string,
    memoryId: string,
    afterMemoryId?: string
  ): boolean {
    const chain = this.chains.get(chainId);
    if (!chain) return false;

    // Don't add duplicates
    if (chain.memoryIds.includes(memoryId)) return false;

    const linkType = getDefaultLinkType(chain.type);

    if (afterMemoryId && chain.memoryIds.includes(afterMemoryId)) {
      // Insert after specific memory
      const index = chain.memoryIds.indexOf(afterMemoryId);
      chain.memoryIds.splice(index + 1, 0, memoryId);

      // Create links
      const newLink = createLink(afterMemoryId, memoryId, linkType);
      chain.links.push(newLink);

      // If there was a next element, update links
      if (index + 2 < chain.memoryIds.length) {
        const nextId = chain.memoryIds[index + 2]!;
        // Remove old link
        chain.links = chain.links.filter(
          l => !(l.sourceMemoryId === afterMemoryId && l.targetMemoryId === nextId)
        );
        // Add new link
        chain.links.push(createLink(memoryId, nextId, linkType));
      }
    } else {
      // Add at the end
      if (chain.memoryIds.length > 0) {
        const lastId = chain.memoryIds[chain.memoryIds.length - 1]!;
        chain.links.push(createLink(lastId, memoryId, linkType));
      }
      chain.memoryIds.push(memoryId);
    }

    // Update head/tail
    if (chain.memoryIds.length === 1) {
      chain.headId = memoryId;
    }
    chain.tailId = memoryId;
    chain.updatedAt = new Date();

    // Update reverse index
    const chains = this.memoryToChains.get(memoryId) ?? [];
    if (!chains.includes(chainId)) {
      chains.push(chainId);
      this.memoryToChains.set(memoryId, chains);
    }

    return true;
  }

  /**
   * Prepend a memory to a chain
   */
  prependToChain(chainId: string, memoryId: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain) return false;

    if (chain.memoryIds.includes(memoryId)) return false;

    const linkType = getDefaultLinkType(chain.type);

    if (chain.memoryIds.length > 0) {
      const firstId = chain.memoryIds[0]!;
      chain.links.push(createLink(memoryId, firstId, linkType));
    }

    chain.memoryIds.unshift(memoryId);
    chain.headId = memoryId;
    if (!chain.tailId) {
      chain.tailId = memoryId;
    }
    chain.updatedAt = new Date();

    const chains = this.memoryToChains.get(memoryId) ?? [];
    if (!chains.includes(chainId)) {
      chains.push(chainId);
      this.memoryToChains.set(memoryId, chains);
    }

    return true;
  }

  /**
   * Remove a memory from a chain
   */
  removeFromChain(chainId: string, memoryId: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain) return false;

    const index = chain.memoryIds.indexOf(memoryId);
    if (index === -1) return false;

    const linkType = getDefaultLinkType(chain.type);

    // Get neighbors
    const prevId = index > 0 ? chain.memoryIds[index - 1] : null;
    const nextId = index < chain.memoryIds.length - 1 ? chain.memoryIds[index + 1] : null;

    // Remove memory
    chain.memoryIds.splice(index, 1);

    // Remove associated links
    chain.links = chain.links.filter(
      l => l.sourceMemoryId !== memoryId && l.targetMemoryId !== memoryId
    );

    // Create new link between neighbors
    if (prevId && nextId) {
      chain.links.push(createLink(prevId, nextId, linkType));
    }

    // Update head/tail
    if (chain.headId === memoryId) {
      chain.headId = chain.memoryIds[0] ?? null;
    }
    if (chain.tailId === memoryId) {
      chain.tailId = chain.memoryIds[chain.memoryIds.length - 1] ?? null;
    }

    chain.updatedAt = new Date();

    // Update reverse index
    const chains = this.memoryToChains.get(memoryId) ?? [];
    const chainIndex = chains.indexOf(chainId);
    if (chainIndex !== -1) {
      chains.splice(chainIndex, 1);
      if (chains.length === 0) {
        this.memoryToChains.delete(memoryId);
      } else {
        this.memoryToChains.set(memoryId, chains);
      }
    }

    return true;
  }

  /**
   * Get chain traversal from a starting point
   */
  traverse(
    chainId: string,
    startMemoryId: string,
    direction: 'forward' | 'backward' = 'forward',
    limit: number = 100
  ): string[] {
    const chain = this.chains.get(chainId);
    if (!chain) return [];

    const index = chain.memoryIds.indexOf(startMemoryId);
    if (index === -1) return [];

    if (direction === 'forward') {
      return chain.memoryIds.slice(index, index + limit);
    } else {
      const start = Math.max(0, index - limit + 1);
      return chain.memoryIds.slice(start, index + 1).reverse();
    }
  }

  /**
   * Get the next memory in a chain
   */
  getNext(chainId: string, memoryId: string): string | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const index = chain.memoryIds.indexOf(memoryId);
    if (index === -1 || index >= chain.memoryIds.length - 1) return null;

    return chain.memoryIds[index + 1] ?? null;
  }

  /**
   * Get the previous memory in a chain
   */
  getPrevious(chainId: string, memoryId: string): string | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const index = chain.memoryIds.indexOf(memoryId);
    if (index <= 0) return null;

    return chain.memoryIds[index - 1] ?? null;
  }

  /**
   * Get chain length
   */
  getLength(chainId: string): number {
    return this.chains.get(chainId)?.memoryIds.length ?? 0;
  }

  /**
   * Merge two chains
   */
  mergeChains(
    chainId1: string,
    chainId2: string,
    appendSecond: boolean = true
  ): MemoryChain | null {
    const chain1 = this.chains.get(chainId1);
    const chain2 = this.chains.get(chainId2);
    if (!chain1 || !chain2) return null;

    const linkType = getDefaultLinkType(chain1.type);

    if (appendSecond) {
      // Append chain2 to chain1
      if (chain1.memoryIds.length > 0 && chain2.memoryIds.length > 0) {
        const lastOf1 = chain1.memoryIds[chain1.memoryIds.length - 1]!;
        const firstOf2 = chain2.memoryIds[0]!;
        chain1.links.push(createLink(lastOf1, firstOf2, linkType));
      }

      for (const memId of chain2.memoryIds) {
        if (!chain1.memoryIds.includes(memId)) {
          chain1.memoryIds.push(memId);
        }
      }

      chain1.links.push(...chain2.links);
      chain1.tailId = chain2.tailId ?? chain1.tailId;
    }

    chain1.updatedAt = new Date();

    // Update reverse index
    for (const memId of chain2.memoryIds) {
      const chains = this.memoryToChains.get(memId) ?? [];
      const idx = chains.indexOf(chainId2);
      if (idx !== -1) chains.splice(idx, 1);
      if (!chains.includes(chainId1)) chains.push(chainId1);
      this.memoryToChains.set(memId, chains);
    }

    // Delete the second chain
    this.chains.delete(chainId2);

    return chain1;
  }

  /**
   * Split a chain at a memory
   */
  splitChain(
    chainId: string,
    memoryId: string
  ): [MemoryChain, MemoryChain] | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const index = chain.memoryIds.indexOf(memoryId);
    if (index <= 0) return null;

    const newChain = createChain(
      `${chain.name} (part 2)`,
      chain.type,
      chain.description
    );

    // Split memory IDs
    newChain.memoryIds = chain.memoryIds.splice(index);
    chain.memoryIds = chain.memoryIds.slice(0, index);

    // Split links
    const newLinkMemoryIds = new Set(newChain.memoryIds);
    newChain.links = chain.links.filter(
      l => newLinkMemoryIds.has(l.sourceMemoryId) && newLinkMemoryIds.has(l.targetMemoryId)
    );
    chain.links = chain.links.filter(
      l => !newLinkMemoryIds.has(l.sourceMemoryId) || !newLinkMemoryIds.has(l.targetMemoryId)
    );

    // Remove the connecting link
    chain.links = chain.links.filter(l => l.targetMemoryId !== memoryId);

    // Update head/tail
    chain.tailId = chain.memoryIds[chain.memoryIds.length - 1] ?? null;
    newChain.headId = newChain.memoryIds[0] ?? null;
    newChain.tailId = newChain.memoryIds[newChain.memoryIds.length - 1] ?? null;

    chain.updatedAt = new Date();
    this.chains.set(newChain.id, newChain);

    // Update reverse index
    for (const memId of newChain.memoryIds) {
      const chains = this.memoryToChains.get(memId) ?? [];
      const idx = chains.indexOf(chainId);
      if (idx !== -1) chains.splice(idx, 1);
      if (!chains.includes(newChain.id)) chains.push(newChain.id);
      this.memoryToChains.set(memId, chains);
    }

    return [chain, newChain];
  }

  /**
   * Delete a chain
   */
  deleteChain(chainId: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain) return false;

    // Update reverse index
    for (const memId of chain.memoryIds) {
      const chains = this.memoryToChains.get(memId) ?? [];
      const idx = chains.indexOf(chainId);
      if (idx !== -1) {
        chains.splice(idx, 1);
        if (chains.length === 0) {
          this.memoryToChains.delete(memId);
        } else {
          this.memoryToChains.set(memId, chains);
        }
      }
    }

    this.chains.delete(chainId);
    return true;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalChains: number;
    totalMemoriesInChains: number;
    avgChainLength: number;
    chainsByType: Record<ChainType, number>;
  } {
    const chains = Array.from(this.chains.values());
    const totalChains = chains.length;

    const uniqueMemories = new Set<string>();
    for (const chain of chains) {
      for (const memId of chain.memoryIds) {
        uniqueMemories.add(memId);
      }
    }

    const chainsByType: Record<ChainType, number> = {
      [ChainType.Temporal]: 0,
      [ChainType.Causal]: 0,
      [ChainType.Learning]: 0,
      [ChainType.Process]: 0,
      [ChainType.ProblemSolving]: 0,
      [ChainType.Thematic]: 0,
    };

    let totalLength = 0;
    for (const chain of chains) {
      chainsByType[chain.type]++;
      totalLength += chain.memoryIds.length;
    }

    return {
      totalChains,
      totalMemoriesInChains: uniqueMemories.size,
      avgChainLength: totalChains > 0 ? totalLength / totalChains : 0,
      chainsByType,
    };
  }

  /**
   * Clear all chains
   */
  clear(): void {
    this.chains.clear();
    this.memoryToChains.clear();
  }

  /**
   * Export chains as JSON-serializable data
   */
  export(): MemoryChain[] {
    return Array.from(this.chains.values());
  }

  /**
   * Import chains from exported data
   */
  import(chains: MemoryChain[]): void {
    for (const chain of chains) {
      this.chains.set(chain.id, chain);
      for (const memId of chain.memoryIds) {
        const existing = this.memoryToChains.get(memId) ?? [];
        if (!existing.includes(chain.id)) {
          existing.push(chain.id);
          this.memoryToChains.set(memId, existing);
        }
      }
    }
  }
}
