import Link from "next/link";

import { EntryForm } from "@/components/entry-form";
import { ensureDefaultCampaign } from "@/lib/campaign";
import { getPublicRooms } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DefaultQrEntryPage() {
  const [campaign, rooms] = await Promise.all([
    ensureDefaultCampaign(),
    getPublicRooms(),
  ]);

  return (
    <div className="page-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-5 py-10">
        {rooms.length === 0 ? (
          <section className="glass-card gold-ring rounded-[28px] border border-white/60 bg-white/80 p-8 text-center">
            <p className="text-sm uppercase tracking-[0.24em] text-[#9a7a3b]">
              QR Entry Closed
            </p>
            <h1 className="mt-4 text-3xl font-semibold">暂时无法扫码</h1>
            <p className="mt-4 text-base leading-7 text-muted">
              当前没有可用房间，请联系现场员工处理后再试。
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-white"
            >
              返回首页
            </Link>
          </section>
        ) : (
          <EntryForm campaignName={campaign.name} rooms={rooms} />
        )}
      </main>
    </div>
  );
}
