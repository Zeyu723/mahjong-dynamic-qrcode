import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";

import bcrypt from "bcryptjs";

import {
  AppStore,
  CAMPAIGN_STATUS,
  Campaign,
  ROUND_CLOSE_REASON,
  ROUND_STATUS,
  Room,
  Round,
  RoundCloseReason,
  RoundParticipant,
  SCAN_RESULT,
  ScanEvent,
  USER_ROLE,
  UserRole,
  Visitor,
} from "@/lib/domain";
import { SCAN_RESULT_MESSAGE } from "@/lib/scan-result";

const STORE_FILE =
  process.env.STORE_FILE ?? path.join(process.cwd(), "data", "store.json");
const REDIS_STORE_KEY = "mahjong_store_v2";
const STORE_VERSION = 2;

// Initialize Redis client if environment variables are present
const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

type StoreSnapshot = {
  store: AppStore;
  etag: string | null;
};

let initPromise: Promise<void> | null = null;
let writeQueue = Promise.resolve();

// 内存缓存相关变量
let cachedSnapshot: StoreSnapshot | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5 * 1000; // 5秒缓存，减少高频读取

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isVercelEnvironment() {
  return Boolean(process.env.VERCEL);
}

function isRedisEnabled() {
  return Boolean(redis);
}

function shouldRequireRedisStorage() {
  return isProduction() && isVercelEnvironment() && !isRedisEnabled();
}

function normalizeText(value: string | undefined | null) {
  return value?.trim() ? value.trim() : null;
}

function parseDateOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDefaultRoomNames(): string[] {
  const roomSuffix = String.fromCodePoint(0x623f);
  const fallback = [`A${roomSuffix}`, `B${roomSuffix}`, `C${roomSuffix}`];
  const raw = process.env.SEED_ROOMS;

  if (!raw || /[?�]/.test(raw) || /鎴|æ¿/.test(raw)) {
    return fallback;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createDefaultCampaign(timestamp: string): Campaign {
  return {
    id: createId("campaign"),
    slug: "default",
    name: "麻将房扫码活动",
    targetUrl: process.env.DEFAULT_TARGET_URL ?? "https://docs.qq.com/form",
    status: CAMPAIGN_STATUS.RUNNING,
    timezone: "Asia/Shanghai",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function getMaxSortOrder(rooms: Room[]) {
  return rooms.reduce((max, room) => Math.max(max, room.sortOrder), -1);
}

function sortRooms(rooms: Room[]) {
  return [...rooms].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
  });
}

function sortByNewest<T extends { scannedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
  );
}

function sortRoundsByNewest(rounds: Round[]): Round[] {
  return [...rounds].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

function getBootstrapUsers(): Array<{
  username: string;
  password: string;
  role: UserRole;
}> {
  const adminUsername = normalizeText(process.env.SEED_ADMIN_USERNAME);
  const adminPassword = normalizeText(process.env.SEED_ADMIN_PASSWORD);
  const staffUsername = normalizeText(process.env.SEED_STAFF_USERNAME);
  const staffPassword = normalizeText(process.env.SEED_STAFF_PASSWORD);

  if (isProduction()) {
    const users: Array<{
      username: string;
      password: string;
      role: UserRole;
    }> = [];

    if (adminUsername && adminPassword) {
      users.push({
        username: adminUsername,
        password: adminPassword,
        role: USER_ROLE.ADMIN,
      });
    }

    if (staffUsername && staffPassword) {
      users.push({
        username: staffUsername,
        password: staffPassword,
        role: USER_ROLE.STAFF,
      });
    }

    return users;
  }

  return [
    {
      username: adminUsername ?? "admin",
      password: adminPassword ?? "Admin@123456",
      role: USER_ROLE.ADMIN,
    },
    {
      username: staffUsername ?? "staff",
      password: staffPassword ?? "Staff@123456",
      role: USER_ROLE.STAFF,
    },
  ];
}

async function buildDefaultUsers(
  existingUsers: AppStore["adminUsers"],
  timestamp: string,
) {
  const users = [...existingUsers];

  for (const item of getBootstrapUsers()) {
    const existing = users.find((user) => user.username === item.username);
    if (existing) {
      continue;
    }

    users.push({
      id: createId("user"),
      username: item.username,
      passwordHash: await bcrypt.hash(item.password, 10),
      role: item.role,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return users;
}

function normalizeRooms(
  existingRooms: Partial<Room>[],
  timestamp: string,
  shouldSeedDefaults: boolean,
): Room[] {
  const rooms = existingRooms.map((room, index) => ({
    id: room.id ?? createId("room"),
    name: normalizeText(room.name) ?? `房间 ${index + 1}`,
    active: room.active ?? true,
    sortOrder:
      typeof room.sortOrder === "number" && Number.isFinite(room.sortOrder)
        ? room.sortOrder
        : index,
    createdAt: room.createdAt ?? timestamp,
    updatedAt: room.updatedAt ?? timestamp,
  }));

  if (shouldSeedDefaults && rooms.length === 0) {
    let nextSortOrder = 0;

    for (const roomName of getDefaultRoomNames()) {
      rooms.push({
        id: createId("room"),
        name: roomName,
        active: true,
        sortOrder: nextSortOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      nextSortOrder += 1;
    }
  }

  return sortRooms(rooms).map((room, index) => ({
    ...room,
    sortOrder: index,
  }));
}

function normalizeRound(
  input: Partial<Round>,
  roomNameById: Map<string, string>,
  timestamp: string,
): Round {
  const roomNameSnapshot =
    normalizeText(input.roomNameSnapshot) ??
    roomNameById.get(input.roomId ?? "") ??
    "已删除房间";
  const expiresAt = normalizeText(input.expiresAt) ?? null;
  const closeReason =
    input.closeReason &&
    Object.values(ROUND_CLOSE_REASON).includes(input.closeReason)
      ? input.closeReason
      : input.status === ROUND_STATUS.CLOSED
        ? ROUND_CLOSE_REASON.MANUAL
        : null;

  return {
    id: input.id ?? createId("round"),
    roomId: input.roomId ?? "",
    roomNameSnapshot,
    passcode: normalizeText(input.passcode) ?? "0000",
    capacity:
      typeof input.capacity === "number" && input.capacity > 0
        ? Math.floor(input.capacity)
        : 4,
    occupiedCount:
      typeof input.occupiedCount === "number" && input.occupiedCount >= 0
        ? Math.floor(input.occupiedCount)
        : 0,
    expiresAt,
    status:
      input.status === ROUND_STATUS.CLOSED ? ROUND_STATUS.CLOSED : ROUND_STATUS.OPEN,
    closeReason,
    startedAt: input.startedAt ?? timestamp,
    endedAt: input.endedAt ?? null,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
}

function normalizeVisitors(input: Partial<Visitor>[], timestamp: string) {
  return input.map((visitor) => ({
    id: visitor.id ?? createId("visitor"),
    displayName: normalizeText(visitor.displayName) ?? "匿名访客",
    phoneLast4: normalizeText(visitor.phoneLast4) ?? "0000",
    fingerprint: normalizeText(visitor.fingerprint) ?? createId("visitor_fp"),
    createdAt: visitor.createdAt ?? timestamp,
    updatedAt: visitor.updatedAt ?? timestamp,
  }));
}

function normalizeParticipants(
  input: Partial<RoundParticipant>[],
  timestamp: string,
) {
  return input.map((participant) => ({
    id: participant.id ?? createId("participant"),
    roundId: participant.roundId ?? "",
    visitorId: participant.visitorId ?? "",
    joinedAt: participant.joinedAt ?? timestamp,
  }));
}

function normalizeScanEvent(
  input: Partial<ScanEvent>,
  roomNameById: Map<string, string>,
  roundById: Map<string, Round>,
  timestamp: string,
): ScanEvent {
  const round = input.roundId ? roundById.get(input.roundId) ?? null : null;
  const roomNameSnapshot =
    normalizeText(input.roomNameSnapshot) ??
    round?.roomNameSnapshot ??
    (input.roomId ? roomNameById.get(input.roomId) ?? null : null);

  return {
    id: input.id ?? createId("event"),
    campaignId: input.campaignId ?? null,
    roomId: input.roomId ?? null,
    roomNameSnapshot,
    roundId: input.roundId ?? null,
    visitorId: input.visitorId ?? null,
    scannedAt: input.scannedAt ?? timestamp,
    result:
      input.result && Object.values(SCAN_RESULT).includes(input.result)
        ? input.result
        : SCAN_RESULT.DENY_INTERNAL,
    reason: input.reason ?? null,
    ipHash: input.ipHash ?? null,
    ua: input.ua ?? null,
  };
}

function closeRoundRecord(
  round: Round,
  reason: RoundCloseReason,
  options: { endedAt?: string; updatedAt?: string } = {},
) {
  if (round.status === ROUND_STATUS.CLOSED) {
    return false;
  }

  round.status = ROUND_STATUS.CLOSED;
  round.closeReason = reason;
  round.endedAt = options.endedAt ?? nowIso();
  round.updatedAt = options.updatedAt ?? nowIso();
  return true;
}

function expireRoundsInStore(store: AppStore) {
  let changed = false;
  const now = new Date();
  const updatedAt = now.toISOString();

  for (const round of store.rounds) {
    const expiresAt = parseDateOrNull(round.expiresAt);
    if (
      round.status === ROUND_STATUS.OPEN &&
      expiresAt &&
      expiresAt.getTime() <= now.getTime()
    ) {
      changed =
        closeRoundRecord(round, ROUND_CLOSE_REASON.EXPIRED, {
          endedAt: expiresAt.toISOString(),
          updatedAt,
        }) || changed;
    }
  }

  return changed;
}

function cleanupOldDataInStore(store: AppStore) {
  let changed = false;
  const now = new Date();
  
  // 保留最近 7 天的记录，或者保留最近 5000 条记录
  const DAYS_TO_KEEP = 7;
  const MAX_EVENTS_TO_KEEP = 5000;
  
  const cutoffDate = new Date(now.getTime() - DAYS_TO_KEEP * 24 * 60 * 60 * 1000);
  
  // 1. 清理 ScanEvents (扫码日志)
  if (store.scanEvents.length > 0) {
    const initialLength = store.scanEvents.length;
    // 按时间倒序排序 (最新的在前面)
    const sortedEvents = sortByNewest(store.scanEvents);
    
    // 过滤掉超过7天的，并且最多只保留 MAX_EVENTS_TO_KEEP 条
    const keptEvents = sortedEvents
      .filter(event => {
        const scannedAt = parseDateOrNull(event.scannedAt);
        return scannedAt && scannedAt.getTime() > cutoffDate.getTime();
      })
      .slice(0, MAX_EVENTS_TO_KEEP);
      
    if (keptEvents.length < initialLength) {
      store.scanEvents = keptEvents;
      changed = true;
    }
  }
  
  // 2. 清理已经结束且超过 7 天的 Rounds (房间轮次)
  if (store.rounds.length > 0) {
    const initialLength = store.rounds.length;
    store.rounds = store.rounds.filter(round => {
      // 保留开启状态的轮次
      if (round.status === ROUND_STATUS.OPEN) return true;
      
      // 对于已关闭的轮次，如果超过 7 天则删除
      const endedAt = parseDateOrNull(round.endedAt) || parseDateOrNull(round.updatedAt);
      return endedAt && endedAt.getTime() > cutoffDate.getTime();
    });
    
    if (store.rounds.length < initialLength) {
      changed = true;
    }
  }

  // 3. 清理 RoundParticipants (参局记录)，只保留还在 rounds 列表中的
  if (store.roundParticipants.length > 0) {
    const initialLength = store.roundParticipants.length;
    const validRoundIds = new Set(store.rounds.map(r => r.id));
    
    store.roundParticipants = store.roundParticipants.filter(p => validRoundIds.has(p.roundId));
    
    if (store.roundParticipants.length < initialLength) {
      changed = true;
    }
  }

  // 4. 清理无用的 Visitors (如果没有参与任何还在的 round，且最近没有扫码记录)
  if (store.visitors.length > 0) {
    const initialLength = store.visitors.length;
    const activeVisitorIds = new Set([
      ...store.roundParticipants.map(p => p.visitorId),
      ...store.scanEvents.map(e => e.visitorId).filter(Boolean)
    ]);
    
    store.visitors = store.visitors.filter(v => activeVisitorIds.has(v.id));
    
    if (store.visitors.length < initialLength) {
      changed = true;
    }
  }

  return changed;
}

async function normalizeStore(input: Partial<AppStore> | null): Promise<AppStore> {
  const timestamp = nowIso();
  const adminUsers = await buildDefaultUsers(
    Array.isArray(input?.adminUsers) ? input.adminUsers : [],
    timestamp,
  );
  const rooms = normalizeRooms(Array.isArray(input?.rooms) ? input.rooms : [], timestamp, !input);
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));
  const rounds = Array.isArray(input?.rounds)
    ? input.rounds.map((round) => normalizeRound(round, roomNameById, timestamp))
    : [];
  const roundById = new Map(rounds.map((round) => [round.id, round]));
  const visitors = normalizeVisitors(
    Array.isArray(input?.visitors) ? input.visitors : [],
    timestamp,
  );
  const roundParticipants = normalizeParticipants(
    Array.isArray(input?.roundParticipants) ? input.roundParticipants : [],
    timestamp,
  );
  const scanEvents = Array.isArray(input?.scanEvents)
    ? input.scanEvents.map((event) =>
        normalizeScanEvent(event, roomNameById, roundById, timestamp),
      )
    : [];

  const store: AppStore = {
    version: STORE_VERSION,
    campaign: input?.campaign ?? createDefaultCampaign(timestamp),
    adminUsers,
    rooms,
    rounds,
    visitors,
    roundParticipants,
    scanEvents,
  };

  expireRoundsInStore(store);
  cleanupOldDataInStore(store);
  return store;
}

async function readStoreTextFromRedis(): Promise<StoreSnapshot | null> {
  if (!redis) return null;
  
  try {
    // 乐观锁：使用 Redis 的 GET 配合 version/timestamp 或直接读取
    const data = await redis.get<AppStore>(REDIS_STORE_KEY);
    if (!data) {
      return null;
    }

    // 为了简单模拟 ETag 的乐观锁机制，我们计算一个简单的 hash 或使用 updatedAt
    // 这里简单用字符串长度+版本作为 etag
    const etag = `${JSON.stringify(data).length}`;
    
    return {
      store: data,
      etag,
    };
  } catch (error) {
    console.error("Failed to read from Redis:", error);
    return null;
  }
}

async function writeStoreTextToRedis(
  store: AppStore,
  etag?: string | null,
): Promise<string | null> {
  if (!redis) return null;

  try {
    // 如果传入了 etag，我们可以简单地做一次校验（在极高并发下可能会有瑕疵，但作为替代方案足够）
    if (etag) {
      const currentData = await redis.get<AppStore>(REDIS_STORE_KEY);
      const currentEtag = currentData ? `${JSON.stringify(currentData).length}` : null;
      if (currentEtag && currentEtag !== etag) {
        throw new Error("PreconditionFailed"); // 模拟 BlobPreconditionFailedError
      }
    }

    await redis.set(REDIS_STORE_KEY, store);
    return `${JSON.stringify(store).length}`;
  } catch (error) {
    if (error instanceof Error && error.message === "PreconditionFailed") {
      throw error;
    }
    console.error("Failed to write to Redis:", error);
    throw error;
  }
}

async function readStoreFileSnapshot(): Promise<StoreSnapshot | null> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    return {
      store: JSON.parse(raw) as AppStore,
      etag: null,
    };
  } catch {
    return null;
  }
}

async function writeStoreFileSnapshot(store: AppStore): Promise<string | null> {
  await mkdir(path.dirname(STORE_FILE), { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
  return null;
}

async function readSnapshot(): Promise<StoreSnapshot | null> {
  if (shouldRequireRedisStorage()) {
    throw new Error(
      "Vercel production requires KV_REST_API_TOKEN. File storage is not persistent on Vercel.",
    );
  }

  const now = Date.now();
  if (cachedSnapshot && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedSnapshot;
  }

  const snapshot = await (isRedisEnabled() ? readStoreTextFromRedis() : readStoreFileSnapshot());
  
  if (snapshot) {
    cachedSnapshot = snapshot;
    lastCacheTime = Date.now();
  }

  return snapshot;
}

async function writeSnapshot(
  store: AppStore,
  etag?: string | null,
): Promise<string | null> {
  const newEtag = await (isRedisEnabled()
    ? writeStoreTextToRedis(store, etag)
    : writeStoreFileSnapshot(store));
    
  // 写入后立即更新缓存
  cachedSnapshot = { store, etag: newEtag };
  lastCacheTime = Date.now();
  
  return newEtag;
}

function isSameStore(a: AppStore, b: AppStore) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function ensureStoreInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const snapshot = await readSnapshot();
      const normalized = await normalizeStore(snapshot?.store ?? null);

      if (!snapshot) {
        try {
          await writeSnapshot(normalized, null);
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "PreconditionFailed") {
            throw error;
          }
        }
        return;
      }

      if (!isSameStore(snapshot.store, normalized)) {
        try {
          await writeSnapshot(normalized, snapshot.etag);
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "PreconditionFailed") {
            throw error;
          }
        }
      }
    })();
  }

  await initPromise;
}

async function getStoreSnapshot(): Promise<StoreSnapshot> {
  await ensureStoreInitialized();
  const snapshot = await readSnapshot();

  if (!snapshot) {
    const normalized = await normalizeStore(null);
    const etag = await writeSnapshot(normalized, null);
    return { store: normalized, etag };
  }

  const normalized = await normalizeStore(snapshot.store);
  if (!isSameStore(snapshot.store, normalized)) {
    const etag = await writeSnapshot(normalized, snapshot.etag);
    return { store: normalized, etag };
  }

  return {
    store: normalized,
    etag: snapshot.etag,
  };
}

export async function readStore(): Promise<AppStore> {
  const snapshot = await getStoreSnapshot();
  return snapshot.store;
}

async function updateStore<T>(
  updater: (store: AppStore) => Promise<T> | T,
): Promise<T> {
  const task = writeQueue.then(async () => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const snapshot = await getStoreSnapshot();

      try {
        const result = await updater(snapshot.store);
        const nextEtag = await writeSnapshot(snapshot.store, snapshot.etag);

        if (nextEtag !== undefined) {
          snapshot.etag = nextEtag;
        }

        return result;
      } catch (error) {
        if (error instanceof Error && error.message === "PreconditionFailed") {
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error("STORE_WRITE_FAILED");
  });

  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );

  return task;
}

function getRoom(store: AppStore, roomId: string | null) {
  if (!roomId) {
    return null;
  }

  return store.rooms.find((room) => room.id === roomId) ?? null;
}

function getVisitor(store: AppStore, visitorId: string | null) {
  if (!visitorId) {
    return null;
  }

  return store.visitors.find((visitor) => visitor.id === visitorId) ?? null;
}

function getRound(store: AppStore, roundId: string | null) {
  if (!roundId) {
    return null;
  }

  return store.rounds.find((round) => round.id === roundId) ?? null;
}

function getLatestRound(store: AppStore, roomId: string) {
  return (
    sortRoundsByNewest(store.rounds.filter((round) => round.roomId === roomId))[0] ??
    null
  );
}

function getOpenRound(store: AppStore, roomId: string) {
  return (
    sortRoundsByNewest(
      store.rounds.filter(
        (round) => round.roomId === roomId && round.status === ROUND_STATUS.OPEN,
      ),
    )[0] ?? null
  );
}

function getRoundParticipants(store: AppStore, roundId: string) {
  return [...store.roundParticipants]
    .filter((participant) => participant.roundId === roundId)
    .sort(
      (a, b) =>
        new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    )
    .map((participant) => ({
      joinedAt: participant.joinedAt,
      visitor: getVisitor(store, participant.visitorId),
    }))
    .filter((item) => item.visitor);
}

function createScanEvent(
  store: AppStore,
  input: Omit<ScanEvent, "id" | "scannedAt" | "roomNameSnapshot"> & {
    scannedAt?: string;
    roomNameSnapshot?: string | null;
  },
) {
  const roomNameSnapshot =
    input.roomNameSnapshot ?? getRoomNameSnapshot(store, input.roomId, input.roundId);

  return {
    id: createId("event"),
    scannedAt: input.scannedAt ?? nowIso(),
    roomNameSnapshot,
    ...input,
  };
}

function getRoomNameSnapshot(
  store: AppStore,
  roomId: string | null,
  roundId: string | null,
) {
  const round = getRound(store, roundId);
  if (round?.roomNameSnapshot) {
    return round.roomNameSnapshot;
  }

  return getRoom(store, roomId)?.name ?? null;
}

function parseRoomToken(token: string): string[] {
  const trimmed = token.trim();
  if (!trimmed) {
    return [];
  }

  const rangeMatch = trimmed.match(/^([A-Za-z]*)(\d+)\s*-\s*([A-Za-z]*)(\d+)$/);
  if (!rangeMatch) {
    return [trimmed];
  }

  const [, startPrefix, startRaw, endPrefixRaw, endRaw] = rangeMatch;
  const endPrefix = endPrefixRaw || startPrefix;
  const start = Number(startRaw);
  const end = Number(endRaw);

  if (startPrefix !== endPrefix || start > end) {
    return [trimmed];
  }

  const width = Math.max(startRaw.length, endRaw.length);
  const results: string[] = [];
  for (let current = start; current <= end; current += 1) {
    const value = width > 1 ? String(current).padStart(width, "0") : String(current);
    results.push(`${startPrefix}${value}`);
  }

  return results;
}

function parseRoomNames(rawNames: string) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const chunk of rawNames.split(/[\n,，;；]+/)) {
    for (const name of parseRoomToken(chunk)) {
      const normalized = normalizeText(name);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      names.push(normalized);
    }
  }

  return names;
}

function serializeRoundForStaff(store: AppStore, round: Round) {
  return {
    id: round.id,
    passcode: round.passcode,
    occupiedCount: round.occupiedCount,
    capacity: round.capacity,
    remainingCount: Math.max(round.capacity - round.occupiedCount, 0),
    startedAt: round.startedAt,
    expiresAt: round.expiresAt,
    participants: getRoundParticipants(store, round.id).map((participant) => ({
      joinedAt: participant.joinedAt,
      visitorDisplayName: participant.visitor!.displayName,
      visitorPhoneLast4: participant.visitor!.phoneLast4,
    })),
  };
}

export async function ensureDefaultCampaign() {
  const store = await readStore();
  return store.campaign;
}

export async function updateCampaign(input: {
  name: string;
  targetUrl: string;
  status: Campaign["status"];
}) {
  const normalizedName = normalizeText(input.name);
  const normalizedTargetUrl = normalizeText(input.targetUrl);

  if (!normalizedName || !normalizedTargetUrl) {
    throw new Error("INVALID_CAMPAIGN");
  }

  return updateStore((store) => {
    const timestamp = nowIso();
    store.campaign = {
      ...store.campaign,
      name: normalizedName,
      targetUrl: normalizedTargetUrl,
      status: input.status,
      updatedAt: timestamp,
    };

    return store.campaign;
  });
}

export async function findAdminUserByUsername(username: string) {
  const normalizedUsername = normalizeText(username);
  if (!normalizedUsername) {
    return null;
  }

  const store = await readStore();
  return store.adminUsers.find((user) => user.username === normalizedUsername) ?? null;
}

export async function findAdminUserById(id: string) {
  const store = await readStore();
  return store.adminUsers.find((user) => user.id === id) ?? null;
}

export async function hasAnyAdminUsers() {
  const store = await readStore();
  return store.adminUsers.some((user) => user.role === USER_ROLE.ADMIN);
}

export async function getPublicRooms() {
  const store = await readStore();

  return sortRooms(store.rooms)
    .filter((room) => room.active)
    .map((room) => {
      const openRound = getOpenRound(store, room.id);

      return {
        id: room.id,
        name: room.name,
        openRound: openRound
          ? {
              occupiedCount: openRound.occupiedCount,
              capacity: openRound.capacity,
              remainingCount: Math.max(openRound.capacity - openRound.occupiedCount, 0),
              startedAt: openRound.startedAt,
              expiresAt: openRound.expiresAt,
            }
          : null,
      };
    });
}

export async function getRoomsForStaff() {
  const store = await readStore();

  return sortRooms(store.rooms).map((room) => {
    const openRound = getOpenRound(store, room.id);

    return {
      id: room.id,
      name: room.name,
      active: room.active,
      sortOrder: room.sortOrder,
      openRound: openRound ? serializeRoundForStaff(store, openRound) : null,
    };
  });
}

export async function createRoom(name: string) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    throw new Error("INVALID_ROOM_NAME");
  }

  return updateStore((store) => {
    if (store.rooms.some((room) => room.name === normalizedName)) {
      throw new Error("ROOM_EXISTS");
    }

    const timestamp = nowIso();
    const room: Room = {
      id: createId("room"),
      name: normalizedName,
      active: true,
      sortOrder: getMaxSortOrder(store.rooms) + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.rooms.push(room);
    return room;
  });
}

export async function createRoomsBulk(rawNames: string) {
  const names = parseRoomNames(rawNames);
  if (names.length === 0) {
    throw new Error("INVALID_ROOM_BULK");
  }

  const createdNames: string[] = [];
  const skippedNames: string[] = [];

  await updateStore((store) => {
    const existingNames = new Set(store.rooms.map((room) => room.name));
    let nextSortOrder = getMaxSortOrder(store.rooms) + 1;
    const timestamp = nowIso();

    for (const name of names) {
      if (existingNames.has(name)) {
        skippedNames.push(name);
        continue;
      }

      existingNames.add(name);
      createdNames.push(name);
      store.rooms.push({
        id: createId("room"),
        name,
        active: true,
        sortOrder: nextSortOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      nextSortOrder += 1;
    }
  });

  return {
    created: createdNames,
    skipped: skippedNames,
  };
}

export async function reorderRooms(orderedIds: string[]) {
  return updateStore((store) => {
    const currentIds = sortRooms(store.rooms).map((room) => room.id);
    if (
      orderedIds.length !== currentIds.length ||
      orderedIds.some((id) => !currentIds.includes(id))
    ) {
      throw new Error("INVALID_ROOM_ORDER");
    }

    const roomById = new Map(store.rooms.map((room) => [room.id, room]));
    const timestamp = nowIso();

    store.rooms = orderedIds.map((id, index) => {
      const room = roomById.get(id);
      if (!room) {
        throw new Error("ROOM_NOT_FOUND");
      }

      return {
        ...room,
        sortOrder: index,
        updatedAt: timestamp,
      };
    });
    return sortRooms(store.rooms).map((room) => ({
      id: room.id,
      name: room.name,
      active: room.active,
      sortOrder: room.sortOrder,
    }));
  });
}

export async function deleteRoom(roomId: string) {
  return updateStore((store) => {
    const room = getRoom(store, roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }

    const timestamp = nowIso();
    const openRound = getOpenRound(store, roomId);
    if (openRound) {
      closeRoundRecord(openRound, ROUND_CLOSE_REASON.ROOM_DELETED, {
        endedAt: timestamp,
        updatedAt: timestamp,
      });
    }

    store.rooms = sortRooms(store.rooms)
      .filter((item) => item.id !== roomId)
      .map((item, index) => ({
        ...item,
        sortOrder: index,
        updatedAt: item.updatedAt,
      }));
  });
}

export async function setRoomActive(roomId: string, active: boolean) {
  return updateStore((store) => {
    const room = getRoom(store, roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }

    const timestamp = nowIso();
    room.active = active;
    room.updatedAt = timestamp;

    if (!active) {
      const openRound = getOpenRound(store, roomId);
      if (openRound) {
        closeRoundRecord(openRound, ROUND_CLOSE_REASON.ROOM_DISABLED, {
          endedAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
  });
}

export async function openRound(input: {
  roomId: string;
  passcode: string;
  capacity: number;
  durationMinutes?: number | null;
  expiresAt?: string | null;
}) {
  const normalizedPasscode = normalizeText(input.passcode);
  if (!normalizedPasscode || input.capacity < 1 || input.capacity > 99) {
    throw new Error("INVALID_ROUND_INPUT");
  }

  return updateStore((store) => {
    const room = getRoom(store, input.roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }

    if (!room.active) {
      throw new Error("ROOM_DISABLED");
    }

    if (getOpenRound(store, input.roomId)) {
      throw new Error("ROUND_EXISTS");
    }

    const timestamp = nowIso();
    let expiresAt: string | null = null;

    if (typeof input.durationMinutes === "number" && input.durationMinutes > 0) {
      expiresAt = new Date(
        new Date(timestamp).getTime() + input.durationMinutes * 60 * 1000,
      ).toISOString();
    } else if (input.expiresAt) {
      const parsed = parseDateOrNull(input.expiresAt);
      if (!parsed) {
        throw new Error("INVALID_ROUND_INPUT");
      }
      expiresAt = parsed.toISOString();
    }

    const round: Round = {
      id: createId("round"),
      roomId: room.id,
      roomNameSnapshot: room.name,
      passcode: normalizedPasscode,
      capacity: input.capacity,
      occupiedCount: 0,
      expiresAt,
      status: ROUND_STATUS.OPEN,
      closeReason: null,
      startedAt: timestamp,
      endedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.rounds.push(round);
    return round;
  });
}

export async function closeRound(roundId: string) {
  return updateStore((store) => {
    const round = getRound(store, roundId);
    if (!round) {
      throw new Error("ROUND_NOT_FOUND");
    }

    if (round.status === ROUND_STATUS.CLOSED) {
      return;
    }

    const timestamp = nowIso();
    closeRoundRecord(round, ROUND_CLOSE_REASON.MANUAL, {
      endedAt: timestamp,
      updatedAt: timestamp,
    });

    return round;
  });
}

export async function getRoomLive(roomId: string) {
  const store = await readStore();
  const room = getRoom(store, roomId);
  if (!room) {
    return null;
  }

  const deniedEvents = sortByNewest(
    store.scanEvents.filter(
      (event) => event.roomId === roomId && event.result !== SCAN_RESULT.ALLOW,
    ),
  )
    .slice(0, 20)
    .map((event) => {
      const visitor = getVisitor(store, event.visitorId);

      return {
        id: event.id,
        scannedAt: event.scannedAt,
        result: event.result,
        reason: event.reason,
        visitorDisplayName: visitor?.displayName ?? null,
        visitorPhoneLast4: visitor?.phoneLast4 ?? null,
      };
    });

  return {
    room: {
      id: room.id,
      name: room.name,
      active: room.active,
      sortOrder: room.sortOrder,
      openRound: getOpenRound(store, room.id)
        ? serializeRoundForStaff(store, getOpenRound(store, room.id)!)
        : null,
    },
    deniedEvents,
  };
}

export async function getDashboardData() {
  const store = await readStore();
  return {
    campaign: store.campaign,
    rooms: sortRooms(store.rooms).map((room) => {
      const openRound = getOpenRound(store, room.id);

      return {
        id: room.id,
        name: room.name,
        active: room.active,
        sortOrder: room.sortOrder,
        openRound: openRound ? serializeRoundForStaff(store, openRound) : null,
      };
    }),
    recentEvents: sortByNewest(store.scanEvents)
      .slice(0, 120)
      .map((event) => {
        const visitor = getVisitor(store, event.visitorId);

        return {
          id: event.id,
          scannedAt: event.scannedAt,
          result: event.result,
          reason: event.reason,
          roomId: event.roomId,
          roomName: event.roomNameSnapshot ?? getRoomNameSnapshot(store, event.roomId, event.roundId),
          visitorDisplayName: visitor?.displayName ?? null,
          visitorPhoneLast4: visitor?.phoneLast4 ?? null,
        };
      }),
  };
}

export async function getFilteredScanEvents(input: {
  roomId?: string | null;
  result?: string | null;
  limit?: number;
}) {
  const store = await readStore();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 300));

  return sortByNewest(
    store.scanEvents.filter((event) => {
      if (input.roomId && event.roomId !== input.roomId) {
        return false;
      }

      if (input.result && event.result !== input.result) {
        return false;
      }

      return true;
    }),
  )
    .slice(0, limit)
    .map((event) => {
      const visitor = getVisitor(store, event.visitorId);

      return {
        id: event.id,
        scannedAt: event.scannedAt,
        result: event.result,
        reason: event.reason,
        roomId: event.roomId,
        roomName: event.roomNameSnapshot ?? getRoomNameSnapshot(store, event.roomId, event.roundId),
        visitorDisplayName: visitor?.displayName ?? null,
        visitorPhoneLast4: visitor?.phoneLast4 ?? null,
      };
    });
}

export async function submitEntry(input: {
  roomId: string;
  displayName: string;
  phoneLast4: string;
  passcode: string;
  fingerprint: string;
  ipHash: string | null;
  ua: string | null;
}) {
  try {
    const store = await readStore();
    const room = getRoom(store, input.roomId);

    if (!room) {
      return {
        ok: false,
        status: 404,
        code: SCAN_RESULT.DENY_NO_ROUND,
        message: "房间不存在",
      };
    }

    if (!room.active) {
      return {
        ok: false,
        status: 403,
        code: SCAN_RESULT.DENY_ROOM_DISABLED,
        message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_ROOM_DISABLED],
      };
    }

    if (store.campaign.status !== CAMPAIGN_STATUS.RUNNING) {
      return {
        ok: false,
        status: 403,
        code: SCAN_RESULT.DENY_CAMPAIGN_PAUSED,
        message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_CAMPAIGN_PAUSED],
      };
    }

    const openRound = getOpenRound(store, room.id);
    if (!openRound) {
      const latestRound = getLatestRound(store, room.id);
      const code =
        latestRound?.closeReason === ROUND_CLOSE_REASON.EXPIRED
          ? SCAN_RESULT.DENY_ROUND_EXPIRED
          : SCAN_RESULT.DENY_NO_ROUND;

      await updateStore((draft) => {
        draft.scanEvents.push(
          createScanEvent(draft, {
            campaignId: draft.campaign.id,
            roomId: room.id,
            roundId: latestRound?.id ?? null,
            visitorId: null,
            result: code,
            reason: SCAN_RESULT_MESSAGE[code],
            ipHash: input.ipHash,
            ua: input.ua,
          }),
        );
      });

      return {
        ok: false,
        status: 409,
        code,
        message: SCAN_RESULT_MESSAGE[code],
      };
    }

    if (openRound.passcode !== input.passcode.trim()) {
      await updateStore((draft) => {
        draft.scanEvents.push(
          createScanEvent(draft, {
            campaignId: draft.campaign.id,
            roomId: room.id,
            roundId: openRound.id,
            visitorId: null,
            result: SCAN_RESULT.DENY_PASSCODE,
            reason: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_PASSCODE],
            ipHash: input.ipHash,
            ua: input.ua,
          }),
        );
      });

      return {
        ok: false,
        status: 400,
        code: SCAN_RESULT.DENY_PASSCODE,
        message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_PASSCODE],
      };
    }

    const existingVisitor = store.visitors.find(
      (visitor) => visitor.fingerprint === input.fingerprint,
    );
    const participant = existingVisitor
      ? store.roundParticipants.find(
          (item) => item.roundId === openRound.id && item.visitorId === existingVisitor.id,
        )
      : null;

    if (participant) {
      await updateStore((draft) => {
        draft.scanEvents.push(
          createScanEvent(draft, {
            campaignId: draft.campaign.id,
            roomId: room.id,
            roundId: openRound.id,
            visitorId: existingVisitor?.id ?? null,
            result: SCAN_RESULT.DENY_DUP_IN_ROUND,
            reason: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_DUP_IN_ROUND],
            ipHash: input.ipHash,
            ua: input.ua,
          }),
        );
      });

      return {
        ok: false,
        status: 409,
        code: SCAN_RESULT.DENY_DUP_IN_ROUND,
        message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_DUP_IN_ROUND],
      };
    }

    if (openRound.occupiedCount >= openRound.capacity) {
      await updateStore((draft) => {
        draft.scanEvents.push(
          createScanEvent(draft, {
            campaignId: draft.campaign.id,
            roomId: room.id,
            roundId: openRound.id,
            visitorId: existingVisitor?.id ?? null,
            result: SCAN_RESULT.DENY_ROUND_FULL,
            reason: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_ROUND_FULL],
            ipHash: input.ipHash,
            ua: input.ua,
          }),
        );
      });

      return {
        ok: false,
        status: 409,
        code: SCAN_RESULT.DENY_ROUND_FULL,
        message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_ROUND_FULL],
      };
    }

    const timestamp = nowIso();
    let redirectUrl = "";

    await updateStore((draft) => {
      const activeRound = getOpenRound(draft, room.id);
      if (!activeRound) {
        throw new Error("ROUND_CLOSED");
      }

      if (activeRound.passcode !== input.passcode.trim()) {
        throw new Error("PASSCODE_CHANGED");
      }

      const alreadyJoinedVisitor = draft.visitors.find(
        (visitor) => visitor.fingerprint === input.fingerprint,
      );

      if (
        alreadyJoinedVisitor &&
        draft.roundParticipants.some(
          (item) => item.roundId === activeRound.id && item.visitorId === alreadyJoinedVisitor.id,
        )
      ) {
        throw new Error("DUP_IN_ROUND");
      }

      if (activeRound.occupiedCount >= activeRound.capacity) {
        throw new Error("ROUND_FULL");
      }

      const visitor =
        alreadyJoinedVisitor ??
        (() => {
          const nextVisitor: Visitor = {
            id: createId("visitor"),
            displayName: input.displayName,
            phoneLast4: input.phoneLast4,
            fingerprint: input.fingerprint,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          draft.visitors.push(nextVisitor);
          return nextVisitor;
        })();

      draft.roundParticipants.push({
        id: createId("participant"),
        roundId: activeRound.id,
        visitorId: visitor.id,
        joinedAt: timestamp,
      });

      activeRound.occupiedCount += 1;
      activeRound.updatedAt = timestamp;
      redirectUrl = draft.campaign.targetUrl;

      draft.scanEvents.push(
        createScanEvent(draft, {
          campaignId: draft.campaign.id,
          roomId: room.id,
          roundId: activeRound.id,
          visitorId: visitor.id,
          result: SCAN_RESULT.ALLOW,
          reason: "允许进入目标链接",
          ipHash: input.ipHash,
          ua: input.ua,
        }),
      );
    });

    return {
      ok: true,
      status: 200,
      code: SCAN_RESULT.ALLOW,
      message: "验证成功，正在跳转目标页面",
      redirectUrl,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ROUND_CLOSED") {
        return {
          ok: false,
          status: 409,
          code: SCAN_RESULT.DENY_ROUND_CLOSED,
          message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_ROUND_CLOSED],
        };
      }

      if (error.message === "PASSCODE_CHANGED") {
        return {
          ok: false,
          status: 400,
          code: SCAN_RESULT.DENY_PASSCODE,
          message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_PASSCODE],
        };
      }

      if (error.message === "DUP_IN_ROUND") {
        return {
          ok: false,
          status: 409,
          code: SCAN_RESULT.DENY_DUP_IN_ROUND,
          message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_DUP_IN_ROUND],
        };
      }

      if (error.message === "ROUND_FULL") {
        return {
          ok: false,
          status: 409,
          code: SCAN_RESULT.DENY_ROUND_FULL,
          message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_ROUND_FULL],
        };
      }
    }

    return {
      ok: false,
      status: 500,
      code: SCAN_RESULT.DENY_INTERNAL,
      message: SCAN_RESULT_MESSAGE[SCAN_RESULT.DENY_INTERNAL],
    };
  }
}
