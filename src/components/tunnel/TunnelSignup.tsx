import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "@/hooks/use-toast";
import { PhoneInput, isValidPhoneNumber } from "@/components/PhoneInput";
import type { TunnelIdentityData, TunnelOcrData, TunnelPieceFile } from "@/hooks/useTunnelState";

interface TunnelSignupProps {
  identity: TunnelIdentityData;
  ocrData: TunnelOcrData;
  pieces: TunnelPieceFile[];
  letterContent: string | null;
  optionChoisie: string | null;
  onBack: () => void;
}

export default function TunnelSignup({
  identity,
  ocrData,
  pieces,
  letterContent,
  optionChoisie,
  onBack,
}: TunnelSignupProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone && !isValidPhoneNumber(phone)) {
      setPhoneError("Numéro invalide");
      return;
    }
    setPhoneError("");
    setLoading(true);

    try {
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: identity.firstName,
            last_name: identity.lastName,
            phone,
            date_naissance: identity.dateNaissance,
            lieu_naissance: identity.lieuNaissance,
            nationalite: identity.nationalite,
            passport_number: identity.passportNumber,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signupError) throw signupError;
      const user = signupData.user;
      if (!user) throw new Error("Erreur lors de la création du compte");

      // Now create the dossier via edge function
      const { data: migrationResult, error: migrationError } = await supabase.functions.invoke(
        "migrate-tunnel-dossier",
        {
          body: {
            identity,
            ocrData,
            pieces: pieces.map((p) => ({
              nomPiece: p.nomPiece,
              typePiece: p.typePiece,
              fileName: p.file.name,
              fileSize: p.file.size,
            })),
            letterContent,
            optionChoisie,
          },
        }
      );

      if (migrationError) {
        console.error("Migration error:", migrationError);
        // Account created but migration failed — redirect to client space anyway
        toast({
          title: "Compte créé",
          description: "Votre compte a été créé. Certaines données devront être re-saisies.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Bienvenue !",
          description: "Votre dossier a été créé. Finalisez le paiement dans votre espace.",
        });
      }

      // Redirect to client space — payment will happen there
      window.location.href = "/client?from_tunnel=true&option=" + (optionChoisie || "B");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'inscription";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    try {
      // Store tunnel data in sessionStorage before redirect
      sessionStorage.setItem(
        "tunnel_data",
        JSON.stringify({ identity, ocrData, pieces: pieces.map(p => ({ nomPiece: p.nomPiece, typePiece: p.typePiece, fileName: p.file.name })), letterContent, optionChoisie })
      );

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/client?from_tunnel=true&option=" + (optionChoisie || "B"),
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
    "w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none transition-all focus:border-primary-hover/55 focus:bg-primary/[0.07] focus:shadow-[0_0_0_3px_rgba(56,112,255,0.1)] min-h-[48px]";
  const labelClass =
    "font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block";
  const btnPrimary =
    "w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-primary-hover text-foreground hover:bg-[hsl(224,100%,67%)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:pointer-events-none min-h-[52px]";
  const btnOutline =
    "w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-foreground/[0.07] text-foreground border border-border-2 hover:bg-foreground/[0.11] transition-all disabled:opacity-50 min-h-[52px]";

  return (
    <div className="fixed inset-0 bg-background overflow-y-auto">
      <div className="min-h-full flex flex-col items-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[400px]">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>

          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-syne font-bold text-gold-2 bg-gold-2/10 px-2 py-0.5 rounded-full">
              Étape 9/9
            </span>
          </div>

          {/* Logo */}
          <div className="text-center mb-6">
            <div className="font-syne font-extrabold text-[2rem] tracking-tight mb-2">
              IZY
              <em className="not-italic bg-gold-2 text-background px-2 py-0.5 rounded-[5px]">
                VISA
              </em>
            </div>
            <p className="text-muted-foreground text-sm font-dm">
              Créez votre compte pour finaliser
            </p>
          </div>

          {/* Google */}
          <button onClick={handleGoogleSignup} disabled={loading} className={btnOutline}>
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

          {/* Email form */}
          <form onSubmit={handleSignup} className="space-y-3">
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
            <div>
              <label className={labelClass}>
                Téléphone WhatsApp (optionnel)
              </label>
              <PhoneInput
                value={phone}
                onChange={(v) => {
                  setPhone(v);
                  if (phoneError) setPhoneError("");
                }}
                error={phoneError}
              />
            </div>

            <div className="bg-background-3 rounded-xl p-3 border border-border-2">
              <p className="text-xs text-muted-foreground font-dm">
                <span className="text-gold-2 font-semibold">Pré-rempli :</span>{" "}
                {identity.firstName} {identity.lastName} · {ocrData.visaType} · Option {optionChoisie}
              </p>
            </div>

            <button type="submit" disabled={loading} className={btnPrimary}>
              {loading ? "Création en cours…" : "Créer mon compte"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-4">
            En créant un compte, vous acceptez les{" "}
            <a href="/cgu" className="text-primary-hover hover:underline">
              CGU
            </a>
          </p>

          <p className="text-center text-xs text-muted-foreground mt-2">
            Déjà un compte ?{" "}
            <a href="/auth" className="text-primary-hover font-bold hover:underline">
              Se connecter
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
