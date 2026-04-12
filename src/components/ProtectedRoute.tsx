import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

type AllowedRole = "client" | "avocat" | "admin" | "super_admin" | "admin_delegue" | "admin_juridique";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
  requireMfa?: boolean;
}

const ProtectedRoute = ({ children, allowedRoles, requireMfa }: ProtectedRouteProps) => {
  const { session, role, loading, hasMfaEnabled } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary-hover border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm font-syne">Chargement…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // MFA required for admin roles
  if (requireMfa && !hasMfaEnabled) {
    return <Navigate to="/setup-2fa" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role as AllowedRole)) {
    const roleRoutes: Record<string, string> = {
      client: "/client",
      avocat: "/avocat",
      super_admin: "/super-admin",
      admin_delegue: "/admin",
      admin_juridique: "/admin-juridique",
      admin: "/admin",
    };
    return <Navigate to={roleRoutes[role] || "/"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
