import type { Identity } from "./types.js";
/**
 * Load an existing Ed25519 identity from dataDir or create a new one.
 * @param dataDir  Directory where identity file is stored
 * @param name     Identity file name (without .json), e.g. "world-identity" or "gateway-identity"
 */
export declare function loadOrCreateIdentity(dataDir: string, name?: string): Identity;
//# sourceMappingURL=identity.d.ts.map