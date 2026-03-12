"use client";

import Link from "next/link";
import { DragEvent, useCallback, useEffect, useMemo, useState } from "react";

type DashboardUser = {
  id: string;
  username: string;
  role: "ADMIN" | "STAFF";
};

type CampaignData = {
  id: string;
  name: string;
  targetUrl: string;
  status: "RUNNING" | "PAUSED";
};

type RoomData = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  openRound: {
    id: string;
    passcode: string;
    occupiedCount: number;
    capacity: number;
    remainingCount: number;
    startedAt: string;
    expiresAt: string | null;
    participants: Array<{
      joinedAt: string;
      visitorDisplayName: string;
      visitorPhoneLast4: string;
    }>;
  } | null;
};

type ScanEventData = {
  id: string;
  scannedAt: string;
  result: string;
  reason: string | null;
  roomName: string | null;
  visitorDisplayName: string | null;
  visitorPhoneLast4: string | null;
};

type DashboardResponse = {
  ok: boolean;
  user: DashboardUser;
  campaign: CampaignData;
  rooms: RoomData[];
  recentEvents: ScanEventData[];
};

type RoundFormState = {
  capacity: string;
  expiryMode: "none" | "duration" | "datetime";
  durationMinutes: string;
  expiresAt: string;
};

const RESULT_META: Record<string, { label: string; className: string }> = {
  ALLOW: { label: "通过", className: "border-[#cde8d6] bg-[#eef9f1] text-[#22643a]" },
  DENY_PASSCODE: { label: "口令错误", className: "border-[#f2d1cb] bg-[#fff4f2] text-[#a63d30]" },
  DENY_ROUND_FULL: { label: "人数已满", className: "border-[#ecd8b1] bg-[#fff7e8] text-[#8d6722]" },
  DENY_DUP_IN_ROUND: { label: "重复登记", className: "border-[#eadcc5] bg-[#f8f1e3] text-[#765629]" },
  DENY_NO_ROUND: { label: "未开局", className: "border-[#ecd8b1] bg-[#fff7e8] text-[#8d6722]" },
  DENY_ROUND_CLOSED: { label: "已结束", className: "border-[#ecd8b1] bg-[#fff7e8] text-[#8d6722]" },
  DENY_ROUND_EXPIRED: { label: "已过期", className: "border-[#ecd8b1] bg-[#fff7e8] text-[#8d6722]" },
  DENY_ROOM_DISABLED: { label: "房间停用", className: "border-[#eadcc5] bg-[#f8f1e3] text-[#765629]" },
  DENY_CAMPAIGN_PAUSED: { label: "活动暂停", className: "border-[#eadcc5] bg-[#f8f1e3] text-[#765629]" },
  DENY_INVALID_INPUT: { label: "信息错误", className: "border-[#eadcc5] bg-[#f8f1e3] text-[#765629]" },
  DENY_INTERNAL: { label: "系统错误", className: "border-[#f2d1cb] bg-[#fff4f2] text-[#a63d30]" },
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatShortDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getDefaultRoundForm(): RoundFormState {
  return { capacity: "4", expiryMode: "none", durationMinutes: "120", expiresAt: "" };
}

function reorderList<T extends { id: string }>(items: T[], fromId: string, toId: string) {
  const currentIndex = items.findIndex((item) => item.id === fromId);
  const targetIndex = items.findIndex((item) => item.id === toId);
  if (currentIndex === -1 || targetIndex === -1 || currentIndex === targetIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function SummaryCard(props: { title: string; value: string; detail: string }) {
  return (
    <article className="glass-card gold-ring rounded-[24px] border border-white/60 bg-white/78 p-5">
      <p className="text-sm text-muted">{props.title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{props.value}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{props.detail}</p>
    </article>
  );
}

export function StaffDashboard() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [campaignStatus, setCampaignStatus] = useState<"RUNNING" | "PAUSED">("RUNNING");
  const [campaignInitialized, setCampaignInitialized] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [bulkRoomNames, setBulkRoomNames] = useState("");
  const [roundForms, setRoundForms] = useState<Record<string, RoundFormState>>({});
  const [dragRoomId, setDragRoomId] = useState<string | null>(null);

  const canManageCampaign = dashboard?.user.role === "ADMIN";
  const canManageRooms = dashboard?.user.role === "ADMIN";

  const summary = useMemo(() => {
    const rooms = dashboard?.rooms ?? [];
    const openRooms = rooms.filter((room) => room.openRound).length;
    const activeRooms = rooms.filter((room) => room.active).length;
    const totalSeats = rooms.reduce((sum, room) => sum + (room.openRound?.occupiedCount ?? 0), 0);
    const deniedCount = (dashboard?.recentEvents ?? []).filter((event) => event.result !== "ALLOW").length;
    return { openRooms, activeRooms, totalSeats, deniedCount };
  }, [dashboard]);

  const loadDashboard = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const response = await fetch("/api/staff/dashboard", { method: "GET", cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/staff/login";
        return;
      }

      const data = (await response.json()) as DashboardResponse;
      if (!response.ok || !data.ok) {
        setError("后台数据加载失败");
        return;
      }

      setDashboard(data);
      setRoundForms((current) => {
        const next = { ...current };
        for (const room of data.rooms) {
          next[room.id] = next[room.id] ?? getDefaultRoundForm();
        }
        return next;
      });

      if (!campaignInitialized) {
        setCampaignName(data.campaign.name);
        setTargetUrl(data.campaign.targetUrl);
        setCampaignStatus(data.campaign.status);
        setCampaignInitialized(true);
      }
    } catch {
      setError("网络异常，无法加载后台数据");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [campaignInitialized]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadDashboard(true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  async function handleLogout() {
    await fetch("/api/staff/auth/logout", { method: "POST" });
    window.location.href = "/staff/login";
  }

  function updateRoundForm(roomId: string, patch: Partial<RoundFormState>) {
    setRoundForms((current) => ({
      ...current,
      [roomId]: {
        ...(current[roomId] ?? getDefaultRoundForm()),
        ...patch,
      },
    }));
  }

  async function saveCampaign() {
    if (!canManageCampaign) {
      return;
    }

    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/staff/campaign", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: campaignName, targetUrl, status: campaignStatus }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.message ?? "保存活动配置失败");
        return;
      }

      setNotice("活动配置已保存");
      await loadDashboard(true);
    } catch {
      setError("保存活动配置失败");
    }
  }

  async function createSingleRoom() {
    if (!canManageRooms || !newRoomName.trim()) {
      return;
    }

    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/staff/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoomName.trim() }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.message ?? "创建房间失败");
        return;
      }

      setNewRoomName("");
      setNotice(`已创建房间：${data.room.name}`);
      await loadDashboard(true);
    } catch {
      setError("创建房间失败");
    }
  }

  async function createBulkRooms() {
    if (!canManageRooms || !bulkRoomNames.trim()) {
      return;
    }

    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/staff/rooms/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawNames: bulkRoomNames }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.message ?? "批量创建房间失败");
        return;
      }

      setBulkRoomNames("");
      const createdCount = Array.isArray(data.created) ? data.created.length : 0;
      const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : 0;
      setNotice(`已创建 ${createdCount} 个房间${skippedCount ? `，跳过 ${skippedCount} 个重复名称` : ""}`);
      await loadDashboard(true);
    } catch {
      setError("批量创建房间失败");
    }
  }

  async function toggleRoom(roomId: string, active: boolean) {
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/staff/rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.message ?? "更新房间状态失败");
        return;
      }

      setNotice(active ? "房间已启用" : "房间已停用，进行中的牌局已结束");
      await loadDashboard(true);
    } catch {
      setError("更新房间状态失败");
    }
  }

  async function removeRoom(roomId: string, roomName: string) {
    if (!canManageRooms) {
      return;
    }

    const confirmed = window.confirm(`删除房间“${roomName}”？当前房间会从列表移除，历史记录仍会保留。`);
    if (!confirmed) {
      return;
    }

    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/staff/rooms/${roomId}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.message ?? "删除房间失败");
        return;
      }

      setNotice(`已删除房间：${roomName}`);
      await loadDashboard(true);
    } catch {
      setError("删除房间失败");
    }
  }

  async function openRoundForRoom(room: RoomData) {
    const form = roundForms[room.id] ?? getDefaultRoundForm();
    const capacity = Number(form.capacity);

    if (!capacity || capacity < 1) {
      setError("请输入正确的人数上限");
      return;
    }

    setNotice("");
    setError("");

    const payload: Record<string, unknown> = { roomId: room.id, capacity };
    if (form.expiryMode === "duration") {
      payload.durationMinutes = Number(form.durationMinutes);
    }
    if (form.expiryMode === "datetime") {
      payload.expiresAt = form.expiresAt;
    }

    try {
      const response = await fetch("/api/staff/rounds/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.message ?? "开局失败");
        return;
      }

      setNotice(`房间 ${room.name} 已开局，口令 ${data.round.passcode}`);
      await loadDashboard(true);
    } catch {
      setError("开局失败");
    }
  }

  async function closeCurrentRound(roundId: string, roomName: string) {
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/staff/rounds/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.message ?? "结束本局失败");
        return;
      }

      setNotice(`房间 ${roomName} 已结束本局`);
      await loadDashboard(true);
    } catch {
      setError("结束本局失败");
    }
  }

  async function saveRoomOrder(orderedIds: string[]) {
    const response = await fetch("/api/staff/rooms/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message ?? "更新房间排序失败");
    }
  }

  async function handleRoomDrop(targetRoomId: string) {
    if (!canManageRooms || !dashboard || !dragRoomId || dragRoomId === targetRoomId) {
      setDragRoomId(null);
      return;
    }

    const nextRooms = reorderList(dashboard.rooms, dragRoomId, targetRoomId).map((room, index) => ({ ...room, sortOrder: index }));
    const orderedIds = nextRooms.map((room) => room.id);

    setDashboard({ ...dashboard, rooms: nextRooms });
    setDragRoomId(null);
    setNotice("");
    setError("");

    try {
      await saveRoomOrder(orderedIds);
      setNotice("房间排序已更新");
      await loadDashboard(true);
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : "更新房间排序失败");
      await loadDashboard(true);
    }
  }

  function onDragStart(event: DragEvent<HTMLElement>, roomId: string) {
    if (!canManageRooms) {
      return;
    }

    setDragRoomId(roomId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", roomId);
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!canManageRooms) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  if (loading && !dashboard) {
    return (
      <div className="page-shell">
        <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-5 py-10">
          <div className="glass-card gold-ring rounded-[28px] border border-white/60 bg-white/80 px-6 py-5 text-sm text-muted">
            正在加载后台数据...
          </div>
        </main>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="page-shell">
        <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-5 py-10">
          <div className="glass-card gold-ring rounded-[28px] border border-white/60 bg-white/80 px-6 py-5 text-sm text-danger">
            {error || "后台数据加载失败"}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <main className="mx-auto w-full max-w-7xl px-5 py-8 md:px-6 lg:px-8">
        <section className="glass-card gold-ring overflow-hidden rounded-[34px] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,245,225,0.82))]">
          <div className="grid gap-8 px-6 py-7 md:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-9">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-[#9a7a3b]">Clubhouse Dashboard</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">麻将房运营后台</h1>
              <p className="mt-4 max-w-3xl text-sm leading-8 text-muted md:text-base">
                管理房间、控制开局人数和时效、打印固定二维码，并查看顾客扫码日志。固定二维码不变，后台修改后立即生效。
              </p>
            </div>

            <div className="rounded-[28px] border border-[#c9a45b] bg-[#211a13] p-5 text-white shadow-[0_24px_60px_rgba(45,31,8,0.2)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#cba962]">Current Staff</p>
                  <p className="mt-2 text-2xl font-semibold">{dashboard.user.username}</p>
                  <p className="mt-1 text-sm text-[#d7d0c2]">{dashboard.user.role === "ADMIN" ? "管理员" : "员工"}</p>
                </div>
                <p className="rounded-full border border-white/12 px-3 py-1 text-xs text-[#e4c98c]">{refreshing ? "同步中" : "已同步"}</p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/staff/print" className="rounded-full bg-[linear-gradient(135deg,#d9bc7d,#af8740)] px-4 py-2 text-sm font-semibold text-[#332204] transition hover:brightness-105">
                  打印二维码
                </Link>
                <button type="button" className="rounded-full border border-white/12 px-4 py-2 text-sm text-white transition hover:bg-white/10" onClick={() => void loadDashboard(true)}>
                  手动刷新
                </button>
                <button type="button" className="rounded-full border border-white/12 px-4 py-2 text-sm text-white transition hover:bg-white/10" onClick={handleLogout}>
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="进行中牌局" value={`${summary.openRooms} 局`} detail="正在开放扫码的房间数量" />
          <SummaryCard title="可用房间" value={`${summary.activeRooms} 间`} detail="当前启用状态的房间" />
          <SummaryCard title="已登记人数" value={`${summary.totalSeats} 人`} detail="所有进行中牌局已占用席位" />
          <SummaryCard title="最近拒绝" value={`${summary.deniedCount} 条`} detail="最近 120 条日志中的拒绝记录" />
        </section>

        {error ? <div className="mt-5 rounded-2xl border border-[#f2d1cb] bg-[#fff4f2] px-4 py-3 text-sm text-danger">{error}</div> : null}
        {notice ? <div className="mt-5 rounded-2xl border border-[#e5d1a7] bg-[#fff8eb] px-4 py-3 text-sm text-[#7b5c25]">{notice}</div> : null}

        <div className="dashboard-grid mt-6">
          <aside className="space-y-5">
            <section className="glass-card gold-ring rounded-[28px] border border-white/60 bg-white/80 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">活动配置</p>
                  <p className="mt-2 text-sm leading-7 text-muted">固定二维码的最终跳转目标。顾客扫码通过后，会去这个外部表单或问卷地址。</p>
                </div>
                <span className="rounded-full border border-[#ead7b0] bg-[#fff7e9] px-3 py-1 text-xs text-[#8d6722]">{canManageCampaign ? "管理员可编辑" : "员工只读"}</span>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">活动名称</span>
                  <input className="box-border w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} disabled={!canManageCampaign} />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">目标链接</span>
                  <textarea className="box-border min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} disabled={!canManageCampaign} />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">活动状态</span>
                  <select className="box-border w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={campaignStatus} onChange={(event) => setCampaignStatus(event.target.value as "RUNNING" | "PAUSED")} disabled={!canManageCampaign}>
                    <option value="RUNNING">运行中</option>
                    <option value="PAUSED">已暂停</option>
                  </select>
                </label>
              </div>

              {canManageCampaign ? (
                <button type="button" className="mt-5 w-full rounded-2xl bg-[linear-gradient(135deg,#d9bc7d,#af8740)] px-4 py-3 text-sm font-semibold text-[#332204] transition hover:brightness-105" onClick={() => void saveCampaign()}>
                  保存活动配置
                </button>
              ) : null}
            </section>

            <section className="glass-card gold-ring rounded-[28px] border border-white/60 bg-white/80 p-5">
              <p className="text-sm font-semibold text-foreground">房间管理</p>
              <p className="mt-2 text-sm leading-7 text-muted">适合 40 间左右的房间规模。支持单个新增、批量导入、拖动排序、停用和删除。</p>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">单个新增房间</span>
                  <div className="flex gap-2">
                    <input className="box-border min-w-0 flex-1 rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} placeholder="例如：V8 或 12 房" disabled={!canManageRooms} />
                    <button type="button" className="rounded-2xl border border-[#cda963] bg-[#fff6e7] px-4 py-3 text-sm font-semibold text-[#7b5c25] transition hover:bg-[#fff0d7] disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void createSingleRoom()} disabled={!canManageRooms}>
                      创建
                    </button>
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">批量导入房间</span>
                  <textarea className="box-border min-h-36 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={bulkRoomNames} onChange={(event) => setBulkRoomNames(event.target.value)} placeholder={`支持逗号或换行分隔，例如：\n1-15\nV1-V5\nT1-T11`} disabled={!canManageRooms} />
                </label>

                <button type="button" className="rounded-2xl border border-[#cda963] bg-[#fff6e7] px-4 py-3 text-sm font-semibold text-[#7b5c25] transition hover:bg-[#fff0d7] disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void createBulkRooms()} disabled={!canManageRooms}>
                  批量创建房间
                </button>
              </div>
            </section>
          </aside>

          <section className="space-y-5">
            <section className="glass-card gold-ring rounded-[28px] border border-white/60 bg-white/80 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">房间与牌局</p>
                  <p className="mt-2 text-sm leading-7 text-muted">拖动房间卡片可排序。开局时可设置人数上限和自动失效时间，进行中房间可以直接结束本局。</p>
                </div>
                <span className="rounded-full border border-[#ead7b0] bg-[#fff7e9] px-3 py-1 text-xs text-[#8d6722]">共 {dashboard.rooms.length} 间</span>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {dashboard.rooms.map((room) => {
                  const form = roundForms[room.id] ?? getDefaultRoundForm();
                  const progressPercent = room.openRound ? Math.min((room.openRound.occupiedCount / room.openRound.capacity) * 100, 100) : 0;

                  return (
                    <article key={room.id} draggable={canManageRooms} onDragStart={(event) => onDragStart(event, room.id)} onDragOver={onDragOver} onDrop={() => void handleRoomDrop(room.id)} className={`rounded-[26px] border p-5 transition ${dragRoomId === room.id ? "border-[#caa35a] bg-[#fff9ee]" : "border-[#ead9b8] bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(255,248,235,0.86))]"}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[#221b13] px-3 py-1 font-mono text-xs text-[#f4e5c1]">#{room.sortOrder + 1}</span>
                            <span className="rounded-full border border-[#ead7b0] bg-[#fff7e9] px-3 py-1 text-xs text-[#8d6722]">{room.active ? "已启用" : "已停用"}</span>
                            <span className={`rounded-full px-3 py-1 text-xs ${room.openRound ? "border border-[#d2c1a2] bg-[#f6efe1] text-[#765629]" : "border border-[#dbe6d7] bg-[#f2f8f0] text-[#2f7d47]"}`}>{room.openRound ? "进行中" : "待开局"}</span>
                          </div>
                          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{room.name}</h2>
                          <p className="mt-2 text-sm text-muted">{canManageRooms ? "支持拖动排序" : "当前账号仅可操作开局和关局"}</p>
                        </div>
                      </div>

                      {room.openRound ? (
                        <div className="mt-5 space-y-4">
                          <div className="rounded-[22px] border border-[#d2b06a] bg-[#211a13] p-4 text-white shadow-[0_18px_40px_rgba(54,37,10,0.16)]">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-xs uppercase tracking-[0.22em] text-[#d1b16a]">Passcode</p>
                                <p className="mt-2 font-mono text-4xl tracking-[0.28em] text-[#fff4da]">{room.openRound.passcode}</p>
                              </div>
                              <div className="text-right text-sm text-[#d7d0c2]">
                                <p>已占用 {room.openRound.occupiedCount}</p>
                                <p>总上限 {room.openRound.capacity}</p>
                                <p>剩余 {room.openRound.remainingCount}</p>
                              </div>
                            </div>
                            <div className="mt-4 h-2 rounded-full bg-white/10">
                              <div className="h-2 rounded-full bg-[linear-gradient(90deg,#f4ddb2,#b78d43)]" style={{ width: `${progressPercent}%` }} />
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-border bg-white/78 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[#9a7a3b]">开局时间</p>
                              <p className="mt-2 text-sm font-medium text-foreground">{formatDateTime(room.openRound.startedAt)}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-white/78 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[#9a7a3b]">失效方式</p>
                              <p className="mt-2 text-sm font-medium text-foreground">{room.openRound.expiresAt ? "自动失效" : "手动结束"}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-white/78 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[#9a7a3b]">失效时间</p>
                              <p className="mt-2 text-sm font-medium text-foreground">{room.openRound.expiresAt ? formatDateTime(room.openRound.expiresAt) : "未设置"}</p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-border bg-white/78 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-foreground">本局参与人</p>
                              <span className="text-xs text-muted">{room.openRound.participants.length} / {room.openRound.capacity}</span>
                            </div>
                            {room.openRound.participants.length > 0 ? (
                              <div className="mt-4 space-y-2">
                                {room.openRound.participants.map((participant) => (
                                  <div key={`${participant.joinedAt}-${participant.visitorPhoneLast4}`} className="flex items-center justify-between rounded-2xl border border-[#efe2c6] bg-[#fffaf1] px-3 py-2 text-sm">
                                    <span className="font-medium text-foreground">{participant.visitorDisplayName}</span>
                                    <span className="font-mono text-[#7b5c25]">{participant.visitorPhoneLast4}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-muted">本局暂时还没有人扫码登记。</p>
                            )}
                          </div>

                          <button type="button" className="w-full rounded-2xl border border-[#f2d1cb] bg-[#fff4f2] px-4 py-3 text-sm font-semibold text-danger transition hover:bg-[#ffe9e6]" onClick={() => void closeCurrentRound(room.openRound!.id, room.name)}>
                            结束本局
                          </button>
                        </div>
                      ) : room.active ? (
                        <div className="mt-5 rounded-[24px] border border-[#ead9b8] bg-white/78 p-4">
                          <p className="text-sm font-semibold text-foreground">新开一局</p>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className="grid gap-2">
                              <span className="text-sm font-medium text-foreground">人数上限</span>
                              <input type="number" min={1} max={99} className="box-border w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={form.capacity} onChange={(event) => updateRoundForm(room.id, { capacity: event.target.value })} />
                            </label>

                            <label className="grid gap-2">
                              <span className="text-sm font-medium text-foreground">自动失效</span>
                              <select className="box-border w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={form.expiryMode} onChange={(event) => updateRoundForm(room.id, { expiryMode: event.target.value as RoundFormState["expiryMode"] })}>
                                <option value="none">不设置</option>
                                <option value="duration">开局后多少分钟</option>
                                <option value="datetime">指定结束时间</option>
                              </select>
                            </label>

                            {form.expiryMode === "duration" ? (
                              <label className="grid gap-2 md:col-span-2">
                                <span className="text-sm font-medium text-foreground">失效分钟数</span>
                                <input type="number" min={1} max={1440} className="box-border w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={form.durationMinutes} onChange={(event) => updateRoundForm(room.id, { durationMinutes: event.target.value })} />
                              </label>
                            ) : null}

                            {form.expiryMode === "datetime" ? (
                              <label className="grid gap-2 md:col-span-2">
                                <span className="text-sm font-medium text-foreground">指定结束时间</span>
                                <input type="datetime-local" className="box-border w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4" value={form.expiresAt} onChange={(event) => updateRoundForm(room.id, { expiresAt: event.target.value })} />
                              </label>
                            ) : null}
                          </div>

                          <button type="button" className="mt-4 w-full rounded-2xl bg-[linear-gradient(135deg,#d9bc7d,#af8740)] px-4 py-3 text-sm font-semibold text-[#332204] transition hover:brightness-105" onClick={() => void openRoundForRoom(room)}>
                            新开一局
                          </button>
                        </div>
                      ) : (
                        <div className="mt-5 rounded-[24px] border border-[#eadcc5] bg-[#faf4e7] p-4 text-sm leading-7 text-muted">房间已停用，启用后才能继续开局。</div>
                      )}

                      {canManageRooms ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button type="button" className="rounded-full border border-[#d5c09b] bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:bg-[#fffaf1]" onClick={() => void toggleRoom(room.id, !room.active)}>
                            {room.active ? "停用房间" : "启用房间"}
                          </button>
                          <button type="button" className="rounded-full border border-[#f2d1cb] bg-[#fff4f2] px-4 py-2 text-sm font-medium text-danger transition hover:bg-[#ffe9e6]" onClick={() => void removeRoom(room.id, room.name)}>
                            删除房间
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="glass-card gold-ring rounded-[28px] border border-white/60 bg-white/80 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">最近扫码日志</p>
                  <p className="mt-2 text-sm leading-7 text-muted">展示最近 120 条扫码结果，拒绝原因可用于现场排查口令错误、过期和人数已满等情况。</p>
                </div>
                <span className="rounded-full border border-[#ead7b0] bg-[#fff7e9] px-3 py-1 text-xs text-[#8d6722]">实时刷新</span>
              </div>

              <div className="mt-5 overflow-hidden rounded-[24px] border border-[#ead9b8] bg-[#fffaf1]">
                <div className="hidden grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_1fr] gap-3 border-b border-[#f0e2c6] px-4 py-3 text-xs uppercase tracking-[0.18em] text-[#9a7a3b] md:grid">
                  <span>时间</span>
                  <span>房间</span>
                  <span>访客</span>
                  <span>结果</span>
                  <span>原因</span>
                </div>

                <div className="max-h-[780px] overflow-y-auto">
                  {dashboard.recentEvents.length > 0 ? (
                    dashboard.recentEvents.map((event) => {
                      const meta = RESULT_META[event.result] ?? { label: event.result, className: "border-[#eadcc5] bg-[#f8f1e3] text-[#765629]" };

                      return (
                        <div key={event.id} className="grid gap-3 border-b border-[#f0e2c6] px-4 py-4 text-sm last:border-b-0 md:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_1fr] md:items-center">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-[#9a7a3b] md:hidden">时间</p>
                            <p className="text-foreground">{formatShortDateTime(event.scannedAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-[#9a7a3b] md:hidden">房间</p>
                            <p className="text-foreground">{event.roomName ?? "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-[#9a7a3b] md:hidden">访客</p>
                            <p className="text-foreground">{event.visitorDisplayName ? `${event.visitorDisplayName} / ${event.visitorPhoneLast4 ?? "----"}` : "未识别"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-[#9a7a3b] md:hidden">结果</p>
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-[#9a7a3b] md:hidden">原因</p>
                            <p className="leading-6 text-muted">{event.reason ?? "-"}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-4 py-10 text-center text-sm text-muted">暂无扫码记录。</div>
                  )}
                </div>
              </div>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
