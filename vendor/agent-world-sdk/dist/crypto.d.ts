export declare function agentIdFromPublicKey(publicKeyB64: string): string;
export declare function canonicalize(value: unknown): unknown;
export declare function verifySignature(publicKeyB64: string, obj: unknown, signatureB64: string): boolean;
export declare function signPayload(payload: unknown, secretKey: Uint8Array): string;
//# sourceMappingURL=crypto.d.ts.map