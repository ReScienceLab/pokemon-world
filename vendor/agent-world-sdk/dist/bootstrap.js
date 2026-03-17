import { signPayload } from "./crypto.js";
const DEFAULT_BOOTSTRAP_URL = "https://resciencelab.github.io/DAP/bootstrap.json";
export async function fetchBootstrapNodes(url = DEFAULT_BOOTSTRAP_URL) {
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!resp.ok)
            return [];
        const data = await resp.json();
        return (data.bootstrap_nodes ?? [])
            .filter((n) => n.addr)
            .map((n) => ({ addr: n.addr, httpPort: n.httpPort ?? 8099 }));
    }
    catch {
        return [];
    }
}
export async function announceToNode(addr, httpPort, opts) {
    const { identity, alias, version, publicAddr, publicPort, capabilities, peerDb } = opts;
    const isIpv6 = addr.includes(":") && !addr.includes(".");
    const url = isIpv6
        ? `http://[${addr}]:${httpPort}/peer/announce`
        : `http://${addr}:${httpPort}/peer/announce`;
    const endpoints = publicAddr
        ? [{ transport: "tcp", address: publicAddr, port: publicPort, priority: 1, ttl: 3600 }]
        : [];
    const payload = {
        from: identity.agentId,
        publicKey: identity.pubB64,
        alias,
        version: version ?? "1.0.0",
        endpoints,
        capabilities,
        timestamp: Date.now(),
    };
    payload["signature"] = signPayload(payload, identity.secretKey);
    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok)
            return;
        const data = await resp.json();
        for (const peer of data.peers ?? []) {
            if (peer.agentId && peer.agentId !== identity.agentId) {
                peerDb.upsert(peer.agentId, peer.publicKey, {
                    alias: peer.alias,
                    endpoints: peer.endpoints,
                    capabilities: peer.capabilities,
                    lastSeen: peer.lastSeen,
                });
            }
        }
    }
    catch {
        // bootstrap node unreachable — skip silently
    }
}
/**
 * Announce to all bootstrap nodes once, then schedule repeating discovery.
 * Returns a cleanup function that cancels the interval.
 */
export async function startDiscovery(opts) {
    const { bootstrapUrl, intervalMs = 10 * 60 * 1000, onDiscovery } = opts;
    async function runDiscovery() {
        const nodes = await fetchBootstrapNodes(bootstrapUrl);
        await Promise.allSettled(nodes.map((n) => announceToNode(n.addr, n.httpPort, opts)));
        onDiscovery?.(opts.peerDb.size);
    }
    setTimeout(runDiscovery, 3_000);
    const timer = setInterval(runDiscovery, intervalMs);
    return () => clearInterval(timer);
}
//# sourceMappingURL=bootstrap.js.map