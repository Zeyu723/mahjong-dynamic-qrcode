"use client";

import Link from "next/link";

type PrintPanelProps = {
  fixedUrl: string;
  qrDataUrl: string;
};

function getHintMessage(fixedUrl: string) {
  if (fixedUrl.includes("localhost") || fixedUrl.includes("127.0.0.1")) {
    return "当前二维码仍指向本机 localhost，手机无法直接访问。请改用局域网 IP 或正式域名。";
  }

  if (
    fixedUrl.includes("10.") ||
    fixedUrl.includes("192.168.") ||
    fixedUrl.includes("172.")
  ) {
    return "手机扫码前，请确认手机和这台电脑连接在同一个 Wi-Fi。";
  }

  return "当前二维码使用的是可直接访问的地址，可以打印给顾客使用。";
}

export function PrintPanel({ fixedUrl, qrDataUrl }: PrintPanelProps) {
  const hintMessage = getHintMessage(fixedUrl);
  const isWarning = fixedUrl.includes("localhost") || fixedUrl.includes("127.0.0.1");

  return (
    <section className="glass-card gold-ring overflow-hidden rounded-[30px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(255,246,228,0.86))] p-6 md:p-8">
      <p className="text-sm uppercase tracking-[0.24em] text-[#9a7a3b]">Print Center</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">固定二维码</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
        后台修改目标链接后，这张二维码不需要重印。顾客始终扫同一个码，由系统决定跳转到哪里。
      </p>

      <div className="mt-8 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start">
        <div className="rounded-[28px] border border-[#ead9b8] bg-white p-5 shadow-[0_18px_40px_rgba(79,58,24,0.08)]">
          <div className="flex justify-center rounded-[24px] border border-[#f0e1c1] bg-[#fffaf1] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="固定二维码" className="h-72 w-72 max-w-full" />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-border bg-white/80 p-4">
            <p className="text-sm font-medium text-foreground">扫码地址</p>
            <div className="mt-3 overflow-hidden break-all rounded-xl bg-[#241d14] px-4 py-3 font-mono text-xs leading-6 text-[#f4e6c8]">
              {fixedUrl}
            </div>
          </div>

          <div
            className={`rounded-2xl border px-4 py-4 text-sm leading-7 ${
              isWarning
                ? "border-[#f2c1b9] bg-[#fff5f4] text-danger"
                : "border-[#ead8b2] bg-[#fff8ec] text-[#7b5c25]"
            }`}
          >
            {hintMessage}
          </div>

          <div className="w-full rounded-2xl border border-border bg-white/75 p-4 text-sm leading-7 text-muted">
            建议把二维码打印在前台或房门口，员工每次开局时只需要发放当局口令，不需要更换二维码。
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full bg-[linear-gradient(135deg,#d9bc7d,#af8740)] px-5 py-2.5 text-sm font-semibold text-[#332204] transition hover:brightness-105"
              onClick={() => window.print()}
            >
              打印二维码
            </button>
            <Link
              href="/staff"
              className="rounded-full border border-border bg-white/85 px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-white"
            >
              返回后台
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
