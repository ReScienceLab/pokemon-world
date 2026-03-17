import type { FastifyInstance } from "fastify";
import type { Identity } from "./types.js";
import type { PeerDb as PeerDbType } from "./peer-db.js";
export interface PeerProtocolOpts {
    identity: Identity;
    peerDb: PeerDbType;
    /** Extra fields to include in /peer/ping response */
    pingExtra?: Record<string, unknown>;
    /** Called when a non-peer-protocol message arrives. Return reply body or null to skip. */
    onMessage?: (agentId: string, event: string, content: unknown, reply: (body: unknown) => void) => Promise<void>;
}
/**
 * Register DAP peer protocol routes on a Fastify instance:
 *   GET  /peer/ping
 *   GET  /peer/peers
 *   POST /peer/announce
 *   POST /peer/message
 */
export declare function registerPeerRoutes(fastify: FastifyInstance, opts: PeerProtocolOpts): void;
//# sourceMappingURL=peer-protocol.d.ts.map