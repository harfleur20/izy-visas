import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, isAdminRole, pickPrimaryRole } from "@/lib/roles";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  hasMfaEnabled: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
  isSuperAdmin: false,
  isAdmin: false,
  hasMfaEnabled: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMfaEnabled, setHasMfaEnabled] = useState(false);

  const fetchRole = useCallback(async (userId: string): Promise<AppRole> => {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      return pickPrimaryRole((data || []).map((row) => row.role)) || "client";
    } catch {
      return "client";
    }
  }, []);

  const checkMfa = useCallback(async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verifiedFactors = data?.totp?.filter(f => f.status === "verified") || [];
      setHasMfaEnabled(verifiedFactors.length > 0);
    } catch {
      setHasMfaEnabled(false);
    }
  }, []);

  const handleUserSession = useCallback(async (currentSession: Session | null) => {
    setSession(currentSession);
    setUser(currentSession?.user ?? null);
    if (currentSession?.user) {
      try {
        const [userRole] = await Promise.all([
          fetchRole(currentSession.user.id),
          checkMfa(),
        ]);
        setRole(userRole);
      } catch {
        setRole("client");
        setHasMfaEnabled(false);
      }
    } else {
      setRole(null);
      setHasMfaEnabled(false);
    }
    setLoading(false);
  }, [fetchRole, checkMfa]);

  useEffect(() => {
    // 1. Restore session from storage first
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      handleUserSession(currentSession);
    });

    // 2. Listen for subsequent auth changes (do NOT await inside the callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        // Fire-and-forget: no await in the callback to prevent deadlocks
        handleUserSession(currentSession);
      }
    );

    return () => subscription.unsubscribe();
  }, [handleUserSession]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setHasMfaEnabled(false);
  };

  const isSuperAdmin = role === "super_admin";
  const isAdmin = isAdminRole(role);

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut, isSuperAdmin, isAdmin, hasMfaEnabled }}>
      {children}
    </AuthContext.Provider>
  );
};
