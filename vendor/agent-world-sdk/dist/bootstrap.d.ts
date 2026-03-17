import type { BootstrapNode, Identity } from "./types.js";
import type { PeerDb } from "./peer-db.js";
export declare function fetchBootstrapNodes(url?: string): Promise<BootstrapNode[]>;
export interface AnnounceOpts {
    identity: Identity;
    alias: string;
    version?: string;
    publicAddr: string | null;
    publicPort: number;
    capabilities: string[];
    peerDb: PeerDb;
}
export declare function announceToNode(addr: string, httpPort: number, opts: AnnounceOpts): Promise<void>;
export interface DiscoveryOpts extends AnnounceOpts {
    bootstrapUrl?: string;
    intervalMs?: number;
    onDiscovery?: (peerCount: number) => void;
}
/**
 * Announce to all bootstrap nodes once, then schedule repeating discovery.
 * Returns a cleanup function that cancels the interval.
 */
export declare function startDiscovery(opts: DiscoveryOpts): Promise<() => void>;
//# sourceMappingURL=bootstrap.d.ts.map