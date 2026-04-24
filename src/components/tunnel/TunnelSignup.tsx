import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "@/hooks/use-toast";
import { PhoneInput, isValidPhoneNumber } from "@/components/PhoneInput";
import type { TunnelIdentityData, TunnelOcrData, TunnelPieceFile } from "@/hooks/useTunnelState";

type PaymentMethod = "stripe" | "taramoney";

interface TunnelSignupProps {
  identity: TunnelIdentityData;
  ocrData: TunnelOcrData;
  pieces: TunnelPieceFile[];
  letterContent: string | null;
  optionChoisie: string | null;
  paymentMethod: PaymentMethod;
  onBack: () => void;
}

async function triggerPayment(dossierRef: string, option: string, method: PaymentMethod) {
  const functionName = method === "stripe" ? "create-payment" : "create-taramoney-payment";
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { dossier_ref: dossierRef, option, from_tunnel: true },
  });
  if (error) throw new Error(error.message || "Erreur lors de la création du paiement");
  return data;
}

async function uploadTunnelPieces(dossierId: string, pieces: TunnelPieceFile[]) {
  if (pieces.length === 0) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await Promise.allSettled(
    pieces.map((piece) => {
      const formData = new FormData();
      formData.append("file", piece.file);
      formData.append("dossier_id", dossierId);
      formData.append("user_id", user.id);
      formData.append("nom_piece", piece.nomPiece);
      formData.append("type_piece", piece.typePiece || "obligatoire");

      return supabase.functions.invoke("check-document-ocr", {
        body: formData,
      });
    })
  );
}

export default function TunnelSignup({
  identity,
  ocrData,
  pieces,
  letterContent,
  optionChoisie,
  paymentMethod,
  onBack,
}: TunnelSignupProps) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const processPostSignup = async () => {
    const option = optionChoisie || "B";

    // Step 1: Migrate tunnel data
    setStatusMessage("Création de votre dossier…");
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
            scoreQualite: p.scoreQualite,
            statutOcr: p.statutOcr,
          })),
          letterContent,
          optionChoisie: option,
          skipPieceRecords: true,
        },
      }
    );

    if (migrationError || !migrationResult?.dossier_ref || !migrationResult?.dossier_id) {
      console.error("Migration error:", migrationError);
      toast({
        title: "Compte créé",
        description: "Votre compte a été créé. Finalisez le paiement dans votre espace.",
        variant: "destructive",
      });
      window.location.href = "/client?from_tunnel=true";
      return;
    }

    const dossierRef = migrationResult.dossier_ref;
    const dossierId = migrationResult.dossier_id;

    setStatusMessage("Transfert de vos pièces justificatives…");
    await uploadTunnelPieces(dossierId, pieces);

    // Step 2: Trigger payment
    setStatusMessage("Redirection vers le paiement…");
    try {
      const paymentResult = await triggerPayment(dossierRef, option, paymentMethod);

      if (paymentMethod === "stripe" && paymentResult?.url) {
        // Redirect to Stripe Checkout
        window.location.href = paymentResult.url;
      } else if (paymentMethod === "taramoney" && paymentResult?.primaryLink) {
        // Store links and redirect to client space with taramoney info
        sessionStorage.setItem("taramoney_links", JSON.stringify(paymentResult.links));
        window.location.href = "/client?payment=taramoney_pending&dossier_ref=" + dossierRef;
      } else {
        // Fallback: redirect to client space
        window.location.href = "/client?from_tunnel=true&dossier_ref=" + dossierRef;
      }
    } catch (paymentErr) {
      console.error("Payment error:", paymentErr);
      toast({
        title: "Dossier créé",
        description: "Votre dossier est prêt. Finalisez le paiement dans votre espace client.",
      });
      window.location.href = "/client?from_tunnel=true&dossier_ref=" + dossierRef;
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone && !isValidPhoneNumber(phone)) {
      setPhoneError("Numéro invalide");
      return;
    }
    setPhoneError("");
    setLoading(true);
    setStatusMessage("Création de votre compte…");

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
      if (!signupData.user) throw new Error("Erreur lors de la création du compte");

      await processPostSignup();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'inscription";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage("Connexion à votre compte…");

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      await processPostSignup();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de la connexion";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      setStatusMessage("");
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
        JSON.stringify({
          identity,
          ocrData,
          pieces: pieces.map((p) => ({ nomPiece: p.nomPiece, typePiece: p.typePiece, fileName: p.file.name })),
          letterContent,
          optionChoisie,
          paymentMethod,
        })
      );

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/client?from_tunnel=true&oauth_pending=true",
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
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 disabled:opacity-50"
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
              {mode === "signup"
                ? "Êtes-vous satisfait ? Si oui, créez votre compte"
                : "Connectez-vous pour rattacher ce dossier à votre espace"}
            </p>
          </div>

          {/* Loading overlay */}
          {loading && statusMessage && (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="font-dm text-sm text-foreground">{statusMessage}</p>
            </div>
          )}

          {mode === "signup" && (
            <>
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
            </>
          )}

          {/* Email form */}
          <form onSubmit={mode === "signup" ? handleSignup : handleLogin} className="space-y-3">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="amina@email.com"
                required
                disabled={loading}
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
                disabled={loading}
              />
            </div>
            {mode === "signup" && (
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
            )}

            <div className="bg-background-3 rounded-xl p-3 border border-border-2">
              <p className="text-xs text-muted-foreground font-dm">
                <span className="text-gold-2 font-semibold">Pré-rempli :</span>{" "}
                {identity.firstName} {identity.lastName} · {ocrData.visaType} · Option {optionChoisie}
                {" · "}{paymentMethod === "stripe" ? "Carte" : "Mobile Money"}
              </p>
            </div>

            <button type="submit" disabled={loading} className={btnPrimary}>
              {loading
                ? "Traitement en cours…"
                : mode === "signup"
                  ? "Créer mon compte & payer"
                  : "Se connecter & payer"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-4">
            En créant un compte, vous acceptez les{" "}
            <a href="/cgu" className="text-primary-hover hover:underline">
              CGU
            </a>
          </p>

          <p className="text-center text-xs text-muted-foreground mt-2">
            {mode === "signup" ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
              className="text-primary-hover font-bold hover:underline"
            >
              {mode === "signup" ? "Se connecter" : "Créer un compte"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
