import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight, ArrowLeft, Camera, FolderOpen, CheckCircle2,
  AlertTriangle, Info, Globe, X, Loader2,
} from "lucide-react";
import type { TunnelPieceFile, TunnelOcrData, TunnelIdentityData } from "@/hooks/useTunnelState";

interface PieceRequise {
  id: string;
  nom_piece: string;
  description_simple: string;
  pourquoi_necessaire: string | null;
  obligatoire: boolean;
  conditionnel: boolean;
  condition_declenchement: string | null;
  alternative_possible: string | null;
  format_accepte: string;
  taille_max_mo: number;
  traduction_requise: boolean;
  apostille_requise: boolean;
  original_requis: boolean;
  type_visa: string;
  motifs_concernes: string[];
  ordre_affichage: number;
  note: string | null;
}

interface TunnelPiecesProps {
  ocrData: TunnelOcrData;
  identity: TunnelIdentityData;
  pieces: TunnelPieceFile[];
  onAddPiece: (piece: TunnelPieceFile) => void;
  onRemovePiece: (id: string) => void;
  onPassportExtracted: (passportNumber: string) => void;
  onNext: () => void;
  onBack: () => void;
}

type AnalyzingState = Record<string, { loading: boolean; error: string | null }>;

export default function TunnelPieces({
  ocrData, identity, pieces, onAddPiece, onRemovePiece, onPassportExtracted, onNext, onBack,
}: TunnelPiecesProps) {
  const [allPieces, setAllPieces] = useState<PieceRequise[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<AnalyzingState>({});

  useEffect(() => {
    supabase
      .from("pieces_requises")
      .select("*")
      .eq("actif", true)
      .order("ordre_affichage", { ascending: true })
      .then(({ data }) => {
        if (data) setAllPieces(data as PieceRequise[]);
        setLoading(false);
      });
  }, []);

  const visaType = ocrData.visaType;
  const motifCodes = ocrData.motifsRefus;

  const { mandatory, recommended } = useMemo(() => {
    const mandatory = allPieces.filter(
      (p) =>
        (p.type_visa === "tous" && p.obligatoire && p.motifs_concernes.includes("tous")) ||
        (p.type_visa === visaType && p.obligatoire && !p.conditionnel)
    );

    const mandatoryIds = new Set(mandatory.map((p) => p.id));

    const recommended = allPieces.filter((p) => {
      if (mandatoryIds.has(p.id)) return false;
      const matchesMotif = motifCodes.some((c) => p.motifs_concernes.includes(c.toUpperCase()));
      return matchesMotif && !p.obligatoire;
    });

    return { mandatory, recommended };
  }, [allPieces, visaType, motifCodes]);

  const uploadedNames = new Set(pieces.map((p) => p.nomPiece));
  const mandatoryMissing = mandatory.filter((p) => !uploadedNames.has(p.nom_piece));

  const analyzeFile = useCallback(async (file: File, nomPiece: string) => {
    const acceptedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!acceptedTypes.includes(file.type)) {
      setAnalyzing((prev) => ({ ...prev, [nomPiece]: { loading: false, error: "Format non accepté. Seuls PDF, JPG et PNG sont acceptés." } }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAnalyzing((prev) => ({ ...prev, [nomPiece]: { loading: false, error: "Fichier trop volumineux (max 10 Mo)." } }));
      return;
    }

    setAnalyzing((prev) => ({ ...prev, [nomPiece]: { loading: true, error: null } }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("nom_piece", nomPiece);
      formData.append("tunnel_mode", "true");
      formData.append("owner_first_name", identity.firstName);
      formData.append("owner_last_name", identity.lastName);
      formData.append("owner_passport_number", identity.passportNumber || "");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/check-document-ocr`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: formData,
      });

      const data = await res.json();

      if (data.accepted) {
        const piece: TunnelPieceFile = {
          id: `piece-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          nomPiece,
          typePiece: "obligatoire",
          scoreQualite: data.score,
          statutOcr: "accepte",
          extractedPassportNumber: data.passportNumber || undefined,
        };
        onAddPiece(piece);
        if (data.passportNumber) {
          onPassportExtracted(String(data.passportNumber).toUpperCase().replace(/\s+/g, ""));
        }
        setAnalyzing((prev) => ({ ...prev, [nomPiece]: { loading: false, error: null } }));
      } else {
        const errorMsg = data.rejectionMessage || data.identityWarning || data.typeMismatchWarning || "Document rejeté. Veuillez réessayer.";
        setAnalyzing((prev) => ({ ...prev, [nomPiece]: { loading: false, error: errorMsg } }));
      }
    } catch (err) {
      console.error("OCR analysis error:", err);
      setAnalyzing((prev) => ({ ...prev, [nomPiece]: { loading: false, error: "Erreur lors de l'analyse. Veuillez réessayer." } }));
    }
  }, [identity, onAddPiece, onPassportExtracted]);

  const triggerUpload = (nomPiece: string, camera = false) => {
    setUploadingFor(nomPiece);
    setTimeout(() => {
      if (camera) cameraRef.current?.click();
      else inputRef.current?.click();
    }, 0);
  };

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingFor) {
      analyzeFile(file, uploadingFor);
      setUploadingFor(null);
    }
    e.target.value = "";
  }, [uploadingFor, analyzeFile]);

  return (
    <div className="fixed inset-0 bg-background overflow-y-auto">
      <div className="max-w-[520px] mx-auto px-5 py-8 pb-32">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          <span className="text-xs text-muted-foreground font-dm">Étape 5 sur 7</span>
        </div>

        <h2 className="font-fraunces text-[clamp(1.3rem,3.5vw,1.8rem)] text-cream mb-2 leading-tight">
          Renseignez les pièces suivantes pour contester
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Les pièces obligatoires sont indispensables pour renforcer votre recours.
        </p>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Mandatory */}
            <Section
              title="Pièces obligatoires"
              icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
              count={mandatory.length}
              badgeVariant="destructive"
            >
              {mandatory.map((p) => (
                <PieceRow
                  key={p.id}
                  piece={p}
                  uploaded={pieces.find((up) => up.nomPiece === p.nom_piece)}
                  analyzingState={analyzing[p.nom_piece]}
                  onUpload={() => triggerUpload(p.nom_piece)}
                  onCamera={() => triggerUpload(p.nom_piece, true)}
                  onRemove={(id) => {
                    onRemovePiece(id);
                    setAnalyzing((prev) => {
                      const next = { ...prev };
                      delete next[p.nom_piece];
                      return next;
                    });
                  }}
                  onRetry={() => triggerUpload(p.nom_piece)}
                />
              ))}
            </Section>

            {/* Recommended */}
            {recommended.length > 0 && (
              <Section
                title="Pièces recommandées"
                icon={<Info className="w-4 h-4 text-muted-foreground" />}
                count={recommended.length}
                badgeVariant="secondary"
              >
                {recommended.map((p) => (
                  <PieceRow
                    key={p.id}
                    piece={p}
                    uploaded={pieces.find((up) => up.nomPiece === p.nom_piece)}
                    analyzingState={analyzing[p.nom_piece]}
                    onUpload={() => triggerUpload(p.nom_piece)}
                    onCamera={() => triggerUpload(p.nom_piece, true)}
                    onRemove={(id) => {
                      onRemovePiece(id);
                      setAnalyzing((prev) => {
                        const next = { ...prev };
                        delete next[p.nom_piece];
                        return next;
                      });
                    }}
                    onRetry={() => triggerUpload(p.nom_piece)}
                  />
                ))}
              </Section>
            )}
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileInput}
        />
        <input
          ref={cameraRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
        />

        {/* Bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border px-5 py-4">
          <div className="max-w-[520px] mx-auto">
            {mandatoryMissing.length > 0 && (
              <p className="text-xs text-amber-400 mb-2 text-center">
                ⚠️ {mandatoryMissing.length} pièce{mandatoryMissing.length > 1 ? "s" : ""} obligatoire{mandatoryMissing.length > 1 ? "s" : ""} manquante{mandatoryMissing.length > 1 ? "s" : ""}
              </p>
            )}
            <Button
              onClick={onNext}
              size="lg"
              className="w-full h-14 text-base font-syne font-bold rounded-2xl gap-2"
              disabled={mandatoryMissing.length > 0}
            >
              Générer ma lettre de recours
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────

function Section({ title, icon, count, badgeVariant, children }: {
  title: string; icon: React.ReactNode; count: number;
  badgeVariant: "destructive" | "secondary"; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="font-syne font-bold text-sm">{title}</span>
        <Badge variant={badgeVariant} className="text-[0.6rem] h-5">
          {count}
        </Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PieceRow({ piece, uploaded, analyzingState, onUpload, onCamera, onRemove, onRetry }: {
  piece: PieceRequise;
  uploaded?: TunnelPieceFile;
  analyzingState?: { loading: boolean; error: string | null };
  onUpload: () => void;
  onCamera: () => void;
  onRemove: (id: string) => void;
  onRetry: () => void;
}) {
  const isAnalyzing = analyzingState?.loading;
  const hasError = analyzingState?.error;

  return (
    <div className={`border rounded-xl p-3 transition-all ${
      uploaded ? "border-green-500/30 bg-green-500/[0.04]"
        : hasError ? "border-destructive/30 bg-destructive/[0.04]"
        : "border-border bg-card"
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-syne font-bold text-sm">{piece.nom_piece}</span>
            {uploaded && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
            {isAnalyzing && <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />}
            {piece.traduction_requise && (
              <span className="inline-flex items-center gap-1 text-[0.55rem] text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                <Globe className="w-3 h-3" /> Traduction
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{piece.description_simple}</p>
        </div>
      </div>

      {isAnalyzing ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-primary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Vérification en cours…</span>
        </div>
      ) : uploaded ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-green-400 truncate flex-1">✓ {uploaded.file.name} — {uploaded.scoreQualite ? `${uploaded.scoreQualite}/100` : "OK"}</span>
          <button onClick={() => onRemove(uploaded.id)} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : hasError ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-destructive whitespace-pre-line">{hasError}</p>
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          >
            Réessayer
          </button>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            onClick={onCamera}
            className="sm:hidden flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" /> Photo
          </button>
          <button
            onClick={onUpload}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-foreground/[0.06] border border-border text-foreground hover:bg-foreground/10 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Fichier
          </button>
        </div>
      )}
    </div>
  );
}
