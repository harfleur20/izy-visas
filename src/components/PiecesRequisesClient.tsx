import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DocumentUploader, type UploadedPiece } from "@/components/DocumentUploader";
import { SectionLabel, Box } from "@/components/ui-custom";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, FileText, Info, Globe, Stamp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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

interface PiecesRequisesClientProps {
  visaType: string;
  motifRefus: string;
  dossierId: string;
  userId: string;
  uploadedPieces: UploadedPiece[];
  onPieceUploaded: (piece: UploadedPiece) => void;
  onPieceRemoved: (id: string) => void;
  onMandatoryStatusChange?: (status: MandatoryPiecesStatus) => void;
}

type MandatoryPiecesStatus = {
  loading: boolean;
  total: number;
  missing: string[];
};

const hasBlockingWarning = (piece: UploadedPiece) =>
  Boolean(piece.typeMismatchWarning || piece.decisionWarning || piece.identityWarning);

const VISA_LABELS: Record<string, string> = {
  court_sejour: "Court séjour Schengen",
  etudiant: "Long séjour étudiant",
  conjoint_francais: "Conjoint de Français",
  salarie: "Salarié / Travail",
  passeport_talent: "Passeport talent",
  visiteur: "Visiteur / Parent d'enfant français",
};

const MOTIF_LABELS: Record<string, string> = {
  A: "Document non valide",
  B: "But du séjour non justifié",
  C: "Ressources insuffisantes",
  D: "Assurance absente",
  E: "Hébergement non justifié",
  F: "Doute sur la volonté de retour",
  G: "Signalement SIS",
  H: "Ordre public",
  I: "Séjour irrégulier antérieur",
  J: "Intention matrimoniale non établie",
  K: "Dossier incomplet",
  L: "Appréciation globale défavorable",
};

export function PiecesRequisesClient({
  visaType,
  motifRefus,
  dossierId,
  userId,
  uploadedPieces,
  onPieceUploaded,
  onPieceRemoved,
  onMandatoryStatusChange,
}: PiecesRequisesClientProps) {
  const [allPieces, setAllPieces] = useState<PieceRequise[]>([]);
  const [loading, setLoading] = useState(true);
  const [uncheckedOptional, setUncheckedOptional] = useState<Set<string>>(new Set());
  const [uncheckedMotif, setUncheckedMotif] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchPieces = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("pieces_requises")
        .select("*")
        .eq("actif", true)
        .order("ordre_affichage", { ascending: true });

      if (!error && data) {
        setAllPieces(data as PieceRequise[]);
      }
      setLoading(false);
    };
    fetchPieces();
  }, []);

  // Classify pieces into 4 sections
  const { section1, section2, section3, section4 } = useMemo(() => {
    const motifCode = motifRefus.toUpperCase();

    // Section 1: Pièces obligatoires du recours (type_visa = "tous", obligatoire, motifs = tous)
    const section1 = allPieces.filter(
      (p) =>
        p.type_visa === "tous" &&
        p.obligatoire &&
        p.motifs_concernes.includes("tous")
    );

    // Section 2: Pièces obligatoires selon le type de visa
    const section2 = allPieces.filter(
      (p) =>
        p.type_visa === visaType &&
        p.obligatoire &&
        !p.conditionnel
    );

    // Section 3: Pièces recommandées selon le motif de refus
    const section3 = allPieces.filter((p) => {
      const matchesMotif = p.motifs_concernes.includes(motifCode);
      const isMotifSpecific = p.type_visa === "tous" && !p.obligatoire && matchesMotif;
      const isConditionalVisa = p.type_visa === visaType && p.conditionnel && matchesMotif;
      const isConditionalAll = p.type_visa === "tous" && p.conditionnel && matchesMotif;
      return isMotifSpecific || isConditionalVisa || isConditionalAll;
    });

    // Section 4: Pièces complémentaires optionnelles
    const usedIds = new Set([
      ...section1.map((p) => p.id),
      ...section2.map((p) => p.id),
      ...section3.map((p) => p.id),
    ]);

    const section4 = allPieces.filter((p) => {
      if (usedIds.has(p.id)) return false;
      // Optional pieces for this visa type or conditional pieces for this visa
      const forVisa = p.type_visa === visaType && !p.obligatoire;
      const conditionalVisa = p.type_visa === visaType && p.conditionnel;
      return forVisa || conditionalVisa;
    });

    return { section1, section2, section3, section4 };
  }, [allPieces, visaType, motifRefus]);

  useEffect(() => {
    if (!onMandatoryStatusChange) return;

    const requiredNames = [...section1, ...section2].map((piece) => piece.nom_piece);
    const acceptedNames = new Set(
      uploadedPieces
        .filter((piece) => piece.status === "accepted" && !hasBlockingWarning(piece))
        .map((piece) => piece.name),
    );

    onMandatoryStatusChange({
      loading,
      total: requiredNames.length,
      missing: requiredNames.filter((name) => !acceptedNames.has(name)),
    });
  }, [loading, onMandatoryStatusChange, section1, section2, uploadedPieces]);

  const toggleMotifPiece = (id: string) => {
    setUncheckedMotif((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOptionalPiece = (id: string) => {
    setUncheckedOptional((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPieces = section1.length + section2.length + section3.length + section4.length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      <Box variant="info" title={`Pièces requises — ${VISA_LABELS[visaType] || visaType} · Motif ${motifRefus.toUpperCase()}`}>
        {totalPieces} pièces identifiées : {section1.length} obligatoires recours + {section2.length} obligatoires visa + {section3.length} recommandées motif {motifRefus.toUpperCase()} + {section4.length} optionnelles
      </Box>

      {visaType === "conjoint_francais" && (
        <Box variant="warn" title="⚖️ Rappel juridique obligatoire">
          Le visa conjoint de Français ne peut être refusé que dans 3 cas : fraude, annulation du mariage, menace pour l'ordre public. Tout autre motif est illégal.
        </Box>
      )}

      {/* Section 1 — Obligatoires recours */}
      <PieceSection
        title="Pièces obligatoires du recours"
        subtitle="Toujours requises — non décochtables"
        icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
        badgeVariant="destructive"
        
        pieces={section1}
        uploadedPieces={uploadedPieces}
        dossierId={dossierId}
        userId={userId}
        onPieceUploaded={onPieceUploaded}
        onPieceRemoved={onPieceRemoved}
        locked
      />

      {/* Section 2 — Obligatoires visa */}
      {section2.length > 0 && (
        <PieceSection
          title={`Pièces obligatoires — ${VISA_LABELS[visaType] || visaType}`}
          subtitle="Requises pour votre type de visa — non décochtables"
          icon={<FileText className="w-4 h-4 text-primary" />}
          badgeVariant="default"
          
          pieces={section2}
          uploadedPieces={uploadedPieces}
          dossierId={dossierId}
          userId={userId}
          onPieceUploaded={onPieceUploaded}
          onPieceRemoved={onPieceRemoved}
          locked
        />
      )}

      {/* Section 3 — Recommandées motif */}
      {section3.length > 0 && (
        <PieceSection
          title={`Pièces recommandées — Motif ${motifRefus.toUpperCase()} (${MOTIF_LABELS[motifRefus.toUpperCase()] || ""})`}
          subtitle="Pré-cochées — décochtables avec avertissement"
          icon={<CheckCircle2 className="w-4 h-4 text-yellow-500" />}
          badgeVariant="secondary"
          
          pieces={section3}
          uploadedPieces={uploadedPieces}
          dossierId={dossierId}
          userId={userId}
          onPieceUploaded={onPieceUploaded}
          onPieceRemoved={onPieceRemoved}
          unchecked={uncheckedMotif}
          onToggle={toggleMotifPiece}
          showWarningOnUncheck
        />
      )}

      {/* Section 4 — Optionnelles */}
      {section4.length > 0 && (
        <PieceSection
          title="Pièces complémentaires optionnelles"
          subtitle="Non cochées par défaut — choisissez librement"
          icon={<Info className="w-4 h-4 text-muted-foreground" />}
          badgeVariant="outline"
          
          pieces={section4}
          uploadedPieces={uploadedPieces}
          dossierId={dossierId}
          userId={userId}
          onPieceUploaded={onPieceUploaded}
          onPieceRemoved={onPieceRemoved}
          unchecked={uncheckedOptional}
          onToggle={toggleOptionalPiece}
          defaultUnchecked
        />
      )}
    </div>
  );
}

// ── Section component ─────────────────────────────────────────────────────

interface PieceSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  pieces: PieceRequise[];
  uploadedPieces: UploadedPiece[];
  dossierId: string;
  userId: string;
  onPieceUploaded: (piece: UploadedPiece) => void;
  onPieceRemoved: (id: string) => void;
  locked?: boolean;
  unchecked?: Set<string>;
  onToggle?: (id: string) => void;
  showWarningOnUncheck?: boolean;
  defaultUnchecked?: boolean;
}

function PieceSection({
  title,
  subtitle,
  icon,
  badgeVariant,
  pieces,
  uploadedPieces,
  dossierId,
  userId,
  onPieceUploaded,
  onPieceRemoved,
  locked,
  unchecked,
  onToggle,
  showWarningOnUncheck,
  defaultUnchecked,
}: PieceSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <SectionLabel>{title}</SectionLabel>
        <Badge variant={badgeVariant} className="text-[0.6rem] h-5">
          {pieces.length} pièce{pieces.length > 1 ? "s" : ""}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>

      <Accordion type="multiple" className="space-y-2">
        {pieces.map((piece, idx) => {
          const isChecked = locked
            ? true
            : defaultUnchecked
            ? unchecked ? !unchecked.has(piece.id) : false
            : unchecked ? !unchecked.has(piece.id) : true;

          return (
            <PieceItem
              key={piece.id}
              piece={piece}
              checked={isChecked}
              locked={locked}
              onToggle={onToggle}
              showWarningOnUncheck={showWarningOnUncheck}
              uploadedPieces={uploadedPieces}
              dossierId={dossierId}
              userId={userId}
              onPieceUploaded={onPieceUploaded}
              onPieceRemoved={onPieceRemoved}
            />
          );
        })}
      </Accordion>
    </div>
  );
}

// ── Individual piece item ─────────────────────────────────────────────────

function PieceItem({
  piece,
  checked,
  locked,
  onToggle,
  showWarningOnUncheck,
  uploadedPieces,
  dossierId,
  userId,
  onPieceUploaded,
  onPieceRemoved,
}: {
  piece: PieceRequise;
  checked: boolean;
  locked?: boolean;
  onToggle?: (id: string) => void;
  showWarningOnUncheck?: boolean;
  uploadedPieces: UploadedPiece[];
  dossierId: string;
  userId: string;
  onPieceUploaded: (piece: UploadedPiece) => void;
  onPieceRemoved: (id: string) => void;
}) {
  const piecesForThis = uploadedPieces.filter((p) => p.name === piece.nom_piece);
  const isAccepted = piecesForThis.some((p) => p.status === "accepted");

  return (
    <AccordionItem
      value={piece.id}
      className={`border rounded-xl transition-all ${
        !checked
          ? "opacity-50 border-border bg-muted/30"
          : isAccepted
          ? "border-green-500/30 bg-green-500/[0.04]"
          : "border-border bg-card"
      }`}
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center gap-3 w-full">
          {!locked && onToggle && (
            <Checkbox
              checked={checked}
              onCheckedChange={() => onToggle(piece.id)}
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0"
            />
          )}
          {locked && (
            <div className="w-5 h-5 rounded bg-destructive/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[0.6rem] font-bold text-destructive">!</span>
            </div>
          )}
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-syne font-bold text-sm">{piece.nom_piece}</span>
              {isAccepted && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
              {piece.traduction_requise && (
                <span className="inline-flex items-center gap-1 text-[0.6rem] text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                  <Globe className="w-3 h-3" /> Traduction
                </span>
              )}
              {piece.apostille_requise && (
                <span className="inline-flex items-center gap-1 text-[0.6rem] text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded">
                  <Stamp className="w-3 h-3" /> Apostille
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{piece.description_simple}</p>
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-4 pb-4">
        {!checked && showWarningOnUncheck && (
          <Box variant="alert" title="⚠️ Pièce décochée">
            Cette pièce est recommandée pour contrer le motif de refus. Ne pas la fournir peut affaiblir votre recours.
          </Box>
        )}

        {/* Description & pourquoi */}
        <div className="space-y-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-foreground mb-1">📋 Description</p>
            <p className="text-xs text-muted-foreground">{piece.description_simple}</p>
          </div>

          {piece.pourquoi_necessaire && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">❓ Pourquoi en a-t-on besoin ?</p>
              <p className="text-xs text-muted-foreground">{piece.pourquoi_necessaire}</p>
            </div>
          )}

          {piece.alternative_possible && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">🔄 Alternative acceptée</p>
              <p className="text-xs text-muted-foreground">{piece.alternative_possible}</p>
            </div>
          )}

          {piece.condition_declenchement && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">⚙️ Condition</p>
              <p className="text-xs text-muted-foreground">{piece.condition_declenchement}</p>
            </div>
          )}

          {piece.note && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">📌 Note</p>
              <p className="text-xs text-muted-foreground">{piece.note}</p>
            </div>
          )}

          {/* Warnings */}
          <div className="flex flex-wrap gap-2">
            {piece.traduction_requise && (
              <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <Globe className="w-3.5 h-3.5 text-yellow-600" />
                <span className="text-xs text-yellow-700">Traduction assermentée requise si non en français</span>
              </div>
            )}
            {piece.apostille_requise && (
              <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                <Stamp className="w-3.5 h-3.5 text-orange-600" />
                <span className="text-xs text-orange-700">Apostille requise (Convention de La Haye)</span>
              </div>
            )}
            {piece.original_requis && (
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-primary">Original ou copie certifiée conforme requis</span>
              </div>
            )}
          </div>
        </div>

        {/* Upload zone */}
        {checked && (
          <DocumentUploader
            dossierId={dossierId}
            userId={userId}
            typePiece={piece.obligatoire ? "obligatoire" : "optionnelle"}
            isDecisionRefus={piece.nom_piece.toLowerCase().includes("décision de refus")}
            nomPiece={piece.nom_piece}
            pieces={piecesForThis}
            onPieceUploaded={onPieceUploaded}
            onPieceRemoved={onPieceRemoved}
            maxFiles={piece.nom_piece.toLowerCase().includes("décision de refus") ? 1 : 5}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
