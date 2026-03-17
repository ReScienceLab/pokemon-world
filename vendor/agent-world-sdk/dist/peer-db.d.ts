import type { PeerRecord } from "./types.js";
export declare class PeerDb {
    private peers;
    private maxPeers;
    private staleTtlMs;
    constructor(opts?: {
        maxPeers?: number;
        staleTtlMs?: number;
    });
    upsert(agentId: string, publicKey: string, opts?: Partial<Omit<PeerRecord, "agentId" | "publicKey">> & {
        lastSeen?: number;
    }): void;
    get(agentId: string): PeerRecord | undefined;
    has(agentId: string): boolean;
    prune(ttl?: number): number;
    getPeersForExchange(limit?: number): PeerRecord[];
    findByCapability(cap: string): PeerRecord[];
    get size(): number;
    values(): IterableIterator<PeerRecord>;
    delete(agentId: string): void;
}
//# sourceMappingURL=peer-db.d.ts.map