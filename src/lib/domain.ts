export const USER_ROLE = {
  ADMIN: "ADMIN",
  STAFF: "STAFF",
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const CAMPAIGN_STATUS = {
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
} as const;

export type CampaignStatus =
  (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

export const ROUND_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;

export type RoundStatus = (typeof ROUND_STATUS)[keyof typeof ROUND_STATUS];

export const ROUND_CLOSE_REASON = {
  MANUAL: "MANUAL",
  EXPIRED: "EXPIRED",
  ROOM_DISABLED: "ROOM_DISABLED",
  ROOM_DELETED: "ROOM_DELETED",
} as const;

export type RoundCloseReason =
  (typeof ROUND_CLOSE_REASON)[keyof typeof ROUND_CLOSE_REASON];

export const SCAN_RESULT = {
  ALLOW: "ALLOW",
  DENY_CAMPAIGN_PAUSED: "DENY_CAMPAIGN_PAUSED",
  DENY_INVALID_INPUT: "DENY_INVALID_INPUT",
  DENY_ROOM_DISABLED: "DENY_ROOM_DISABLED",
  DENY_NO_ROUND: "DENY_NO_ROUND",
  DENY_PASSCODE: "DENY_PASSCODE",
  DENY_ROUND_FULL: "DENY_ROUND_FULL",
  DENY_DUP_IN_ROUND: "DENY_DUP_IN_ROUND",
  DENY_ROUND_CLOSED: "DENY_ROUND_CLOSED",
  DENY_ROUND_EXPIRED: "DENY_ROUND_EXPIRED",
  DENY_INTERNAL: "DENY_INTERNAL",
} as const;

export type ScanResult = (typeof SCAN_RESULT)[keyof typeof SCAN_RESULT];

export type AdminUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Campaign = {
  id: string;
  slug: string;
  name: string;
  targetUrl: string;
  status: CampaignStatus;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type Room = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Round = {
  id: string;
  roomId: string;
  roomNameSnapshot: string;
  passcode: string;
  capacity: number;
  occupiedCount: number;
  expiresAt: string | null;
  status: RoundStatus;
  closeReason: RoundCloseReason | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Visitor = {
  id: string;
  displayName: string;
  phoneLast4: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type RoundParticipant = {
  id: string;
  roundId: string;
  visitorId: string;
  joinedAt: string;
};

export type ScanEvent = {
  id: string;
  campaignId: string | null;
  roomId: string | null;
  roomNameSnapshot: string | null;
  roundId: string | null;
  visitorId: string | null;
  scannedAt: string;
  result: ScanResult;
  reason: string | null;
  ipHash: string | null;
  ua: string | null;
};

export type AppStore = {
  version: number;
  campaign: Campaign;
  adminUsers: AdminUser[];
  rooms: Room[];
  rounds: Round[];
  visitors: Visitor[];
  roundParticipants: RoundParticipant[];
  scanEvents: ScanEvent[];
};
