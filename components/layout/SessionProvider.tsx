"use client";

import { createContext, useContext } from "react";
import { isManagerOrAdmin, isAdmin, normalizeRole } from "@/lib/rbac";

interface SessionContextValue {
  role: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
}

const SessionContext = createContext<SessionContextValue>({
  role: "sales_rep",
  userId: "",
  userName: "User",
  userEmail: "aaditya@textorasms.com",
  userPhone: "9902101007",
});

export function SessionProvider({
  role,
  userId,
  userName,
  userEmail,
  userPhone,
  children,
}: {
  role: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider
      value={{
        role: normalizeRole(role),
        userId,
        userName: userName || "User",
        userEmail: userEmail || "aaditya@textorasms.com",
        userPhone: userPhone || "9902101007",
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

/** Use this hook inside any client component to get the current user's role */
export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

/** Returns true if the current user is Level 3 Admin */
export function useIsAdmin(): boolean {
  const { role } = useSession();
  return isAdmin(role);
}

/** Returns true if the current user can import/create leads (Level 2 or 3 only) */
export function useCanImportLeads(): boolean {
  const { role } = useSession();
  return isManagerOrAdmin(role);
}

/** Returns true if the current user can assign leads to reps (Level 2 or 3 only) */
export function useCanAssignLeads(): boolean {
  const { role } = useSession();
  return isManagerOrAdmin(role);
}

/** Returns true if the current user is Level 2 (Manager) or Level 3 (Admin) */
export function useIsManagerOrAdmin(): boolean {
  const { role } = useSession();
  return isManagerOrAdmin(role);
}
