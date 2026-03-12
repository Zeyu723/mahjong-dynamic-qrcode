import { networkInterfaces } from "node:os";

import { headers } from "next/headers";

function normalizeUrl(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  return value.replace(/\/$/, "");
}

function isLoopbackUrl(value: string) {
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("[::1]")
  );
}

function getLanBaseUrl(protocol: string) {
  const interfaces = networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (
        entry.family === "IPv4" &&
        !entry.internal &&
        (entry.address.startsWith("10.") ||
          entry.address.startsWith("192.168.") ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(entry.address))
      ) {
        return `${protocol}://${entry.address}:3000`;
      }
    }
  }

  return null;
}

export async function resolveBaseUrl() {
  const configured = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL);
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost ?? headerStore.get("host");
  const protocol =
    forwardedProto ?? (configured?.startsWith("https://") ? "https" : "http");
  const current = host ? `${protocol}://${host}` : null;

  if (configured && !isLoopbackUrl(configured)) {
    return configured;
  }

  if (current && !isLoopbackUrl(current)) {
    return current;
  }

  const lan = getLanBaseUrl("http");
  if (lan) {
    return lan;
  }

  return configured ?? current ?? "http://localhost:3000";
}
