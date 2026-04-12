import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_PRIORITY: AppRole[] = [
  "super_admin",
  "admin_delegue",
  "admin_juridique",
  "avocat",
  "client",
];

export function normalizeRole(role: string | null | undefined): AppRole | null {
  if (!role) {
    return null;
  }

  if (role === "admin") {
    return "admin_delegue";
  }

  return ROLE_PRIORITY.includes(role as AppRole) ? (role as AppRole) : null;
}

export function pickPrimaryRole(roles: Array<string | null | undefined>): AppRole | null {
  const normalizedRoles = [...new Set(
    roles
      .map((role) => normalizeRole(role))
      .filter((role): role is AppRole => Boolean(role)),
  )];

  return ROLE_PRIORITY.find((role) => normalizedRoles.includes(role)) ?? null;
}

export function isAdminRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === "super_admin" || normalized === "admin_delegue" || normalized === "admin_juridique";
}

export function homeRouteForRole(role: string | null | undefined): string {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "client":
      return "/client";
    case "avocat":
      return "/avocat";
    case "super_admin":
      return "/super-admin";
    case "admin_delegue":
      return "/admin";
    case "admin_juridique":
      return "/admin-juridique";
    default:
      return "/";
  }
}

export function roleLabel(role: string | null | undefined): string {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "super_admin":
      return "Super Admin";
    case "admin_delegue":
      return "Admin délégué";
    case "admin_juridique":
      return "Admin juridique";
    case "avocat":
      return "Avocat";
    case "client":
      return "Client";
    default:
      return "Inconnu";
  }
}
