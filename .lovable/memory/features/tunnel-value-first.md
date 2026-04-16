---
name: Tunnel Value-First Architecture
description: Parcours d'acquisition animé en écrans successifs pour les non-connectés, avant redirection vers /client
type: feature
---
Le tunnel value-first est le nouveau point d'entrée pour les visiteurs non connectés (route `/`).
- Architecture : composant par étape dans `src/components/tunnel/`, state centralisé via `useTunnelState` (React state, pas de persistence)
- Flow : splash → identité → upload refus OCR → vérification → verdict → pièces → lettre → paiement → inscription → redirection /client
- L'espace client actuel (sidebar) reste inchangé
- Si refresh pendant le tunnel, le client recommence
- Les Edge Functions (OCR, generate-recours, create-payment) sont réutilisées avec adaptations guest mode
