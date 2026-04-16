import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";

interface TunnelLoginProps {
  onBack: () => void;
}

export default function TunnelLogin({ onBack }: TunnelLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "Email envoyé", description: "Consultez votre boîte mail pour réinitialiser votre mot de passe." });
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // useAuth will handle the redirect
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Une erreur est survenue";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast({ title: "Erreur Google", description: String(result.error), variant: "destructive" });
      }
      if (result.redirected) return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur de connexion Google";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none transition-all focus:border-primary-hover/55 focus:bg-primary/[0.07] focus:shadow-[0_0_0_3px_rgba(56,112,255,0.1)]";
  const labelClass =
    "font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Background orbs */}
      <div className="absolute w-[700px] h-[700px] -top-[300px] -left-[200px] rounded-full bg-[radial-gradient(circle,rgba(26,80,220,0.12)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] -bottom-[200px] -right-[100px] rounded-full bg-[radial-gradient(circle,rgba(192,136,40,0.08)_0%,transparent_70%)] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10">
        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-syne font-extrabold text-[2rem] tracking-tight mb-2">
            IZY<em className="not-italic bg-[hsl(var(--gold-2))] text-[hsl(var(--background))] px-2 py-0.5 rounded-[5px]">VISA</em>
          </div>
          <p className="text-muted-foreground text-sm">
            {mode === "forgot" ? "Réinitialisation du mot de passe" : "Connectez-vous à votre espace"}
          </p>
        </div>

        {/* Google */}
        {mode === "login" && (
          <>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-foreground/[0.07] text-foreground border border-border-2 hover:bg-foreground/[0.11] transition-all disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continuer avec Google
              </span>
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-muted-foreground text-xs font-syne">ou</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="amina@email.com"
              required
            />
          </div>

          {mode === "login" && (
            <div>
              <label className={labelClass}>Mot de passe</label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-primary-hover text-foreground hover:bg-[#5585ff] hover:-translate-y-px transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : mode === "forgot" ? (
              "Envoyer le lien"
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        {/* Links */}
        <div className="mt-5 text-center space-y-2">
          {mode === "login" ? (
            <button
              onClick={() => setMode("forgot")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mot de passe oublié ?
            </button>
          ) : (
            <button
              onClick={() => setMode("login")}
              className="text-xs text-primary-hover font-bold hover:underline"
            >
              ← Retour à la connexion
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-xs text-muted-foreground">
        <a href="/cgu" className="hover:text-foreground transition-colors">
          CGU & Politique de confidentialité
        </a>
        <span className="mx-2">·</span>
        <span>© {new Date().getFullYear()} IZY Visa</span>
      </div>
    </div>
  );
}
