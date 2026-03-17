import { agentIdFromPublicKey, verifySignature } from "./crypto.js";
/**
 * Register DAP peer protocol routes on a Fastify instance:
 *   GET  /peer/ping
 *   GET  /peer/peers
 *   POST /peer/announce
 *   POST /peer/message
 */
export function registerPeerRoutes(fastify, opts) {
    const { identity, peerDb, pingExtra, onMessage } = opts;
    fastify.get("/peer/ping", async () => ({
        ok: true,
        ts: Date.now(),
        agentId: identity.agentId,
        ...pingExtra,
    }));
    fastify.get("/peer/peers", async () => ({
        peers: peerDb.getPeersForExchange(),
    }));
    fastify.post("/peer/announce", async (req, reply) => {
        const ann = req.body;
        if (!ann?.publicKey || !ann?.from) {
            return reply.code(400).send({ error: "Invalid announce" });
        }
        const { signature, ...signable } = ann;
        if (!verifySignature(ann.publicKey, signable, signature)) {
            return reply.code(403).send({ error: "Invalid signature" });
        }
        if (agentIdFromPublicKey(ann.publicKey) !== ann.from) {
            return reply.code(400).send({ error: "agentId does not match publicKey" });
        }
        peerDb.upsert(ann.from, ann.publicKey, {
            alias: ann.alias,
            endpoints: ann.endpoints,
            capabilities: ann.capabilities,
        });
        return { peers: peerDb.getPeersForExchange() };
    });
    fastify.post("/peer/message", async (req, reply) => {
        const msg = req.body;
        if (!msg?.publicKey || !msg?.from) {
            return reply.code(400).send({ error: "Invalid message" });
        }
        const { signature, ...signable } = msg;
        if (!verifySignature(msg.publicKey, signable, signature)) {
            return reply.code(403).send({ error: "Invalid signature" });
        }
        const agentId = msg.from;
        // TOFU: verify agentId ↔ publicKey binding
        const known = peerDb.get(agentId);
        if (known?.publicKey) {
            if (known.publicKey !== msg.publicKey) {
                return reply.code(403).send({ error: "publicKey does not match TOFU binding for this agentId" });
            }
        }
        else {
            if (agentIdFromPublicKey(msg.publicKey) !== agentId) {
                return reply.code(400).send({ error: "agentId does not match publicKey" });
            }
        }
        peerDb.upsert(agentId, msg.publicKey, {});
        let content;
        try {
            content = typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
        }
        catch {
            content = msg.content;
        }
        if (onMessage) {
            let replied = false;
            await onMessage(agentId, msg.event, content, (body) => {
                replied = true;
                reply.send(body);
            });
            if (!replied)
                return { ok: true };
        }
        else {
            return { ok: true };
        }
    });
}
//# sourceMappingURL=peer-protocol.js.map