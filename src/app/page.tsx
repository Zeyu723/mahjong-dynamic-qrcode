import Link from "next/link";

export default function Home() {
  return (
    <div className="page-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
        <section className="glass-card gold-ring overflow-hidden rounded-[32px] border border-white/50 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,246,228,0.86))]">
          <div className="grid gap-10 px-8 py-10 md:grid-cols-[1.1fr_0.9fr] md:px-12 md:py-14">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-[#9a7a3b]">
                Clubhouse QR Console
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                麻将房动态二维码系统
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted md:text-lg">
            固定二维码不变，后台按房间开局，员工发放口令，顾客扫码后校验房间、口令、人数上限和失效时间，再跳转到目标表单页。
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  ["固定二维码", "打印一次，后台改链接无需重印"],
                  ["房间化管理", "支持多房间、多局次、日志可追踪"],
                  ["防拍照复扫", "人数上限、口令、过期时间三重限制"],
                ].map(([title, detail]) => (
                  <article
                    key={title}
                    className="rounded-2xl border border-[#ead9b6] bg-white/70 p-4"
                  >
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#ead7b0] bg-[#1f1a14] p-6 text-white shadow-[0_24px_70px_rgba(50,33,8,0.22)]">
              <p className="text-sm uppercase tracking-[0.24em] text-[#d9bf82]">Quick Entry</p>
              <div className="mt-6 space-y-4">
                <Link
                  href="/r/default"
                  className="block rounded-2xl border border-white/10 bg-white/8 px-5 py-5 transition hover:translate-y-[-1px] hover:bg-white/12"
                >
                  <p className="text-lg font-semibold">顾客扫码入口</p>
                  <p className="mt-2 text-sm leading-6 text-[#d7d0c3]">
                    打印固定二维码后，顾客统一从这里进入。
                  </p>
                </Link>

                <Link
                  href="/staff/login"
                  className="block rounded-2xl border border-[#caa356] bg-[linear-gradient(135deg,#f3e1ba,#b48839)] px-5 py-5 text-[#2f1f05] transition hover:translate-y-[-1px]"
                >
                  <p className="text-lg font-semibold">员工后台 Dashboard</p>
                  <p className="mt-2 text-sm leading-6 text-[#5d4416]">
                    管理房间、开局参数、打印页、扫码日志和目标链接配置。
                  </p>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
