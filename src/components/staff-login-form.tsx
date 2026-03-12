"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function StaffLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/staff/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.message ?? "登录失败");
        return;
      }

      router.replace("/staff");
      router.refresh();
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass-card gold-ring w-full rounded-[30px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,245,227,0.84))] p-8"
    >
      <p className="text-sm uppercase tracking-[0.24em] text-[#9a7a3b]">
        Staff Access
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        会所后台登录
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted">
        登录后可管理房间、开局、二维码打印和扫码记录。
      </p>

      <div className="mt-8 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-foreground">用户名</span>
          <input
            className="box-border w-full rounded-2xl border border-border bg-white/90 px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-foreground">密码</span>
          <input
            type="password"
            className="box-border w-full rounded-2xl border border-border bg-white/90 px-4 py-3 outline-none ring-[#af8740]/20 transition focus:ring-4"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      <button
        type="submit"
        className="mt-7 w-full rounded-2xl bg-[linear-gradient(135deg,#d9bc7d,#af8740)] px-4 py-3 text-sm font-semibold text-[#332204] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={loading}
      >
        {loading ? "登录中..." : "登录后台"}
      </button>
    </form>
  );
}
