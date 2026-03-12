import { createHash, randomInt } from "node:crypto";

export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function makeVisitorFingerprint(
  displayName: string,
  phoneLast4: string,
): string {
  const normalized = `${normalizeDisplayName(displayName).toLowerCase()}|${phoneLast4}`;
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashValue(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

export function generatePasscode(length = 4): string {
  let passcode = "";
  for (let i = 0; i < length; i += 1) {
    passcode += randomInt(0, 10).toString();
  }
  return passcode;
}
