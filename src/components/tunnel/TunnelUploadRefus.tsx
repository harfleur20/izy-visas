import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, Camera, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { TunnelOcrData } from "@/hooks/useTunnelState";

interface TunnelUploadRefusProps {
  firstName: string;
  lastName: string;
  onComplete: (ocrData: TunnelOcrData, file: File) => void;
  onBack: () => void;
}

type Phase = "upload" | "analyzing" | "error";

const MOTIF_LABELS: Record<string, string> = {
  A: "Document de voyage non valide",
  B: "But du séjour non justifié",
  C: "Ressources insuffisantes",
  D: "Assurance absente ou insuffisante",
  E: "Hébergement non justifié",
  F: "Doute sur la volonté de retour",
  G: "Signalement SIS",
  H: "Menace pour l'ordre public",
  I: "Séjour irrégulier antérieur",
  J: "Intention matrimoniale non établie",
  K: "Dossier incomplet",
  L: "Appréciation globale défavorable",
};

const VISA_TYPE_MAP: Record<string, string> = {
  court_sejour_schengen: "court_sejour",
  long_sejour_etudiant: "etudiant",
  long_sejour_conjoint_francais: "conjoint_francais",
  long_sejour_salarie: "salarie",
  passeport_talent: "passeport_talent",
  visiteur_parent_enfant_francais: "visiteur",
  autre: "autre",
};

export default function TunnelUploadRefus({ firstName, lastName, onComplete, onBack }: TunnelUploadRefusProps) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [errorMessage, setErrorMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const analyzeFile = async (file: File) => {
    const acceptedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!acceptedTypes.includes(file.type)) {
      setErrorMessage("Format non accepté. Seuls PDF, JPG et PNG sont acceptés (max 10 Mo).");
      setPhase("error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Fichier trop volumineux. Compressez votre image et réessayez.");
      setPhase("error");
      return;
    }

    setPhase("analyzing");
    setProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) { clearInterval(progressInterval); return 85; }
        return prev + Math.random() * 12;
      });
    }, 600);

    try {
      // In tunnel mode, we call the edge function without a real dossier_id
      // The edge function will handle the "tunnel" mode
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dossier_id", "tunnel_temp");
      formData.append("user_id", "tunnel_anonymous");
      formData.append("tunnel_mode", "true");
      formData.append("owner_first_name", firstName);
      formData.append("owner_last_name", lastName);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-decision-refus`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await res.json();

      if (!res.ok || data.status === "error") {
        setErrorMessage(data.message || "Erreur lors de l'analyse.");
        setPhase("error");
        return;
      }

      if (data.status === "not_recognized") {
        setErrorMessage(data.message || "Ce document n'est pas une décision de refus de visa.");
        setPhase("error");
        return;
      }

      if (data.status === "unreadable") {
        setErrorMessage(data.message || "Document illisible. Réessayez avec une meilleure qualité.");
        setPhase("error");
        return;
      }

      // Handle name mismatch with explicit warning
      if (data.status === "name_mismatch") {
        const docName = data.data?.demandeur;
        setErrorMessage(
          `⚠️ Le nom sur la décision (${docName?.nom || "?"} ${docName?.prenom || "?"}) ne correspond pas à votre identité (${lastName} ${firstName}).\n\nVérifiez que vous avez importé votre propre décision de refus et non celle d'une autre personne.`
        );
        setPhase("error");
        return;
      }

      // Success or partial — data present
      const extracted = data.data;
      if (!extracted) {
        setErrorMessage("Données extraites manquantes. Réessayez.");
        setPhase("error");
        return;
      }

      const ocrData: TunnelOcrData = {
        visaType: VISA_TYPE_MAP[extracted.visa?.type_visa] || extracted.visa?.type_visa || "autre",
        typeVisaTexteOriginal: extracted.visa?.type_visa_texte_original || "",
        consulatNom: extracted.consulat?.nom || "",
        consulatVille: extracted.consulat?.ville || "",
        consulatPays: extracted.consulat?.pays || "",
        dateNotificationRefus: extracted.refus?.date_notification || "",
        motifsRefus: extracted.refus?.motifs_coches || [],
        motifsTexteOriginal: extracted.refus?.motifs_texte_original || [],
        numeroDecision: extracted.refus?.numero_decision || "",
        destinataireRecours: extracted.destinataire_recours || "crrv_nantes",
        langueDocument: extracted.langue_document || "fr",
        scoreOcr: extracted.confiance_extraction || 0,
      };

      onComplete(ocrData, file);
      onComplete(ocrData, file);
    } catch (err) {
      clearInterval(progressInterval);
      console.error("Analysis error:", err);
      setErrorMessage("Erreur lors de l'analyse. Veuillez réessayer.");
      setPhase("error");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzeFile(file);
    e.target.value = "";
  };

  if (phase === "analyzing") {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-[400px] text-center space-y-6 animate-in fade-in duration-500">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <h2 className="font-fraunces text-xl text-cream">Analyse en cours…</h2>
          <p className="text-sm text-muted-foreground">
            Notre IA lit votre décision de refus et extrait les informations clés.
          </p>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6 overflow-y-auto">
      {/* Background */}
      <div className="absolute w-[600px] h-[600px] -top-[250px] -left-[150px] rounded-full bg-[radial-gradient(circle,rgba(26,80,220,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Header */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <span className="text-xs text-muted-foreground font-dm">Étape 2 sur 7</span>
      </div>

      <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="font-fraunces text-[clamp(1.2rem,3vw,1.8rem)] text-cream text-center mb-3 leading-tight">
          Insérez votre décision de refus de visa ici
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Cette décision est encore contestable. Photographiez ou importez le document officiel reçu du consulat.
        </p>

        {/* Upload buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 min-h-[52px] flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.06] text-primary hover:bg-primary/[0.12] hover:border-primary/60 transition-all font-syne font-bold text-sm"
          >
            <Camera className="w-5 h-5" />
            Prendre une photo
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 min-h-[52px] flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-panel text-foreground hover:bg-foreground/[0.06] hover:border-foreground/30 transition-all font-syne font-bold text-sm"
          >
            <Upload className="w-5 h-5" />
            Importer un fichier
          </button>
        </div>

        <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={handleFileSelect} />
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFileSelect} />

        <p className="text-xs text-muted-foreground text-center mb-6">
          Formats acceptés : JPG, PNG, PDF · Max 10 Mo
        </p>

        {/* Error state */}
        {phase === "error" && errorMessage && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-destructive whitespace-pre-line">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={() => setPhase("upload")} className="mt-3">
              Réessayer
            </Button>
          </div>
        )}

        {/* Security note */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-panel border border-border rounded-lg p-3">
          <span>🔒</span>
          <span>Votre document est analysé de manière sécurisée et chiffrée.</span>
        </div>
      </div>
    </div>
  );
}
