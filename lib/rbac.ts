/**
 * Role-Based Access Control (RBAC) System for Textora Engage CRM
 *
 * 3-Level Access Model:
 * Level 3 - Super Admin (super_admin / admin): Full control of CRM, team users, tenant settings, reports, all leads
 * Level 2 - Sales Manager / Team Lead (sales_manager / manager): Lead assignment, import batch, team monitoring, reports
 * Level 1 - Sales Rep (sales_rep / rep): Only sees & works on leads assigned to them by Level 2 / Level 3
 * Support Role - Accounts & Ops (accounts_ops): Payment verification & credit provisioning
 */

export const ROLES = {
  ADMIN: "super_admin",
  MANAGER: "sales_manager",
  REP: "sales_rep",
  OPS: "accounts_ops",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES] | string;

export type CRMAction =
  // Lead actions
  | "leads:view_all"
  | "leads:view_assigned_only"
  | "leads:create"
  | "leads:import"
  | "leads:assign"
  | "leads:delete"
  | "leads:work" // Call, dispose, log activity
  // Team actions
  | "team:view"
  | "team:manage_users"
  // Report actions
  | "reports:view_all"
  // Payment actions
  | "payments:approve";

/**
 * Robust role normalization handling all aliases, casing, spaces, and hyphens:
 * - "admin", "super_admin", "superadmin", "administrator", "Super Admin" -> "super_admin"
 * - "manager", "sales_manager", "team_lead", "teamlead", "Sales Manager" -> "sales_manager"
 * - "rep", "sales_rep", "salesrep", "agent", "Sales Rep" -> "sales_rep"
 * - "ops", "accounts_ops", "accounts", "operations" -> "accounts_ops"
 */
export function normalizeRole(role?: string | null): string {
  if (!role || typeof role !== "string") return "";
  const r = role.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (
    r === "admin" ||
    r === "super_admin" ||
    r === "superadmin" ||
    r === "administrator"
  ) {
    return "super_admin";
  }
  if (
    r === "manager" ||
    r === "sales_manager" ||
    r === "team_lead" ||
    r === "teamlead" ||
    r === "lead"
  ) {
    return "sales_manager";
  }
  if (
    r === "rep" ||
    r === "sales_rep" ||
    r === "salesrep" ||
    r === "agent" ||
    r === "sales"
  ) {
    return "sales_rep";
  }
  if (
    r === "ops" ||
    r === "accounts_ops" ||
    r === "accounts" ||
    r === "operations" ||
    r === "account_ops"
  ) {
    return "accounts_ops";
  }
  return r;
}

const PERMISSION_MATRIX: Record<CRMAction, string[]> = {
  // Leads
  "leads:view_all": [ROLES.ADMIN, ROLES.MANAGER],
  "leads:view_assigned_only": [ROLES.REP],
  "leads:create": [ROLES.ADMIN, ROLES.MANAGER],
  "leads:import": [ROLES.ADMIN, ROLES.MANAGER],
  "leads:assign": [ROLES.ADMIN, ROLES.MANAGER],
  "leads:delete": [ROLES.ADMIN],
  "leads:work": [ROLES.ADMIN, ROLES.MANAGER, ROLES.REP],

  // Team
  "team:view": [ROLES.ADMIN, ROLES.MANAGER],
  "team:manage_users": [ROLES.ADMIN],

  // Reports
  "reports:view_all": [ROLES.ADMIN, ROLES.MANAGER],

  // Payments
  "payments:approve": [ROLES.ADMIN, ROLES.OPS],
};

export function can(role: Role, action: CRMAction): boolean {
  if (!role) return false;
  const norm = normalizeRole(role);

  // Level 3 Admin has full control over all operations
  if (norm === ROLES.ADMIN) {
    return action !== "leads:view_assigned_only";
  }

  const allowed = PERMISSION_MATRIX[action];
  if (!allowed) return false;
  return allowed.includes(norm) || allowed.includes(role);
}

export function isAdmin(role: Role): boolean {
  return normalizeRole(role) === ROLES.ADMIN;
}

export function isManagerOrAdmin(role: Role): boolean {
  const norm = normalizeRole(role);
  return norm === ROLES.ADMIN || norm === ROLES.MANAGER;
}

export function isSalesManager(role: Role): boolean {
  return normalizeRole(role) === ROLES.MANAGER;
}

export function isSalesRep(role: Role): boolean {
  return normalizeRole(role) === ROLES.REP;
}
