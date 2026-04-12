import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { homeRouteForRole, isAdminRole, roleLabel } from "@/lib/roles";

type InvitationPreview = {
  email: string;
  role: string;
  nom: string | null;
  prenom: string | null;
  expires_at: string;
};

const ActivateAdmin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() || "", [searchParams]);

  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadInvitation = async () => {
      if (!token) {
        setErrorMessage("Lien d'activation invalide.");
        setValidating(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("activate-admin", {
          body: { action: "preview", token },
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        setInvitation(data as InvitationPreview);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Lien d'activation invalide ou expiré.");
      } finally {
        setValidating(false);
      }
    };

    void loadInvitation();
  }, [token]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invitation) {
      return;
    }

    if (password.length < 12) {
      toast({
        title: "Mot de passe trop court",
        description: "Utilisez au moins 12 caractères pour un compte administrateur.",
        variant: "destructive",
      });
      return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      toast({
        title: "Mot de passe insuffisant",
        description: "Ajoutez au moins une majuscule, une minuscule et un chiffre.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Confirmation incorrecte",
        description: "Les deux mots de passe doivent être identiques.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("activate-admin", {
        body: { action: "activate", token, password },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password,
      });

      if (signInError) {
        toast({
          title: "Compte activé",
          description: "Le compte est créé. Connectez-vous maintenant pour terminer la configuration 2FA.",
        });
        navigate(`/auth?email=${encodeURIComponent(invitation.email)}`, { replace: true });
        return;
      }

      toast({
        title: "Compte activé",
        description: "Configurez maintenant la double authentification.",
      });

      navigate(isAdminRole(data?.role) ? "/setup-2fa" : homeRouteForRole(data?.role), { replace: true });
    } catch (err: unknown) {
      toast({
        title: "Activation impossible",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none transition-all focus:border-primary-hover/55";
  const labelClass = "font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block";

  if (validating) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-hover border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm mt-3">Vérification de l'invitation…</p>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] bg-panel border border-border rounded-xl p-6 text-center">
          <div className="font-syne font-extrabold text-[2rem] tracking-tight mb-3">
            IZY<em className="not-italic bg-gold-2 text-background px-2 py-0.5 rounded-[5px]">VISA</em>
          </div>
          <h1 className="font-syne font-bold text-lg mb-2">Activation impossible</h1>
          <p className="text-sm text-muted-foreground">{errorMessage || "Lien invalide ou expiré."}</p>
          <button
            onClick={() => navigate("/auth", { replace: true })}
            className="mt-5 w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all"
          >
            Aller à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <div className="font-syne font-extrabold text-[2rem] tracking-tight mb-2">
            IZY<em className="not-italic bg-gold-2 text-background px-2 py-0.5 rounded-[5px]">VISA</em>
          </div>
          <p className="text-muted-foreground text-sm">Activation d’un compte administrateur</p>
        </div>

        <div className="bg-panel border border-border rounded-xl p-6">
          <div className="mb-5 space-y-1.5">
            <div className="text-sm"><strong>Nom :</strong> {[invitation.prenom, invitation.nom].filter(Boolean).join(" ") || "Non renseigné"}</div>
            <div className="text-sm"><strong>Email :</strong> {invitation.email}</div>
            <div className="text-sm"><strong>Rôle :</strong> {roleLabel(invitation.role)}</div>
            <div className="text-sm text-muted-foreground">
              Lien valable jusqu’au {new Date(invitation.expires_at).toLocaleString("fr-FR")}
            </div>
          </div>

          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className={labelClass}>Mot de passe administrateur</label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Au moins 12 caractères"
                required
              />
            </div>

            <div>
              <label className={labelClass}>Confirmer le mot de passe</label>
              <input
                type="password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répétez le mot de passe"
                required
              />
            </div>

            <p className="text-[0.7rem] text-muted-foreground">
              Après activation, la double authentification sera obligatoire avant tout accès à l’espace admin.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all disabled:opacity-50"
            >
              {loading ? "Activation…" : "Activer le compte"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ActivateAdmin;
