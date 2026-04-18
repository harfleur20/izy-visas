import { useState, useCallback } from "react";

export type TunnelStep =
  | "splash"
  | "recevabilite"
  | "upload_refus"
  | "verification"
  | "verdict"
  | "pieces"
  | "letter"
  | "payment"
  | "signup";

export interface TunnelIdentityData {
  firstName: string;
  lastName: string;
  dateNaissance: string;
  lieuNaissance: string;
  nationalite: string;
  passportNumber: string;
  phone: string;
  email: string;
}

export interface TunnelOcrData {
  visaType: string;
  typeVisaTexteOriginal: string;
  consulatNom: string;
  consulatVille: string;
  consulatPays: string;
  dateNotificationRefus: string;
  motifsRefus: string[];
  motifsTexteOriginal: string[];
  numeroDecision: string;
  destinataireRecours: string;
  langueDocument: string;
  scoreOcr: number;
  demandeurNom: string;
  demandeurPrenom: string;
  demandeurPasseport?: string;
  demandeurDateNaissance?: string;
  demandeurLieuNaissance?: string;
  demandeurNationalite?: string;
}

export interface TunnelPieceFile {
  id: string;
  file: File;
  nomPiece: string;
  typePiece: string;
  scoreQualite?: number;
  statutOcr?: string;
}

export interface TunnelState {
  step: TunnelStep;
  dateRefus: string;
  identity: TunnelIdentityData;
  decisionFile: File | null;
  decisionUrl: string | null;
  ocrData: TunnelOcrData | null;
  pieces: TunnelPieceFile[];
  lettreContenu: string | null;
  lettreNeutreUrl: string | null;
  optionChoisie: string | null;
  paymentMethod: "stripe" | "taramoney";
  email: string | null;
  stripeSessionId: string | null;
}

const INITIAL_IDENTITY: TunnelIdentityData = {
  firstName: "",
  lastName: "",
  dateNaissance: "",
  lieuNaissance: "",
  nationalite: "",
  passportNumber: "",
  phone: "",
  email: "",
};

const INITIAL_STATE: TunnelState = {
  step: "splash",
  dateRefus: "",
  identity: INITIAL_IDENTITY,
  decisionFile: null,
  decisionUrl: null,
  ocrData: null,
  pieces: [],
  lettreContenu: null,
  lettreNeutreUrl: null,
  optionChoisie: null,
  paymentMethod: "stripe",
  email: null,
  stripeSessionId: null,
};

export function useTunnelState() {
  const [state, setState] = useState<TunnelState>(INITIAL_STATE);

  const setStep = useCallback((step: TunnelStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const setDateRefus = useCallback((dateRefus: string) => {
    setState((prev) => ({ ...prev, dateRefus }));
  }, []);

  const setIdentity = useCallback((identity: Partial<TunnelIdentityData>) => {
    setState((prev) => ({
      ...prev,
      identity: { ...prev.identity, ...identity },
    }));
  }, []);

  const setDecisionFile = useCallback((file: File | null, url?: string | null) => {
    setState((prev) => ({
      ...prev,
      decisionFile: file,
      decisionUrl: url ?? prev.decisionUrl,
    }));
  }, []);

  const setOcrData = useCallback((ocrData: TunnelOcrData | null) => {
    setState((prev) => ({ ...prev, ocrData }));
  }, []);

  const addPiece = useCallback((piece: TunnelPieceFile) => {
    setState((prev) => ({
      ...prev,
      pieces: [...prev.pieces, piece],
    }));
  }, []);

  const removePiece = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      pieces: prev.pieces.filter((p) => p.id !== id),
    }));
  }, []);

  const setLettre = useCallback((contenu: string | null, url?: string | null) => {
    setState((prev) => ({
      ...prev,
      lettreContenu: contenu,
      lettreNeutreUrl: url ?? prev.lettreNeutreUrl,
    }));
  }, []);

  const setOption = useCallback((option: string | null) => {
    setState((prev) => ({ ...prev, optionChoisie: option }));
  }, []);

  const setPaymentMethod = useCallback((method: "stripe" | "taramoney") => {
    setState((prev) => ({ ...prev, paymentMethod: method }));
  }, []);

  const setEmail = useCallback((email: string | null) => {
    setState((prev) => ({ ...prev, email }));
  }, []);

  const setStripeSessionId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, stripeSessionId: id }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    setStep,
    setDateRefus,
    setIdentity,
    setDecisionFile,
    setOcrData,
    addPiece,
    removePiece,
    setLettre,
    setOption,
    setPaymentMethod,
    setEmail,
    setStripeSessionId,
    reset,
  };
}
