import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { homeRouteForRole, isAdminRole } from "@/lib/roles";

const Setup2FA = () => {
  const navigate = useNavigate();
  const { session, role, hasMfaEnabled, loading: authLoading } = useAuth();
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"enroll" | "verify">("enroll");
  const [enrollmentStarted, setEnrollmentStarted] = useState(false);

  const startEnrollment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "IZY VISA Admin 2FA",
      });

      if (error) {
        throw error;
      }

      if (data) {
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
        setStep("verify");
      }
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible de preparer la 2FA.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!session) {
      navigate("/auth", { replace: true });
      return;
    }

    if (!isAdminRole(role)) {
      navigate(homeRouteForRole(role), { replace: true });
      return;
    }

    if (hasMfaEnabled) {
      navigate(homeRouteForRole(role), { replace: true });
      return;
    }

    if (!enrollmentStarted) {
      setEnrollmentStarted(true);
      void startEnrollment();
    }
  }, [authLoading, enrollmentStarted, hasMfaEnabled, navigate, role, session]);

  const verifyFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) {
        throw challengeError;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode,
      });

      if (verifyError) {
        throw verifyError;
      }

      toast({
        title: "2FA active",
        description: "Double authentification configuree avec succes.",
      });

      navigate(homeRouteForRole(role), { replace: true });
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Verification 2FA impossible.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none transition-all focus:border-primary-hover/55 text-center tracking-[0.3em] text-lg";

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6">
      <div className="absolute w-[700px] h-[700px] -top-[300px] -left-[200px] rounded-full bg-[radial-gradient(circle,rgba(26,80,220,0.1)_0%,transparent_70%)] pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-8">
          <div className="font-syne font-extrabold text-[2rem] tracking-tight mb-2">
            IZY<em className="not-italic bg-[hsl(var(--gold-2))] text-[hsl(var(--background))] px-2 py-0.5 rounded-[5px]">VISA</em>
          </div>
          <p className="text-muted-foreground text-sm font-syne font-bold">Configuration 2FA obligatoire</p>
        </div>

        <div className="bg-panel border border-border rounded-xl p-6">
          {step === "enroll" && (
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary-hover border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground text-sm mt-3">Preparation...</p>
            </div>
          )}

          {step === "verify" && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  Scannez ce QR code avec <strong>Google Authenticator</strong> ou <strong>Authy</strong>
                </p>
                {qrCode && (
                  <div className="bg-white rounded-lg p-3 inline-block mb-3">
                    <img src={qrCode} alt="QR Code 2FA" className="w-48 h-48" />
                  </div>
                )}
                <p className="text-[0.65rem] text-muted font-mono break-all">{secret}</p>
              </div>

              <form onSubmit={verifyFactor} className="space-y-4">
                <div>
                  <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">
                    Code de verification
                  </label>
                  <input
                    type="text"
                    className={inputClass}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || verifyCode.length !== 6}
                  className="w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all disabled:opacity-50"
                >
                  {loading ? "Verification..." : "Activer la 2FA"}
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="text-center text-[0.65rem] text-muted-foreground mt-4">
          La double authentification est obligatoire pour tous les comptes administrateurs.
        </p>
      </div>
    </div>
  );
};

export default Setup2FA;
