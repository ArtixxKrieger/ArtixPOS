import crypto from "crypto";

// Canonical format: hash.salt  (64-byte scrypt key, hex-encoded)
// Legacy format (original auth.ts): salt:hash  — verified for backward compat

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, buf) => {
      if (err) return reject(err);
      resolve(`${buf.toString("hex")}.${salt}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (stored.includes(".")) {
      // Canonical format: hash.salt
      const dotIdx = stored.lastIndexOf(".");
      const hash = stored.slice(0, dotIdx);
      const salt = stored.slice(dotIdx + 1);
      if (!hash || !salt) return resolve(false);
      crypto.scrypt(password, salt, 64, (err, buf) => {
        if (err) return reject(err);
        try {
          resolve(crypto.timingSafeEqual(Buffer.from(hash, "hex"), buf));
        } catch {
          resolve(false);
        }
      });
    } else {
      // Legacy format: salt:hash (original auth.ts passwords)
      const colonIdx = stored.indexOf(":");
      if (colonIdx === -1) return resolve(false);
      const salt = stored.slice(0, colonIdx);
      const hash = stored.slice(colonIdx + 1);
      if (!salt || !hash) return resolve(false);
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) return reject(err);
        try {
          const a = Buffer.from(hash, "hex");
          if (a.length !== derivedKey.length) return resolve(false);
          resolve(crypto.timingSafeEqual(a, derivedKey));
        } catch {
          resolve(false);
        }
      });
    }
  });
}
