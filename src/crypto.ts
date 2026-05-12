import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

/**
 * Load the symmetric key used to encrypt per-user secrets at rest.
 *
 * Reads `DASHBOARD_ENCRYPTION_KEY` (base64-encoded 32 bytes). If the env is
 * unset, falls back to a key derived from `DASHBOARD_ADMIN_PASSWORD` via
 * scrypt — useful for local development. **Production deployments must set
 * `DASHBOARD_ENCRYPTION_KEY` explicitly** so the key survives password
 * rotations.
 *
 * Throws when both vars are missing.
 */
function loadEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const explicit = process.env.DASHBOARD_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const buf = Buffer.from(explicit, "base64");
    if (buf.length !== 32) {
      throw new Error("DASHBOARD_ENCRYPTION_KEY must be 32 bytes base64-encoded (256 bits)");
    }
    cachedKey = buf;
    return cachedKey;
  }
  const password = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "DASHBOARD_ENCRYPTION_KEY required to handle per-user secrets. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  // Fixed salt for dev fallback. Production must set DASHBOARD_ENCRYPTION_KEY.
  cachedKey = scryptSync(password, "vinted-deal-alert-dev-salt", 32);
  return cachedKey;
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM. Returns a base64url blob
 * containing iv || ciphertext || auth-tag. Safe to store in a text column.
 */
export function encryptString(plaintext: string): string {
  const key = loadEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64url");
}

/**
 * Decrypt a blob produced by `encryptString`. Throws on tampering /
 * wrong-key / corrupted input.
 */
export function decryptString(blob: string): string {
  const buf = Buffer.from(blob, "base64url");
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Encrypted blob too short");
  }
  const key = loadEncryptionKey();
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Validate a Discord webhook URL. Returns the trimmed URL or throws. */
export function validateDiscordWebhookUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("URL doit être une chaîne");
  const trimmed = value.trim();
  if (!/^https:\/\/(?:discord(?:app)?\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(trimmed)) {
    throw new Error("URL de webhook Discord invalide (doit commencer par https://discord.com/api/webhooks/…)");
  }
  return trimmed;
}
