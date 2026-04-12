import { useState, useRef } from "react";
import exempleDecisionRefus from "@/assets/exemple-decision-refus.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Eyebrow, BigTitle, Desc, Box } from "@/components/ui-custom";
import { toast } from "sonner";

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

const VISA_LABELS: Record<string, string> = {
  court_sejour: "Court séjour Schengen",
  etudiant: "Long séjour étudiant",
  conjoint_francais: "Conjoint de Français",
  salarie: "Long séjour salarié",
  passeport_talent: "Passeport talent",
  visiteur: "Visiteur / Parent enfant FR",
  autre: "Autre",
};

interface ExtractedData {
  demandeur: { nom: string | null; prenom: string | null; date_naissance: string | null; lieu_naissance: string | null; nationalite: string | null; numero_passeport: string | null };
  visa: { type_visa: string; type_visa_texte_original: string | null };
  consulat: { nom: string | null; ville: string | null; pays: string | null };
  refus: { date_notification: string | null; motifs_coches: string[]; motifs_texte_original: string[]; motifs_enrichis: { code: string; label: string }[]; numero_decision: string | null };
  destinataire_recours: string;
  langue_document: string;
  confiance_extraction: number;
  delai_restant_jours: number | null;
  score_qualite: number;
  url_fichier: string;
  warnings?: { type: string; message: string }[];
  nom_mismatch?: boolean;
}

interface DecisionRefusUploadProps {
  dossierId: string;
  userId: string;
  onComplete: (data: ExtractedData) => void;
  onBack: () => void;
}

type Phase = "upload" | "analyzing" | "not_recognized" | "unreadable" | "partial" | "success";

export function DecisionRefusUpload({ dossierId, userId, onComplete, onBack }: DecisionRefusUploadProps) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [errorMessage, setErrorMessage] = useState("");
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [editableData, setEditableData] = useState<ExtractedData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const analyzeFile = async (file: File) => {
    // Client-side validation
    const acceptedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!acceptedTypes.includes(file.type)) {
      setErrorMessage("❌ Format non accepté. Seuls les formats PDF, JPG et PNG sont acceptés. Maximum 10 Mo.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("❌ Fichier trop volumineux. Compressez votre image et réessayez.");
      return;
    }

    setPhase("analyzing");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dossier_id", dossierId);
      formData.append("user_id", userId);

      const { data, error } = await supabase.functions.invoke("analyze-decision-refus", {
        body: formData,
      });

      if (error) throw error;

      switch (data.status) {
        case "error":
          setErrorMessage(data.message);
          setPhase("upload");
          break;
        case "not_recognized":
          setErrorMessage(data.message);
          setPhase("not_recognized");
          break;
        case "unreadable":
          setErrorMessage(data.message);
          setPhase("unreadable");
          break;
        case "partial":
          setExtractedData(data.data);
          setEditableData(JSON.parse(JSON.stringify(data.data)));
          setPhase("partial");
          break;
        case "success":
          setExtractedData(data.data);
          setPhase("success");
          break;
        default:
          setErrorMessage("Réponse inattendue du serveur.");
          setPhase("upload");
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      setErrorMessage("❌ Erreur lors de l'analyse. Veuillez réessayer.");
      setPhase("upload");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzeFile(file);
    e.target.value = "";
  };

  const handleConfirm = () => {
    const finalData = phase === "partial" && editableData ? editableData : extractedData;
    if (!finalData) return;

    // Block if deadline expired
    if (finalData.delai_restant_jours !== null && finalData.delai_restant_jours < 0) {
      toast.error("Le délai de recours de 30 jours est expiré. Vous ne pouvez pas continuer avec ce document.");
      return;
    }

    // Warn but allow if name mismatch (user already saw the warning)
    onComplete(finalData);
  };

  const resetToUpload = () => {
    setPhase("upload");
    setErrorMessage("");
    setExtractedData(null);
    setEditableData(null);
  };

  const formatDateLong = (dateStr: string | null) => {
    if (!dateStr) return "Date inconnue";
    const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!parts) return dateStr;
    const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    return `${parseInt(parts[1])} ${months[parseInt(parts[2]) - 1]} ${parts[3]}`;
  };

  // ═══ UPLOAD PHASE ═══
  if (phase === "upload") {
    return (
      <div>
        <Eyebrow>Votre dossier</Eyebrow>
        <BigTitle>Votre décision de refus</BigTitle>
        <Desc>Photographiez ou importez le document officiel reçu du consulat après le refus de votre demande de visa. IZY lit automatiquement ce document et configure votre dossier.</Desc>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 min-h-[52px] flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.06] text-primary hover:bg-primary/[0.12] hover:border-primary/60 transition-all font-syne font-bold text-sm"
          >
            📷 Prendre une photo
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 min-h-[52px] flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-panel text-foreground hover:bg-foreground/[0.06] hover:border-foreground/30 transition-all font-syne font-bold text-sm"
          >
            📁 Importer un fichier
          </button>
        </div>

        <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={handleFileSelect} />
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFileSelect} />

        <div className="text-xs text-muted-foreground text-center mb-6">
          Formats acceptés : JPG, PNG, PDF · Taille maximum : 10 Mo
        </div>

        {/* Example image placeholder */}
        <div className="bg-panel border border-border rounded-xl p-4 mb-6">
          <div className="text-xs font-syne font-bold text-muted-foreground uppercase tracking-wider mb-3">📋 Exemple de décision de refus</div>
          <div className="rounded-lg overflow-hidden border border-border">
            <img
              src={exempleDecisionRefus}
              alt="Exemple anonymisé d'une décision de refus de visa français avec en-tête République Française, motifs cochés et tampon officiel"
              className="w-full h-auto max-h-64 object-cover object-top"
              loading="lazy"
              width={640}
              height={900}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Document officiel avec en-tête du consulat, motifs cochés (A, B, C…) et date de notification.
          </p>
        </div>

        {errorMessage && (
          <Box variant="alert" title="Erreur">
            <span className="whitespace-pre-line">{errorMessage}</span>
          </Box>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-panel border border-border rounded-lg p-3">
          <span>🔒</span>
          <span>Votre document est chiffré et accessible uniquement à vous et à votre avocat.</span>
        </div>

        <div className="flex gap-2.5 mt-7">
          <Button variant="outline" onClick={onBack}>← Retour</Button>
        </div>
      </div>
    );
  }

  // ═══ ANALYZING PHASE ═══
  if (phase === "analyzing") {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4 animate-pulse">🔍</div>
        <BigTitle>Analyse en cours…</BigTitle>
        <Desc>IZY lit votre décision de refus. Cela prend quelques secondes.</Desc>
        <div className="w-48 mx-auto mt-4">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
        </div>
      </div>
    );
  }

  // ═══ NOT RECOGNIZED ═══
  if (phase === "not_recognized") {
    return (
      <div>
        <Eyebrow>Document non reconnu</Eyebrow>
        <BigTitle>Ce n'est pas une décision de refus</BigTitle>
        <Box variant="alert" title="❌ Document non reconnu">
          <span className="whitespace-pre-line">{errorMessage}</span>
        </Box>

        <div className="bg-panel border border-border rounded-xl p-4 mb-6">
          <div className="text-xs font-syne font-bold text-muted-foreground uppercase tracking-wider mb-2">📋 Vous cherchez ce document</div>
          <div className="bg-muted/20 border border-border rounded-lg p-6 text-center">
            <div className="text-4xl mb-2">📄</div>
            <div className="text-xs text-muted-foreground">
              Document officiel du consulat avec les motifs cochés A à L
            </div>
          </div>
        </div>

        <Button onClick={resetToUpload} className="w-full min-h-[52px]">Réessayer</Button>
      </div>
    );
  }

  // ═══ UNREADABLE ═══
  if (phase === "unreadable") {
    return (
      <div>
        <Eyebrow>Qualité insuffisante</Eyebrow>
        <BigTitle>Document illisible</BigTitle>
        <Box variant="alert" title="Problème de qualité">
          <span className="whitespace-pre-line">{errorMessage}</span>
        </Box>
        <Button onClick={resetToUpload} className="w-full min-h-[52px] mt-4">Réessayer</Button>
      </div>
    );
  }

  // ═══ PARTIAL EXTRACTION ═══
  if (phase === "partial" && editableData) {
    const updateField = (path: string, value: string) => {
      setEditableData((prev) => {
        if (!prev) return prev;
        const copy = JSON.parse(JSON.stringify(prev));
        const keys = path.split(".");
        let obj: any = copy;
        for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
        obj[keys[keys.length - 1]] = value;
        return copy;
      });
    };

    return (
      <div>
        <Eyebrow>Vérification requise</Eyebrow>
        <BigTitle>Vérifiez les informations extraites</BigTitle>
        <Desc>Nous avons lu ces informations. Vérifiez et corrigez si nécessaire :</Desc>

        <div className="space-y-3 mb-6">
          <EditField label="Votre nom" value={editableData.demandeur.nom || ""} onChange={(v) => updateField("demandeur.nom", v)} />
          <EditField label="Votre prénom" value={editableData.demandeur.prenom || ""} onChange={(v) => updateField("demandeur.prenom", v)} />
          <div>
            <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Type de visa</label>
            <select
              className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none"
              value={editableData.visa.type_visa}
              onChange={(e) => updateField("visa.type_visa", e.target.value)}
            >
              {Object.entries(VISA_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Motifs de refus</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MOTIF_LABELS).map(([code, label]) => {
                const selected = editableData.refus.motifs_coches.includes(code);
                return (
                  <button
                    key={code}
                    onClick={() => {
                      setEditableData((prev) => {
                        if (!prev) return prev;
                        const copy = JSON.parse(JSON.stringify(prev));
                        if (selected) {
                          copy.refus.motifs_coches = copy.refus.motifs_coches.filter((m: string) => m !== code);
                        } else {
                          copy.refus.motifs_coches.push(code);
                        }
                        copy.refus.motifs_enrichis = copy.refus.motifs_coches.map((c: string) => ({
                          code: c,
                          label: MOTIF_LABELS[c] || `Motif ${c}`,
                        }));
                        return copy;
                      });
                    }}
                    className={`text-xs font-syne font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                      selected
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {code} — {label}
                  </button>
                );
              })}
            </div>
          </div>
          <EditField label="Date du refus" value={editableData.refus.date_notification || ""} onChange={(v) => updateField("refus.date_notification", v)} placeholder="JJ/MM/AAAA" />
          <EditField label="Consulat" value={[editableData.consulat.nom, editableData.consulat.ville].filter(Boolean).join(", ") || ""} onChange={(v) => {
            const parts = v.split(",").map((s) => s.trim());
            updateField("consulat.nom", parts[0] || "");
            updateField("consulat.ville", parts[1] || "");
          }} />
        </div>

        <Button onClick={handleConfirm} className="w-full min-h-[52px]">
          Confirmer ces informations →
        </Button>
      </div>
    );
  }

  // ═══ SUCCESS ═══
  if (phase === "success" && extractedData) {
    return (
      <div>
        <Eyebrow>Qualification automatique</Eyebrow>
        <BigTitle>✅ Votre refus a été lu</BigTitle>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {/* Demandeur card */}
          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="text-2xl mb-2">👤</div>
            <div className="font-syne font-bold text-sm">
              {extractedData.demandeur.nom} {extractedData.demandeur.prenom}
            </div>
            {extractedData.demandeur.date_naissance && (
              <div className="text-xs text-muted-foreground">
                Né(e) le {extractedData.demandeur.date_naissance}
              </div>
            )}
            {extractedData.demandeur.nationalite && (
              <div className="text-xs text-muted-foreground">{extractedData.demandeur.nationalite}</div>
            )}
          </div>

          {/* Visa card */}
          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="text-2xl mb-2">🎓</div>
            <div className="font-syne font-bold text-sm">
              {VISA_LABELS[extractedData.visa.type_visa] || extractedData.visa.type_visa}
            </div>
            <div className="text-xs text-muted-foreground">
              {[extractedData.consulat.nom, extractedData.consulat.ville, extractedData.consulat.pays].filter(Boolean).join(" · ")}
            </div>
          </div>

          {/* Deadline card */}
          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="text-2xl mb-2">📅</div>
            <div className="font-syne font-bold text-sm">
              Refus notifié le
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              {formatDateLong(extractedData.refus.date_notification)}
            </div>
            {extractedData.delai_restant_jours !== null && (
              <div className={`font-syne font-bold text-sm ${
                extractedData.delai_restant_jours <= 7 ? "text-destructive" : extractedData.delai_restant_jours <= 15 ? "text-amber-500" : "text-green-500"
              }`}>
                ⏰ Il vous reste {extractedData.delai_restant_jours} jour{extractedData.delai_restant_jours > 1 ? "s" : ""} pour former votre recours
              </div>
            )}
          </div>

          {/* Motifs card */}
          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="text-2xl mb-2">⚖️</div>
            <div className="font-syne font-bold text-sm mb-2">Motifs détectés</div>
            <div className="space-y-1">
              {extractedData.refus.motifs_enrichis?.map((m: { code: string; label: string }) => (
                <div key={m.code} className="text-xs text-muted-foreground">
                  • Motif {m.code} — {m.label}
                </div>
              ))}
              {(!extractedData.refus.motifs_enrichis || extractedData.refus.motifs_enrichis.length === 0) && (
                <div className="text-xs text-muted-foreground italic">Aucun motif détecté</div>
              )}
            </div>
          </div>
        </div>

        {extractedData.delai_restant_jours !== null && extractedData.delai_restant_jours < 0 && (
          <Box variant="alert" title="🚫 Délai expiré">
            Le délai de recours de 30 jours est dépassé. Consultez un avocat pour explorer d'autres options.
          </Box>
        )}

        <Button onClick={handleConfirm} className="w-full min-h-[52px] mb-3">
          ✓ Ces informations sont correctes → Continuer
        </Button>
        <button
          onClick={() => {
            setEditableData(JSON.parse(JSON.stringify(extractedData)));
            setPhase("partial");
          }}
          className="w-full text-center text-xs text-primary hover:underline font-syne font-semibold"
        >
          Modifier une information
        </button>
      </div>
    );
  }

  return null;
}

function EditField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">{label}</label>
      <input
        className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55 focus:bg-primary/[0.07]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
