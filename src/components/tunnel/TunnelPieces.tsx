import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight, ArrowLeft, Camera, FolderOpen, CheckCircle2,
  AlertTriangle, Info, Globe, X,
} from "lucide-react";
import type { TunnelPieceFile, TunnelOcrData } from "@/hooks/useTunnelState";

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
  pieces: TunnelPieceFile[];
  onAddPiece: (piece: TunnelPieceFile) => void;
  onRemovePiece: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const VISA_LABELS: Record<string, string> = {
  court_sejour: "Court séjour Schengen",
  etudiant: "Long séjour étudiant",
  conjoint_francais: "Conjoint de Français",
  salarie: "Salarié / Travail",
  passeport_talent: "Passeport talent",
  visiteur: "Visiteur / Parent d'enfant français",
};

export default function TunnelPieces({
  ocrData, pieces, onAddPiece, onRemovePiece, onNext, onBack,
}: TunnelPiecesProps) {
  const [allPieces, setAllPieces] = useState<PieceRequise[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

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

  const handleFile = useCallback((file: File, nomPiece: string) => {
    const piece: TunnelPieceFile = {
      id: `piece-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      nomPiece,
      typePiece: "obligatoire",
    };
    onAddPiece(piece);
    setUploadingFor(null);
  }, [onAddPiece]);

  const triggerUpload = (nomPiece: string, camera = false) => {
    setUploadingFor(nomPiece);
    setTimeout(() => {
      if (camera) cameraRef.current?.click();
      else inputRef.current?.click();
    }, 0);
  };

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
          Pièces justificatives
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Ajoutez les documents qui renforcent votre recours. Les pièces obligatoires sont indispensables.
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
                  onUpload={() => triggerUpload(p.nom_piece)}
                  onCamera={() => triggerUpload(p.nom_piece, true)}
                  onRemove={(id) => onRemovePiece(id)}
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
                    onUpload={() => triggerUpload(p.nom_piece)}
                    onCamera={() => triggerUpload(p.nom_piece, true)}
                    onRemove={(id) => onRemovePiece(id)}
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
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadingFor) handleFile(file, uploadingFor);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadingFor) handleFile(file, uploadingFor);
            e.target.value = "";
          }}
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

function PieceRow({ piece, uploaded, onUpload, onCamera, onRemove }: {
  piece: PieceRequise;
  uploaded?: TunnelPieceFile;
  onUpload: () => void;
  onCamera: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={`border rounded-xl p-3 transition-all ${
      uploaded ? "border-green-500/30 bg-green-500/[0.04]" : "border-border bg-card"
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-syne font-bold text-sm">{piece.nom_piece}</span>
            {uploaded && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
            {piece.traduction_requise && (
              <span className="inline-flex items-center gap-1 text-[0.55rem] text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                <Globe className="w-3 h-3" /> Traduction
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{piece.description_simple}</p>
        </div>
      </div>

      {uploaded ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-green-400 truncate flex-1">✓ {uploaded.file.name}</span>
          <button onClick={() => onRemove(uploaded.id)} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4" />
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
