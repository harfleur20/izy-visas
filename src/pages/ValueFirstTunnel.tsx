import { useTunnelState } from "@/hooks/useTunnelState";
import TunnelSplash from "@/components/tunnel/TunnelSplash";
import TunnelIdentity from "@/components/tunnel/TunnelIdentity";

export default function ValueFirstTunnel() {
  const tunnel = useTunnelState();
  const { step } = tunnel.state;

  switch (step) {
    case "splash":
      return <TunnelSplash onNext={() => tunnel.setStep("identity")} />;

    case "identity":
      return (
        <TunnelIdentity
          identity={tunnel.state.identity}
          onUpdate={tunnel.setIdentity}
          onNext={() => tunnel.setStep("upload_refus")}
          onBack={() => tunnel.setStep("splash")}
        />
      );

    // Placeholder screens — will be implemented in next phases
    case "upload_refus":
    case "verification":
    case "verdict":
    case "pieces":
    case "letter":
    case "payment":
    case "signup":
      return (
        <div className="fixed inset-0 bg-background flex items-center justify-center px-6">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground font-dm">Étape "{step}" — en construction</p>
            <button
              onClick={() => tunnel.setStep("identity")}
              className="text-sm text-primary hover:underline"
            >
              ← Retour
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
}
