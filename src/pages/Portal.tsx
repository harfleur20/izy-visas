import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { homeRouteForRole } from "@/lib/roles";
import ValueFirstTunnel from "@/pages/ValueFirstTunnel";

const Portal = () => {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && role) {
      navigate(homeRouteForRole(role), { replace: true });
    }
  }, [loading, user, role, navigate]);

  // While loading auth, show a spinner
  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="font-syne font-extrabold text-xl tracking-tight">
            IZY<em className="not-italic bg-gold-2 text-background px-1.5 py-0.5 rounded-[3px] text-sm">VISA</em>
          </div>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // If connected, the useEffect will redirect — show nothing
  if (user) return null;

  // Not connected: show the value-first tunnel
  return <ValueFirstTunnel />;
};

export default Portal;
