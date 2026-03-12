import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { PrintPanel } from "@/components/print-panel";
import { resolveBaseUrl } from "@/lib/base-url";
import { getCurrentStaffUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StaffPrintPage() {
  const user = await getCurrentStaffUser();
  if (!user) {
    redirect("/staff/login");
  }

  const baseUrl = await resolveBaseUrl();
  const fixedUrl = `${baseUrl}/r/default`;
  const qrDataUrl = await QRCode.toDataURL(fixedUrl, {
    width: 360,
    margin: 1,
  });

  return (
    <div className="page-shell">
      <main className="mx-auto max-w-5xl px-5 py-10">
        <PrintPanel fixedUrl={fixedUrl} qrDataUrl={qrDataUrl} />
      </main>
    </div>
  );
}
