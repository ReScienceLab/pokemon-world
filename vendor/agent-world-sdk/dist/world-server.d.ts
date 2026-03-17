import type { WorldConfig, WorldHooks, WorldServer } from "./types.js";
/**
 * Start a fully-wired DAP World Agent server.
 *
 * Handles: identity, peer DB, bootstrap discovery, peer protocol routes,
 * world.join / world.action / world.leave dispatch, idle-agent eviction,
 * and periodic world.state broadcasts.
 *
 * @param config  World configuration (see WorldConfig)
 * @param hooks   Game logic callbacks (see WorldHooks)
 * @returns       WorldServer with `.fastify` for additional route registration
 */
export declare function createWorldServer(config: WorldConfig, hooks: WorldHooks): Promise<WorldServer>;
//# sourceMappingURL=world-server.d.ts.map