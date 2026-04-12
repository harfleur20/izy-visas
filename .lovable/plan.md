
## Phase 1 — Base de données (migration)

1. **Étendre l'enum `app_role`** : ajouter `super_admin`, `admin_delegue`, `admin_juridique` (en conservant `client` et `avocat`, en supprimant `admin`)
2. **Créer la table `audit_admin`** : journalisation append-only de toutes les actions admin
3. **Mettre à jour les RLS** sur toutes les tables existantes pour les nouveaux rôles (en utilisant la fonction `has_role` existante pour éviter la récursion)
4. **Créer la table `admin_invitations`** : gestion des invitations admin (token, expiration 24h, rôle, créé par)

## Phase 2 — Backend (Edge Functions)

5. **Edge Function `invite-admin`** : crée une invitation, envoie un email avec lien d'activation
6. **Edge Function `activate-admin`** : valide le token, crée le compte avec le bon rôle
7. **Edge Function `revoke-admin`** : désactive le compte, invalide les sessions, log l'action
8. **Middleware d'audit** : logger les actions admin dans `audit_admin`

## Phase 3 — Frontend

9. **Mettre à jour `useAuth`** : supporter les nouveaux rôles + vérification MFA
10. **Espace Super Admin** : interface de gestion des accès (création/révocation d'admins)
11. **Page de configuration 2FA** : enrollment TOTP obligatoire pour les admins
12. **Mettre à jour le routing** : nouveaux espaces selon les rôles

## Points importants

- Les rôles restent dans `user_roles` (pas dans `profiles`) — c'est la bonne pratique sécurité
- Le super_admin est créé manuellement via SQL (jamais via l'interface)
- La 2FA utilise l'API MFA native de Supabase (TOTP)
- Les politiques RLS utilisent `has_role()` (security definer) pour éviter la récursion

## ⚠️ Limitations

- L'IP côté client n'est pas fiable (proxy, VPN) — l'IP sera capturée dans les Edge Functions uniquement
- L'invalidation de sessions Supabase n'est pas instantanée (dépend du refresh token)
- L'alerte email nécessite la configuration d'un domaine email (Lovable Emails)
