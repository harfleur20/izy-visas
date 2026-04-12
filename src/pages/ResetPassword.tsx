import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isAdminRole, pickPrimaryRole } from "@/lib/roles";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check for recovery type in URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    } else {
      // Listen for PASSWORD_RECOVERY event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setReady(true);
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      let nextPath = "/auth";

      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const primaryRole = pickPrimaryRole((roles || []).map((row) => row.role));
        nextPath = isAdminRole(primaryRole) ? "/setup-2fa" : "/auth";
      }

      toast({
        title: "Mot de passe mis à jour",
        description: nextPath === "/setup-2fa"
          ? "Mot de passe enregistré. Configurez maintenant la double authentification."
          : "Vous pouvez maintenant vous connecter.",
      });
      navigate(nextPath, { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Vérification du lien…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="font-syne font-extrabold text-[2rem] tracking-tight mb-2">
            IZY<em className="not-italic bg-gold-2 text-background px-2 py-0.5 rounded-[5px]">VISA</em>
          </div>
          <p className="text-muted-foreground text-sm">Choisissez un nouveau mot de passe</p>
        </div>

        <form onSubmit={handleReset} className="space-y-3">
          <div>
            <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55 focus:bg-primary/[0.07]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all disabled:opacity-50"
          >
            {loading ? "Chargement…" : "Réinitialiser le mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
