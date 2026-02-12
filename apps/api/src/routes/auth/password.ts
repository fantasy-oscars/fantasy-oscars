import crypto from "crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(
  password: string,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p
  });
  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64")
  ].join("$");
}

function verifySha256(password: string, passwordHash: string) {
  const hash = crypto.createHash("sha256").update(password).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(passwordHash));
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
  passwordAlgo: string
) {
  if (passwordAlgo === "sha256") {
    return verifySha256(password, passwordHash);
  }
  if (passwordAlgo !== "scrypt") return false;
  const parts = passwordHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const keyLen = Buffer.from(hashB64, "base64").length;
  const derived = await scryptAsync(password, salt, keyLen, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw)
  });
  return crypto.timingSafeEqual(derived, Buffer.from(hashB64, "base64"));
}
