import { redirect } from "next/navigation";

import { StaffLoginForm } from "@/components/staff-login-form";
import { getCurrentStaffUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StaffLoginPage() {
  const user = await getCurrentStaffUser();
  if (user) {
    redirect("/staff");
  }

  return (
    <div className="page-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-10">
        <StaffLoginForm />
      </main>
    </div>
  );
}
