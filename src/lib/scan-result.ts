import { SCAN_RESULT, ScanResult } from "@/lib/domain";

export const SCAN_RESULT_MESSAGE: Record<ScanResult, string> = {
  [SCAN_RESULT.ALLOW]: "允许进入目标链接",
  [SCAN_RESULT.DENY_CAMPAIGN_PAUSED]: "活动已暂停",
  [SCAN_RESULT.DENY_INVALID_INPUT]: "提交信息格式错误",
  [SCAN_RESULT.DENY_ROOM_DISABLED]: "房间不可用",
  [SCAN_RESULT.DENY_NO_ROUND]: "该房间当前没有进行中的牌局",
  [SCAN_RESULT.DENY_PASSCODE]: "口令错误",
  [SCAN_RESULT.DENY_ROUND_FULL]: "本局人数已满",
  [SCAN_RESULT.DENY_DUP_IN_ROUND]: "你已在本局登记",
  [SCAN_RESULT.DENY_ROUND_CLOSED]: "本局已结束",
  [SCAN_RESULT.DENY_ROUND_EXPIRED]: "本局已过期",
  [SCAN_RESULT.DENY_INTERNAL]: "系统繁忙，请稍后再试",
};
