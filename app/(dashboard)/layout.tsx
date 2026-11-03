import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { SessionProvider } from "@/components/layout/SessionProvider";
import { SidebarProvider } from "@/components/layout/SidebarContext";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (session.mustChangePassword) {
    redirect("/login?mustChangePassword=true");
  }

  let enrichedUser = session;
  if (!session.lastLoginAt && !session.loginAt) {
    try {
      const userRes = await query<{ lastLoginAt: Date | null }>(
        `SELECT last_login_at as "lastLoginAt" FROM users WHERE id = $1`,
        [session.sub]
      );
      if (userRes[0]?.lastLoginAt) {
        enrichedUser = {
          ...session,
          lastLoginAt: new Date(userRes[0].lastLoginAt).toISOString(),
        };
      }
    } catch {}
  }

  return (
    <SessionProvider role={session.role} userId={session.sub} userName={session.fullName}>
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-slate-50">
          <Sidebar role={session.role} />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TopBar user={enrichedUser} />
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </SessionProvider>
  );
}
