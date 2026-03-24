"use client";

import { FormEvent, useMemo, useState } from "react";

type RoomOption = {
  id: string;
  name: string;
  openRound: {
    occupiedCount: number;
    capacity: number;
    remainingCount: number;
    startedAt: string;
    expiresAt: string | null;
  } | null;
};

type EntryFormProps = {
  rooms: RoomOption[];
  campaignName: string;
};

type SubmitState = {
  type: "idle" | "error" | "success";
  message: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function EntryForm({ rooms, campaignName }: EntryFormProps) {
  const [roomId, setRoomId] = useState<string>(rooms[0]?.id ?? "");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    type: "idle",
    message: "",
  });

  const selectedRoom = useMemo(
    () => rooms.find((item) => item.id === roomId) ?? null,
    [roomId, rooms],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!roomId) {
      setSubmitState({ type: "error", message: "请先选择房间" });
      return;
    }

    setLoading(true);
    setSubmitState({ type: "idle", message: "" });

    try {
      const response = await fetch("/api/public/entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
          passcode,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setSubmitState({
          type: "error",
          message: data.message ?? "校验失败，请联系现场员工",
        });
        return;
      }

      setSubmitState({
        type: "success",
        message: "验证成功，正在跳转表单页...",
      });

      if (typeof data.redirectUrl === "string") {
        window.location.href = data.redirectUrl;
      }
    } catch {
      setSubmitState({
        type: "error",
        message: "网络异常，请稍后再试",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass-card gold-ring rounded-[30px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(255,246,228,0.86))] p-6 md:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-[#9a7a3b]">
            Fixed QR Entry
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {campaignName}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            请选择房间并输入本局口令。验证通过后会自动跳转到活动表单页。
          </p>
        </div>

        <div className="rounded-2xl border border-[#ead7b0] bg-[#201a13] px-4 py-3 text-right text-[#f5e5bf] shadow-[0_18px_40px_rgba(69,48,17,0.16)]">
          <p className="text-xs uppercase tracking-[0.18em] text-[#d1b16a]">Room Status</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {selectedRoom?.name ?? "未选择房间"}
          </p>
          <p className="mt-1 text-sm text-[#d8d0c2]">
            {selectedRoom?.openRound
              ? `余位 ${selectedRoom.openRound.remainingCount} / ${selectedRoom.openRound.capacity}`
              : "当前未开局"}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-foreground">房间</span>
          <select
            className="box-border w-full rounded-2xl border border-border bg-white/90 px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            required
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.openRound
                  ? `（已开局 ${room.openRound.occupiedCount}/${room.openRound.capacity}）`
                  : "（未开局）"}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-foreground">本局口令</span>
          <input
            className="box-border w-full rounded-2xl border border-border bg-white/90 px-4 py-3 font-mono tracking-[0.35em] outline-none ring-[#af8740]/20 transition focus:ring-4"
            value={passcode}
            onChange={(event) =>
              setPasscode(event.target.value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder="员工告知的数字口令"
            required
          />
        </label>
      </div>

      {selectedRoom ? (
        <div className="mt-5 rounded-2xl border border-[#ead9b8] bg-white/78 p-4 text-sm leading-7 text-muted">
          {selectedRoom.openRound ? (
            <>
              <p>
                当前已登记 {selectedRoom.openRound.occupiedCount} 人，共 {selectedRoom.openRound.capacity} 人。
              </p>
              <p>
                剩余名额 {selectedRoom.openRound.remainingCount} 个，开局时间 {formatDateTime(selectedRoom.openRound.startedAt)}。
              </p>
              <p>
                {selectedRoom.openRound.expiresAt
                  ? `本局将于 ${formatDateTime(selectedRoom.openRound.expiresAt)} 自动失效。`
                  : "本局暂未设置自动失效时间。"}
              </p>
            </>
          ) : (
            <p>该房间当前没有进行中的牌局，请联系员工先开局并领取口令。</p>
          )}
        </div>
      ) : null}

      {submitState.type !== "idle" ? (
        <p
          className={`mt-5 text-sm ${
            submitState.type === "error" ? "text-danger" : "text-success"
          }`}
        >
          {submitState.message}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-7 w-full rounded-2xl bg-[linear-gradient(135deg,#d9bc7d,#af8740)] px-4 py-3 text-sm font-semibold text-[#332204] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={loading}
      >
        {loading ? "校验中..." : "继续前往表单页"}
      </button>
    </form>
  );
}
