import { useState } from "react";
import { useTunnelState } from "@/hooks/useTunnelState";
import TunnelSplash from "@/components/tunnel/TunnelSplash";
import TunnelLogin from "@/components/tunnel/TunnelLogin";
import TunnelRecevabilite from "@/components/tunnel/TunnelRecevabilite";
import TunnelUploadRefus from "@/components/tunnel/TunnelUploadRefus";
import TunnelVerification from "@/components/tunnel/TunnelVerification";
import TunnelVerdict from "@/components/tunnel/TunnelVerdict";
import TunnelPieces from "@/components/tunnel/TunnelPieces";
import TunnelLetter from "@/components/tunnel/TunnelLetter";
import TunnelPayment from "@/components/tunnel/TunnelPayment";
import TunnelSignup from "@/components/tunnel/TunnelSignup";

export default function ValueFirstTunnel() {
  const tunnel = useTunnelState();
  const { step } = tunnel.state;
  const [showLogin, setShowLogin] = useState(false);

  if (showLogin) {
    return <TunnelLogin onBack={() => setShowLogin(false)} />;
  }

  switch (step) {
    case "splash":
      return <TunnelSplash onNext={() => tunnel.setStep("recevabilite")} onLogin={() => setShowLogin(true)} />;

    case "recevabilite":
      return (
        <TunnelRecevabilite
          dateRefus={tunnel.state.dateRefus}
          onUpdate={tunnel.setDateRefus}
          onNext={() => tunnel.setStep("upload_refus")}
          onBack={() => tunnel.setStep("splash")}
        />
      );

    case "upload_refus":
      return (
        <TunnelUploadRefus
          firstName={tunnel.state.identity.firstName}
          lastName={tunnel.state.identity.lastName}
          onComplete={(ocrData, file) => {
            tunnel.setOcrData(ocrData);
            tunnel.setDecisionFile(file);
            // Pré-remplit l'identité avec les noms extraits par l'OCR
            if (ocrData.demandeurPrenom || ocrData.demandeurNom) {
              tunnel.setIdentity({
                firstName: ocrData.demandeurPrenom || "",
                lastName: (ocrData.demandeurNom || "").toUpperCase(),
              });
            }
            tunnel.setStep("verification");
          }}
          onBack={() => tunnel.setStep("recevabilite")}
        />
      );

    case "verification":
      return tunnel.state.ocrData ? (
        <TunnelVerification
          ocrData={tunnel.state.ocrData}
          identity={tunnel.state.identity}
          onUpdate={(data) => tunnel.setOcrData(data)}
          onUpdateIdentity={tunnel.setIdentity}
          onNext={() => tunnel.setStep("verdict")}
          onBack={() => tunnel.setStep("upload_refus")}
        />
      ) : null;

    case "verdict":
      return tunnel.state.ocrData ? (
        <TunnelVerdict
          ocrData={tunnel.state.ocrData}
          onNext={() => tunnel.setStep("pieces")}
          onBack={() => tunnel.setStep("verification")}
        />
      ) : null;

    case "pieces":
      return tunnel.state.ocrData ? (
        <TunnelPieces
          ocrData={tunnel.state.ocrData}
          identity={tunnel.state.identity}
          pieces={tunnel.state.pieces}
          onAddPiece={tunnel.addPiece}
          onRemovePiece={tunnel.removePiece}
          onNext={() => tunnel.setStep("letter")}
          onBack={() => tunnel.setStep("verdict")}
        />
      ) : null;

    case "letter":
      return tunnel.state.ocrData ? (
        <TunnelLetter
          identity={tunnel.state.identity}
          ocrData={tunnel.state.ocrData}
          pieces={tunnel.state.pieces}
          letterContent={tunnel.state.lettreContenu}
          onLetterGenerated={(content) => tunnel.setLettre(content)}
          onNext={() => tunnel.setStep("payment")}
          onBack={() => tunnel.setStep("pieces")}
        />
      ) : null;

    case "payment":
      return tunnel.state.ocrData ? (
        <TunnelPayment
          paymentMethod={tunnel.state.paymentMethod}
          onOptionSelected={(option) => tunnel.setOption(option)}
          onPaymentMethodSelected={(method) => tunnel.setPaymentMethod(method)}
          onNext={() => tunnel.setStep("signup")}
          onBack={() => tunnel.setStep("letter")}
        />
      ) : null;

    case "signup":
      return tunnel.state.ocrData ? (
        <TunnelSignup
          identity={tunnel.state.identity}
          ocrData={tunnel.state.ocrData}
          pieces={tunnel.state.pieces}
          letterContent={tunnel.state.lettreContenu}
          optionChoisie={tunnel.state.optionChoisie}
          paymentMethod={tunnel.state.paymentMethod}
          onBack={() => tunnel.setStep("payment")}
        />
      ) : null;

    default:
      return null;
  }
}
