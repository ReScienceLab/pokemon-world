const DEFAULT_MAX_PEERS = 200;
const DEFAULT_STALE_TTL_MS = 30 * 60 * 1000;
export class PeerDb {
    peers = new Map();
    maxPeers;
    staleTtlMs;
    constructor(opts = {}) {
        this.maxPeers = opts.maxPeers ?? DEFAULT_MAX_PEERS;
        this.staleTtlMs = opts.staleTtlMs ?? DEFAULT_STALE_TTL_MS;
    }
    upsert(agentId, publicKey, opts = {}) {
        const now = Date.now();
        const existing = this.peers.get(agentId);
        const lastSeen = opts.lastSeen != null
            ? Math.max(existing?.lastSeen ?? 0, opts.lastSeen)
            : now;
        this.peers.set(agentId, {
            agentId,
            publicKey: publicKey || existing?.publicKey || "",
            alias: opts.alias ?? existing?.alias ?? "",
            endpoints: opts.endpoints ?? existing?.endpoints ?? [],
            capabilities: opts.capabilities ?? existing?.capabilities ?? [],
            lastSeen,
        });
        if (this.peers.size > this.maxPeers) {
            const oldest = [...this.peers.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
            this.peers.delete(oldest.agentId);
        }
    }
    get(agentId) {
        return this.peers.get(agentId);
    }
    has(agentId) {
        return this.peers.has(agentId);
    }
    prune(ttl = this.staleTtlMs) {
        const cutoff = Date.now() - ttl;
        let count = 0;
        for (const [id, p] of this.peers) {
            if (p.lastSeen < cutoff) {
                this.peers.delete(id);
                count++;
            }
        }
        return count;
    }
    getPeersForExchange(limit = 50) {
        return [...this.peers.values()]
            .sort((a, b) => b.lastSeen - a.lastSeen)
            .slice(0, limit)
            .map(({ agentId, publicKey, alias, endpoints, capabilities, lastSeen }) => ({
            agentId, publicKey, alias,
            endpoints: endpoints ?? [],
            capabilities: capabilities ?? [],
            lastSeen,
        }));
    }
    findByCapability(cap) {
        const isPrefix = cap.endsWith(":");
        return [...this.peers.values()]
            .filter((p) => p.capabilities?.some((c) => isPrefix ? c.startsWith(cap) : c === cap))
            .sort((a, b) => b.lastSeen - a.lastSeen);
    }
    get size() {
        return this.peers.size;
    }
    values() {
        return this.peers.values();
    }
    delete(agentId) {
        this.peers.delete(agentId);
    }
}
//# sourceMappingURL=peer-db.js.map