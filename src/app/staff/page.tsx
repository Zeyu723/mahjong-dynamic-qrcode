import { redirect } from "next/navigation";

import { StaffDashboard } from "@/components/staff-dashboard";
import { getCurrentStaffUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StaffDashboardPage() {
  const user = await getCurrentStaffUser();
  if (!user) {
    redirect("/staff/login");
  }

  return <StaffDashboard />;
}
