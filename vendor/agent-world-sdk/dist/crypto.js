import crypto from "node:crypto";
import nacl from "tweetnacl";
export function agentIdFromPublicKey(publicKeyB64) {
    return crypto.createHash("sha256")
        .update(Buffer.from(publicKeyB64, "base64"))
        .digest("hex")
        .slice(0, 32);
}
export function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value !== null && typeof value === "object") {
        const sorted = {};
        for (const k of Object.keys(value).sort()) {
            sorted[k] = canonicalize(value[k]);
        }
        return sorted;
    }
    return value;
}
export function verifySignature(publicKeyB64, obj, signatureB64) {
    try {
        const pubKey = Buffer.from(publicKeyB64, "base64");
        const sig = Buffer.from(signatureB64, "base64");
        const msg = Buffer.from(JSON.stringify(canonicalize(obj)));
        return nacl.sign.detached.verify(msg, sig, pubKey);
    }
    catch {
        return false;
    }
}
export function signPayload(payload, secretKey) {
    const sig = nacl.sign.detached(Buffer.from(JSON.stringify(canonicalize(payload))), secretKey);
    return Buffer.from(sig).toString("base64");
}
//# sourceMappingURL=crypto.js.map