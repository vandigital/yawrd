export interface IdentityChallenge {
  id: string;
  accountId: string;
  network: "testnet";
  origin: string;
  message: string;
  recipient: string;
  nonce: string; // base64, exactly 32 random bytes
  issuedAt: number;
  expiresAt: number;
}

export interface IdentityProof {
  accountId: string;
  publicKey: string;
  signature: string; // NEP-413 base64
}
