import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, X, FileCheck, FileWarning, RotateCcw, Camera, FolderOpen } from "lucide-react";

export interface UploadedPiece {
  id: string;
  name: string;
  status: "uploading" | "analyzing" | "accepted" | "rejected" | "correcting";
  score: number;
  pages: number;
  rejectionCode?: string;
  rejectionMessage?: string;
  canAutoCorrect?: boolean;
  fileUrl?: string;
  storagePath?: string;
  decisionWarning?: string;
  typeMismatchWarning?: string;
  languageNotice?: string;
  typeDocumentDetecte?: string;
  file?: File;
}

interface DocumentUploaderProps {
  dossierId: string;
  userId: string;
  typePiece?: "obligatoire" | "optionnelle" | "complementaire";
  isDecisionRefus?: boolean;
  nomPiece?: string;
  onPieceUploaded: (piece: UploadedPiece) => void;
  onPieceRemoved?: (id: string) => void;
  pieces: UploadedPiece[];
  maxFiles?: number;
}

function qualityIndicator(score: number) {
  if (score >= 85) return { icon: "🟢", label: "Excellente qualité", color: "text-green-500" };
  if (score >= 70) return { icon: "🟡", label: "Bonne qualité", color: "text-yellow-500" };
  if (score >= 60) return { icon: "🟠", label: "Qualité suffisante", color: "text-orange-500" };
  return { icon: "🔴", label: "Qualité insuffisante", color: "text-destructive" };
}

export function DocumentUploader({
  dossierId,
  userId,
  typePiece = "optionnelle",
  isDecisionRefus = false,
  nomPiece,
  onPieceUploaded,
  onPieceRemoved,
  pieces,
  maxFiles = 20,
}: DocumentUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const uploadAndAnalyze = useCallback(async (file: File, customName?: string) => {
    const name = customName || nomPiece || file.name.replace(/\.[^.]+$/, "");
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const tempPiece: UploadedPiece = {
      id: tempId,
      name,
      status: "uploading",
      score: 0,
      pages: 0,
      file,
    };
    onPieceUploaded(tempPiece);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dossier_id", dossierId);
      formData.append("user_id", userId);
      formData.append("nom_piece", name);
      formData.append("type_piece", typePiece);
      if (isDecisionRefus) formData.append("is_decision_refus", "true");

      const { data, error } = await supabase.functions.invoke("check-document-ocr", {
        body: formData,
      });

      if (error) throw error;

      // The edge function now returns 202 with just the piece ID
      // The piece is in "analyzing" status — realtime will update it
      const analyzingPiece: UploadedPiece = {
        id: data.id || tempId,
        name,
        status: "analyzing",
        score: 0,
        pages: 0,
        fileUrl: data.fileUrl,
        storagePath: data.storagePath,
        file,
      };

      onPieceUploaded(analyzingPiece);
      toast.info(`${name} — Analyse OCR en cours…`);
    } catch (err: any) {
      console.error("Upload error:", err);
      onPieceUploaded({
        ...tempPiece,
        status: "rejected",
        rejectionCode: "upload_error",
        rejectionMessage: "❌ Erreur lors de l'upload. Veuillez réessayer.",
      });
      toast.error("Erreur lors de l'upload du document");
    }
  }, [dossierId, userId, typePiece, isDecisionRefus, nomPiece, onPieceUploaded]);

  const handleAutoCorrect = useCallback(async (piece: UploadedPiece) => {
    if (!piece.file) return;

    onPieceUploaded({ ...piece, status: "correcting" });

    try {
      const formData = new FormData();
      formData.append("file", piece.file);
      formData.append("dossier_id", dossierId);
      formData.append("user_id", userId);
      formData.append("nom_piece", piece.name);
      formData.append("type_piece", typePiece);
      formData.append("auto_correct", "true");
      if (isDecisionRefus) formData.append("is_decision_refus", "true");

      const { data, error } = await supabase.functions.invoke("check-document-ocr", {
        body: formData,
      });

      if (error) throw error;

      // Same async pattern — piece will be updated via realtime
      onPieceUploaded({
        id: data.id || piece.id,
        name: piece.name,
        status: "analyzing",
        score: 0,
        pages: 0,
        fileUrl: data.fileUrl,
        storagePath: data.storagePath,
        file: piece.file,
      });
      toast.info(`${piece.name} — Correction et analyse en cours…`);
    } catch (err) {
      console.error("Auto-correct error:", err);
      onPieceUploaded({ ...piece, status: "rejected", canAutoCorrect: false });
      toast.error("Erreur lors de la correction automatique");
    }
  }, [dossierId, userId, typePiece, isDecisionRefus, onPieceUploaded]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const remaining = maxFiles - pieces.length;
    const toUpload = Array.from(files).slice(0, Math.max(0, remaining));
    toUpload.forEach((f) => uploadAndAnalyze(f));
  }, [pieces.length, maxFiles, uploadAndAnalyze]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="space-y-4">
      {/* Desktop: Drop zone */}
      <div className="hidden sm:block">
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            dragOver
              ? "border-primary bg-primary/[0.08]"
              : "border-border hover:border-muted-foreground/30"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">
            <strong className="text-foreground">Glissez vos documents ici</strong> ou cliquez pour sélectionner
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, JPG, PNG — Max 10 Mo par fichier — Contrôle qualité OCR automatique
          </p>
        </div>
      </div>

      {/* Mobile: Two buttons */}
      <div className="sm:hidden flex flex-col gap-3">
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full min-h-[52px] rounded-xl bg-primary/[0.15] border border-primary-hover/30 text-primary-hover font-syne font-bold text-sm transition-all active:scale-[0.98]"
        >
          <Camera className="w-5 h-5" />
          📷 Prendre une photo
        </button>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full min-h-[52px] rounded-xl bg-foreground/[0.06] border border-border-2 text-foreground font-syne font-bold text-sm transition-all active:scale-[0.98]"
        >
          <FolderOpen className="w-5 h-5" />
          📁 Choisir un fichier
        </button>
        <p className="text-xs text-muted-foreground text-center">
          PDF, JPG, PNG — Max 10 Mo — Contrôle qualité OCR automatique
        </p>
      </div>

      {/* Hidden inputs */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Uploaded pieces list */}
      {pieces.length > 0 && (
        <div className="space-y-2">
          {pieces.map((piece) => (
            <PieceCard
              key={piece.id}
              piece={piece}
              onRemove={onPieceRemoved}
              onAutoCorrect={handleAutoCorrect}
              onConfirmMismatch={(p) => {
                onPieceUploaded({
                  ...p,
                  typeMismatchWarning: undefined,
                  decisionWarning: undefined,
                });
                toast.success(`${p.name} confirmée`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Individual piece card ───────────────────────────────────────────────────

function PieceCard({
  piece,
  onRemove,
  onAutoCorrect,
  onConfirmMismatch,
}: {
  piece: UploadedPiece;
  onRemove?: (id: string) => void;
  onAutoCorrect: (piece: UploadedPiece) => void;
  onConfirmMismatch?: (piece: UploadedPiece) => void;
}) {
  const isLoading = piece.status === "uploading" || piece.status === "analyzing" || piece.status === "correcting";
  const isAccepted = piece.status === "accepted";
  const isRejected = piece.status === "rejected";

  const quality = isAccepted ? qualityIndicator(piece.score) : null;

  return (
    <div
      className={`border rounded-xl p-3 sm:p-4 transition-all ${
        isAccepted
          ? "border-green-500/30 bg-green-500/[0.04]"
          : isRejected
          ? "border-destructive/30 bg-destructive/[0.04]"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="mt-0.5 flex-shrink-0">
          {isLoading && (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          {isAccepted && <FileCheck className="w-5 h-5 text-green-500" />}
          {isRejected && <FileWarning className="w-5 h-5 text-destructive" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="font-syne font-bold text-sm truncate">{piece.name}</span>
            {quality && (
              <span className={`text-xs ${quality.color}`}>
                {quality.icon} {quality.label}
              </span>
            )}
          </div>

          {/* Loading states */}
          {piece.status === "uploading" && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Upload en cours…</p>
              <Progress value={30} className="h-1" />
            </div>
          )}
          {piece.status === "analyzing" && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Analyse OCR en cours…</p>
              <Progress value={70} className="h-1" />
            </div>
          )}
          {piece.status === "correcting" && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Correction automatique en cours…</p>
              <Progress value={50} className="h-1" />
            </div>
          )}

          {/* Accepted */}
          {isAccepted && (
            <div className="mt-1">
              <p className="text-xs text-muted-foreground">
                Qualité : <strong className="text-foreground">{piece.score}/100</strong>
                {" · "}{piece.pages} page{piece.pages > 1 ? "s" : ""} détectée{piece.pages > 1 ? "s" : ""}
              </p>
              {piece.score >= 60 && piece.score < 70 && (
                <p className="text-xs text-orange-500 mt-1">
                  ⚠️ Ce document est de qualité limite. La commission devrait pouvoir le lire mais nous vous recommandons de refaire la photo si possible.
                </p>
              )}
              {piece.languageNotice && (
                <p className="text-xs text-muted-foreground mt-1">{piece.languageNotice}</p>
              )}
              {piece.typeMismatchWarning && (
                <div className="mt-2 bg-accent/30 border border-accent/50 rounded-lg p-3">
                  <p className="text-xs text-foreground">{piece.typeMismatchWarning}</p>
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <Button variant="outline" size="sm" className="text-xs h-10 sm:h-7" onClick={() => onConfirmMismatch?.(piece)}>
                      Confirmer
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-10 sm:h-7" onClick={() => onRemove?.(piece.id)}>
                      Changer le fichier
                    </Button>
                  </div>
                </div>
              )}
              {piece.decisionWarning && (
                <div className="mt-2 bg-accent/30 border border-accent/50 rounded-lg p-3">
                  <p className="text-xs text-foreground">{piece.decisionWarning}</p>
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <Button variant="outline" size="sm" className="text-xs h-10 sm:h-7" onClick={() => onConfirmMismatch?.(piece)}>
                      Confirmer quand même
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-10 sm:h-7" onClick={() => onRemove?.(piece.id)}>
                      Changer le fichier
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rejected */}
          {isRejected && piece.rejectionMessage && (
            <div className="mt-2">
              <div className="bg-destructive/[0.06] border border-destructive/20 rounded-lg p-3" role="alert">
                <p className="text-xs text-foreground whitespace-pre-line">{piece.rejectionMessage}</p>
              </div>

              {piece.canAutoCorrect && (
                <div className="mt-3 bg-muted/50 border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Voulez-vous qu'IZY tente de corriger automatiquement ce document ?
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      size="sm"
                      className="text-xs h-10 sm:h-7"
                      onClick={() => onAutoCorrect(piece)}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Corriger automatiquement
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-10 sm:h-7"
                      onClick={() => onRemove?.(piece.id)}
                    >
                      Non, je réuploade
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Remove button */}
        {onRemove && !isLoading && (
          <button
            onClick={() => onRemove(piece.id)}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 p-1"
            aria-label={`Supprimer ${piece.name}`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
