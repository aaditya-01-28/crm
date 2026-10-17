import { getSession } from "@/lib/auth";
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

  return (
    <SessionProvider role={session.role} userId={session.sub} userName={session.fullName}>
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-slate-50">
          <Sidebar role={session.role} />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TopBar user={session} />
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </SessionProvider>
  );
}
