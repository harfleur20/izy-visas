import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppRole, homeRouteForRole, normalizeRole } from "@/lib/roles";
type AllowedRole = AppRole;

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
  requireMfa?: boolean;
}

const ProtectedRoute = ({ children, allowedRoles, requireMfa }: ProtectedRouteProps) => {
  const { session, role, loading, hasMfaEnabled } = useAuth();
  const location = useLocation();
  const normalizedRole = normalizeRole(role);
  const normalizedAllowedRoles = allowedRoles?.map((allowedRole) => normalizeRole(allowedRole)).filter(Boolean) as AllowedRole[] | undefined;

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
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  // MFA required for admin roles
  if (requireMfa && !hasMfaEnabled) {
    return <Navigate to="/setup-2fa" replace />;
  }

  if (normalizedAllowedRoles && normalizedRole && !normalizedAllowedRoles.includes(normalizedRole)) {
    return <Navigate to={homeRouteForRole(normalizedRole)} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
