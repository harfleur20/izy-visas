import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "@/hooks/use-toast";
import { PhoneInput, isValidPhoneNumber } from "@/components/PhoneInput";
import type { TunnelIdentityData, TunnelOcrData, TunnelPieceFile } from "@/hooks/useTunnelState";
import { createTunnelPieceBundleId, saveTunnelPieceBundle } from "@/lib/tunnelPieceBundle";
import { uploadTunnelPiecesToDossier } from "@/lib/tunnelUploads";

type PaymentMethod = "stripe" | "taramoney";
const TUNNEL_AUTH_IN_PROGRESS_KEY = "tunnel_auth_in_progress";
const CLIENT_TUNNEL_NOTICE_KEY = "client_tunnel_notice";

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const extractFunctionErrorMessage = async (error: unknown, data?: unknown) => {
  if (data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string") {
    return (data as { error: string }).error;
  }

  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: Response }).context
    : undefined;

  if (context) {
    try {
      const body = await context.clone().json();
      if (body?.error && typeof body.error === "string") return body.error;
      if (body?.message && typeof body.message === "string") return body.message;
    } catch {
      // Fall back to the generic SDK error message below.
    }
  }

  return error instanceof Error ? error.message : "";
};

const formatTunnelErrorMessage = (message: string) => {
  if (!message) {
    return "Une erreur est survenue pendant la reprise de votre dossier.";
  }

  if (message.includes("Non authentifie") || message.includes("Non autorise")) {
    return "Votre session n'est pas encore finalisée. Reconnectez-vous pour reprendre votre dossier.";
  }

  if (message.includes("APP_BASE_URL") || message.includes("configured") || message.includes("secrets")) {
    return "Le service de paiement est temporairement indisponible. Réessayez dans quelques minutes.";
  }

  return message;
};

interface TunnelSignupProps {
  identity: TunnelIdentityData;
  ocrData: TunnelOcrData;
  pieces: TunnelPieceFile[];
  letterContent: string | null;
  optionChoisie: string | null;
  paymentMethod: PaymentMethod;
  onBack: () => void;
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
  const [email, setEmail] = useState(identity.email || "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(identity.phone || "");
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const effectiveEmail = email.trim().toLowerCase() || identity.email.trim().toLowerCase();
  const effectivePhone = phone.trim() || identity.phone.trim();

  const setTunnelAuthInProgress = () => {
    sessionStorage.setItem(TUNNEL_AUTH_IN_PROGRESS_KEY, "true");
  };

  const clearTunnelAuthInProgress = () => {
    sessionStorage.removeItem(TUNNEL_AUTH_IN_PROGRESS_KEY);
  };

  const redirectTo = (url: string) => {
    clearTunnelAuthInProgress();
    window.location.href = url;
  };

  const setClientTunnelNotice = (title: string, description: string, variant: "default" | "destructive" = "default") => {
    sessionStorage.setItem(CLIENT_TUNNEL_NOTICE_KEY, JSON.stringify({ title, description, variant }));
  };

  const buildIdentityPayload = () => ({
    ...identity,
    email: effectiveEmail,
    phone: effectivePhone,
  });

  const buildStoredTunnelData = () => ({
    identity: buildIdentityPayload(),
    ocrData,
    pieces: pieces.map((p) => ({
      nomPiece: p.nomPiece,
      typePiece: p.typePiece,
      fileName: p.file.name,
      fileSize: p.file.size,
      scoreQualite: p.scoreQualite,
      statutOcr: p.statutOcr,
      extractedPassportNumber: p.extractedPassportNumber,
    })),
    letterContent,
    optionChoisie,
    paymentMethod,
  });

  const persistTunnelResumeData = async () => {
    let pieceBundleKey: string | null = null;
    if (pieces.length > 0) {
      pieceBundleKey = createTunnelPieceBundleId();
      await saveTunnelPieceBundle(pieceBundleKey, pieces);
    }

    sessionStorage.setItem("tunnel_data", JSON.stringify({
      ...buildStoredTunnelData(),
      pieceBundleKey,
    }));
  };

  const waitForAuthenticatedSession = async (timeoutMs = 6000) => {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        return session;
      }

      await delay(250);
    }

    return null;
  };

  const invokeTunnelFunction = async <T,>(functionName: string, body: unknown) => {
    const session = await waitForAuthenticatedSession();

    if (!session?.access_token) {
      await persistTunnelResumeData();
      throw new Error("Votre compte a été créé, mais la session n'est pas encore active. Reconnectez-vous pour reprendre le tunnel.");
    }

    const { data, error } = await supabase.functions.invoke(functionName, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body,
    });

    if (error || (data && typeof data === "object" && "error" in data)) {
      throw new Error(formatTunnelErrorMessage(await extractFunctionErrorMessage(error, data)));
    }

    return data as T;
  };

  const processPostSignup = async () => {
    const option = optionChoisie || "B";
    const identityPayload = buildIdentityPayload();

    // Step 1: Migrate tunnel data
    setStatusMessage("Création de votre dossier…");
    const migrationResult = await invokeTunnelFunction<{ dossier_ref?: string; dossier_id?: string }>(
      "migrate-tunnel-dossier",
      {
        identity: identityPayload,
        ocrData,
        pieces: pieces.map((p) => ({
          nomPiece: p.nomPiece,
          typePiece: p.typePiece,
          fileName: p.file.name,
          fileSize: p.file.size,
          scoreQualite: p.scoreQualite,
          statutOcr: p.statutOcr,
          extractedPassportNumber: p.extractedPassportNumber,
        })),
        letterContent,
        optionChoisie: option,
        skipPieceRecords: true,
      },
    );

    if (!migrationResult?.dossier_ref || !migrationResult?.dossier_id) {
      throw new Error("La création du dossier a échoué. Réessayez.");
    }

    const dossierRef = migrationResult.dossier_ref;
    const dossierId = migrationResult.dossier_id;

    setStatusMessage("Transfert de vos pièces justificatives…");
    const uploadSummary = await uploadTunnelPiecesToDossier(dossierId, pieces);
    if (uploadSummary.failed > 0) {
      setClientTunnelNotice(
        "Pièces à vérifier",
        "Certaines pièces n'ont pas pu être rattachées automatiquement. Vérifiez-les dans votre espace client.",
      );
    }

    // Step 2: Trigger payment
    setStatusMessage("Redirection vers le paiement…");
    const paymentResult = await invokeTunnelFunction<Record<string, unknown>>(
      paymentMethod === "stripe" ? "create-payment" : "create-taramoney-payment",
      { dossier_ref: dossierRef, option, from_tunnel: true },
    );

    if (paymentMethod === "stripe") {
      const checkoutUrl = typeof paymentResult?.url === "string" ? paymentResult.url : "";
      if (!checkoutUrl) {
        setClientTunnelNotice(
          "Paiement à finaliser",
          "Votre dossier a bien été créé, mais le checkout Stripe est indisponible pour le moment. Reprenez le paiement depuis votre espace client.",
          "destructive",
        );
        redirectTo(`/client?dossier_ref=${encodeURIComponent(dossierRef)}`);
        return;
      }

      redirectTo(checkoutUrl);
      return;
    }

    const primaryLink = typeof paymentResult?.primaryLink === "string" ? paymentResult.primaryLink : "";
    if (primaryLink) {
      sessionStorage.setItem("taramoney_links", JSON.stringify(paymentResult.links || {}));
      redirectTo("/client?payment=taramoney_pending&dossier_ref=" + dossierRef);
      return;
    }

    setClientTunnelNotice(
      "Paiement à finaliser",
      "Votre dossier a bien été créé, mais le lien Mobile Money n'est pas disponible. Reprenez le paiement depuis votre espace client.",
      "destructive",
    );
    redirectTo(`/client?dossier_ref=${encodeURIComponent(dossierRef)}`);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectivePhone && !isValidPhoneNumber(effectivePhone)) {
      setPhoneError("Numéro invalide");
      return;
    }
    setPhoneError("");
    setLoading(true);
    setStatusMessage("Création de votre compte…");
    setTunnelAuthInProgress();

    try {
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: effectiveEmail,
        password,
        options: {
          data: {
            first_name: identity.firstName,
            last_name: identity.lastName,
            phone: effectivePhone,
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
      if (!signupData.session) {
        await persistTunnelResumeData();
        throw new Error("Votre compte a été créé, mais la session n'est pas encore active. Reconnectez-vous pour reprendre votre dossier.");
      }

      await processPostSignup();
    } catch (err: unknown) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        clearTunnelAuthInProgress();
      }
      const message = err instanceof Error ? err.message : "Erreur lors de l'inscription";
      toast({ title: "Erreur", description: formatTunnelErrorMessage(message), variant: "destructive" });
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage("Connexion à votre compte…");
    setTunnelAuthInProgress();

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: effectiveEmail, password });
      if (error) throw error;

      await processPostSignup();
    } catch (err: unknown) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        clearTunnelAuthInProgress();
      }
      const message = err instanceof Error ? err.message : "Erreur lors de la connexion";
      toast({ title: "Erreur", description: formatTunnelErrorMessage(message), variant: "destructive" });
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    try {
      await persistTunnelResumeData();

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
