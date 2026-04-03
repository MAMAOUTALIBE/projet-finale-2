# Project Tracking Setup

## 1. Firebase

1. Activer Authentication (Email/Password).
2. Créer Firestore en mode production.
3. Créer Storage pour les pieces justificatives.
4. Ajouter les domaines autorises pour l'application Angular.
5. Activer Cloud Functions (2nd gen) pour le traitement asynchrone de l'outbox email.
6. Utiliser Node.js >= 20.19 pour compiler/deployer correctement Angular 21 + Functions.

## 2. Collections Firestore MVP

1. `users/{uid}`
2. `projects/{projectId}`
3. `projectStages/{stageId}`
4. `projectActivities/{activityId}`
5. `projectBlockages/{blockageId}`
6. `auditLogs/{logId}`
7. `projectDecisions/{decisionId}`
8. `projectDocuments/{documentId}`
9. `projectNotifications/{notificationId}`
10. `notificationOutbox/{outboxId}`
11. `decisionActions/{actionId}`
12. `projectReportSnapshots/{snapshotId}` (genere par Cloud Functions)
13. `reportDispatchRuns/{runId}` (trace d'execution scheduler)
14. `reportManualRuns/{runId}` (demandes de relance manuelle du digest)
15. `reportDispatchControl/{controlId}` (verrou backend anti-concurrence)

## 3. Champs minimaux

1. `users`: `uid`, `email`, `displayName`, `role`, `updatedAt`.
2. `projects`: `code`, `name`, `description`, `sponsor`, `ownerOrganization`, `status`, `progress`, `startDate`, `endDate`, `budget`, `createdBy`, `createdAt`, `updatedAt`.

## 4. Indexes conseilles

1. Le projet contient un fichier versionne: `firestore.indexes.json`.
2. Index actifs aligns avec les requetes UI:
   `projectStages(projectId ASC, order ASC)`,
   `projectActivities(projectId ASC, dueDate ASC)`,
   `projectBlockages(projectId ASC, createdAt DESC)`,
   `projectDecisions(projectId ASC, createdAt DESC)`,
   `decisionActions(projectId ASC, dueDate ASC)`,
   `projectDocuments(projectId ASC, createdAt DESC)`,
   `projectNotifications(recipientUid ASC, createdAt DESC)`,
   `auditLogs(projectId ASC, createdAt DESC)`.
3. Index de reporting conseilles:
   `projects(status ASC, updatedAt DESC)`,
   `projects(ownerOrganization ASC, updatedAt DESC)`,
   `projectBlockages(projectId ASC, isResolved ASC, createdAt DESC)`.

## 5. Regles de securite (base)

1. Utilisateur non connecte: aucun acces.
2. `users/{uid}`: lecture pour proprietaire/admin/pmo, mise a jour role reservee admin.
3. `projects`, `projectStages`, `projectActivities`: ecriture reservee a `admin`, `pmo`, `project_manager`.
4. `projectBlockages`: creation par tout utilisateur authentifie (proprietaire = createur), resolution par createur, `decision_maker` ou roles projet.
5. `projectDecisions`: creation par roles projet, decision par roles de validation.
6. `decisionActions`: creation/mise a jour de statut reservees aux roles de pilotage (`admin`, `pmo`, `project_manager`, `decision_maker`) et au responsable assigne pour l'avancement.
7. `projectDocuments`: create par utilisateur authentifie (`uploadedByUid == uid`) avec versioning (`documentGroupId`, `version`) et archivage logique.
   Update encadre (id/projet/uploader/storagePath/downloadUrl immuables), delete interdit.
   Workflow validation documentaire: `draft -> submitted -> approved/rejected`.
8. `auditLogs`: create autorise uniquement si `actorUid == request.auth.uid`, update/delete interdits.
9. Le fichier versionne est `firestore.rules`.
10. Regles Storage dediees dans `storage.rules` (taille max 10 MB + types autorises).
11. `projectNotifications`: in-app ciblees, lecture par destinataire, marquage lu par destinataire.
12. `notificationOutbox`: file d'attente email (statut `pending`) pour traitement backend/Cloud Functions.
    Le statut est ensuite mis a jour par le backend en `sent` ou `failed` avec trace technique (`attempts`, `sentAt`, `failedAt`, `lastError`).
13. `projectReportSnapshots` et `reportDispatchRuns`: lecture reservee aux roles de pilotage (`admin`, `pmo`, `project_manager`, `decision_maker`), ecriture directe client interdite.
14. `reportManualRuns`: creation reservee aux roles de pilotage pour demander une relance manuelle du digest (traitement backend), update/delete client interdits.
15. `reportDispatchControl`: collection technique backend uniquement (mutex anti-duplicat des relances manuelles), aucun acces client.

## 6. Flux implementation

1. Auth + profil role utilisateur.
2. CRUD projets.
3. Etapes/activites.
4. Blocages + alertes.
5. Reporting.

## 6.1 Etat actuel du code

1. Sprint 1 livre: auth/roles + projets + dashboard.
2. Sprint 2 livre: etapes + activites + blocages + audit log sur la page detail projet.
3. Sprint 3 livre: validations multi-niveaux + alertes automatiques + reporting global CSV.
4. Sprint 4 livre: RBAC front + regles Firestore + indexes.
5. Sprint 5 livre: pieces justificatives (upload Storage securise + collection `projectDocuments` + audit).
6. Sprint 6 livre: versionnement des pieces justificatives + archivage logique + permissions plus fines.
7. Sprint 7 livre: workflow validation documentaire (soumission + approbation/rejet par roles de validation).
8. Sprint 8 livre: notifications ciblees in-app + outbox email sur evenements documentaires.
9. Sprint 9 livre: Cloud Functions (trigger Firestore) pour envoyer les emails de `notificationOutbox` via SMTP et mettre a jour le statut d'envoi.
10. Sprint 10 livre: reporting automatique quotidien (scheduler Cloud Functions) avec digest cible aux responsables/decideurs.
11. Sprint 11 livre: visualisation des causes de blocage dans la page reporting (causes, severites, projets sous pression).
12. Sprint 12 livre: espace dedie par partie prenante (`/project-tracking/workspace`) avec actions personnelles priorisees.
13. Sprint 13 livre: appui a la prise de decision avec priorisation portefeuille (`/project-tracking/decision-support`) et recommandations automatiques.
14. Sprint 14 livre: journal decisions/actions transverse (`/project-tracking/decision-journal`) pour historisation portefeuille.
15. Sprint 15 livre: plan d'actions decisionnelles (`decisionActions`) integre au detail projet + vue portefeuille (`/project-tracking/decision-actions`).
16. Sprint 16 livre: notifications ciblees sur les actions decisionnelles (affectation + changement de statut) et enrichissement du digest quotidien avec les actions ouvertes/en retard.
17. Sprint 17 livre: escalade automatique des actions en retard (scheduler horaire) + relances planifiees des actions ouvertes (scheduler quotidien) avec notifications in-app/email et audit log.
18. Sprint 18 livre: centre de pilotage des escalades (`/project-tracking/escalation-control`) + accuse de prise en charge des escalades depuis le detail projet et la vue portefeuille.
19. Sprint 19 livre: SLA d'escalade (cible en heures par niveau, statut `En attente/A risque/Hors SLA/Dans SLA`) + KPI de performance de prise en charge (respect SLA, risque, hors SLA, delai moyen d'accuse) dans `/project-tracking/escalation-control`.
20. Sprint 20 livre: reporting portefeuille enrichi (actions decisionnelles ouvertes/en retard, actions escaladees, escalades hors SLA) + digest quotidien enrichi avec KPI SLA et top actions hors SLA.
21. Sprint 21 livre: observabilite reporting automatique dans `/project-tracking/reports` (historique snapshots digest + historique executions scheduler) avec droits de lecture securises sur `projectReportSnapshots` et `reportDispatchRuns`.
22. Sprint 22 livre: relance manuelle du digest depuis `/project-tracking/reports` (bouton `Relancer digest`) avec trace backend dediee (`reportManualRuns`) et execution `manual_portfolio_report` dans `reportDispatchRuns`.
23. Sprint 23 livre: gouvernance des relances manuelles du digest (anti-duplicat front+backend, mutex d'execution, file visible dans `/project-tracking/reports`).
24. Sprint 24 livre: supervision de fiabilite du digest quotidien (KPI de stabilite sur `/project-tracking/reports` + controle de sante scheduler a `08:45` avec alerte proactive `report_dispatch_alert` en cas d'absence/echec du digest).
25. Sprint 25 livre: auto-remediation du digest quotidien via le controle sante (creation automatique d'une relance `manual_portfolio_report` source `auto_health_recovery` si incident detecte, avec verrou daily anti-duplicat) + observabilite de cette relance dans `/project-tracking/reports`.
26. Sprint 26 livre: suivi post-auto-remediation (scheduler `09:30`) pour qualifier l'issue de l'auto-relance (`reussie/en cours/en echec`) et declencher une alerte de suivi en cas d'echec ou de blocage, avec publication des statuts dans `reportDispatchRuns`.
27. Sprint 27 livre: SLA d'auto-remediation du digest (latence en minutes vs cible, statut `Dans SLA/En attente/Hors SLA`) calcule au suivi `09:30`, avec alertes de depassement et visualisation dans `Historique controle sante digest`.
28. Sprint 28 livre: score de resilience reporting glissant sur 7 jours (incidents, serie consecutive, score /100) calcule au suivi `09:30`, avec alerte de gouvernance dediee en cas de derive recurrente et affichage dans `/project-tracking/reports`.
29. Les collections utilisees en live sont `projectStages`, `projectActivities`, `projectBlockages`, `projectDecisions`, `decisionActions`, `projectDocuments`, `projectNotifications`, `notificationOutbox`, `projectReportSnapshots`, `reportDispatchRuns`, `reportManualRuns`, `reportDispatchControl`, `auditLogs`.

## 7. Verification manuelle

1. Login Firebase fonctionnel.
2. Creation projet possible pour un role autorise.
3. Refus creation projet pour un role non autorise.
4. Affichage dashboard et liste projets sans erreur console.
5. Validation des regles: tentative d'ecriture interdite depuis un compte `stakeholder`.
6. Verification indexes: aucune erreur Firestore "index required" sur detail projet/reporting.
7. Upload document depuis detail projet: visible dans la table "Pieces justificatives" et ouvrable en nouvel onglet.
8. Nouvelle version document: bouton "Nouvelle version", increment de version et trace dans audit.
9. Archivage document: bouton "Archiver", document marque archive sans suppression physique.
10. Validation documentaire: boutons "Soumettre/Approuver/Rejeter" et statut mis a jour en base.
11. Notifications: apres soumission/approbation/rejet document, notifications visibles dans le dashboard.
12. Outbox email: creation de documents `notificationOutbox` en `pending` puis passage automatique en `sent` ou `failed` apres execution Function.
13. Reporting automatique: creation quotidienne d'un `projectReportSnapshots/{snapshotId}` + notifications type `report_digest` + emails outbox pour roles cibles.
14. Visualisation blocages: sur `/project-tracking/reports`, affichage des causes principales, repartition par severite et projets les plus exposes.
15. Mon espace: sur `/project-tracking/workspace`, verification des activites/validations/blocages/documents lies a l'utilisateur connecte.
16. Aide decision: sur `/project-tracking/decision-support`, verification du score de risque, de la priorite et des recommandations par projet.
17. Journal decisions: sur `/project-tracking/decision-journal`, verification du filtrage type/statut et de la chronologie des decisions/actions.
18. Plan actions: sur `/project-tracking/projects/:id`, creation/suivi de statuts (`A lancer`, `En cours`, `Bloquee`, `Terminee`) et sur `/project-tracking/decision-actions`, verification des filtres portefeuille.
19. Notifications actions decisionnelles: creation/modification de statut d'une action -> notification in-app + outbox email pour les cibles, visible sur dashboard.
20. Digest quotidien: verification du message `report_digest` avec compteurs d'actions decisionnelles ouvertes/en retard.
21. Escalade automatique: laisser une action decisionnelle ouverte avec echeance depassee, puis verifier (apres passage scheduler) mise a jour `escalationLevel`, creation notification `decision_action_escalated`, trace `decision_action_escalated` dans audit.
22. Relance planifiee: verifier creation notification `decision_action_reminder` + increment `reminderCount` + trace `decision_action_reminder_sent` (une fois par jour max/action).
23. Centre escalades: sur `/project-tracking/escalation-control`, verifier les filtres niveau/prise en charge, les compteurs et l'action `Accuser`.
24. Accuse prise en charge: action escaladee -> clic `Accuser` -> MAJ `escalationAcknowledgedAt/escalationAcknowledgedByUid/escalationAckComment` + notification `decision_action_acknowledged` + trace `decision_action_acknowledged`.
25. SLA escalades: sur `/project-tracking/escalation-control`, verifier les statuts `En attente`, `A risque`, `Hors SLA`, `Dans SLA` et le calcul `Cible (h) / Ecoule (h)` par action.
26. KPI performance escalades: sur `/project-tracking/escalation-control`, verifier les tuiles `SLA respecte`, `SLA a risque`, `SLA hors cible`, `Delai moyen accuse (h)`.
27. Reporting enrichi: sur `/project-tracking/reports`, verifier les compteurs `Actions decisionnelles ouvertes`, `Actions decisionnelles en retard`, `Actions escaladees`, `Escalades hors SLA` et les nouvelles colonnes dans le tableau.
28. Digest enrichi: verifier que le message `report_digest` (notification + email outbox) inclut la synthese SLA d'escalade et la section des actions hors SLA prioritaires.
29. Historique snapshots: sur `/project-tracking/reports`, verifier le tableau `Historique snapshots digest` (date, projets, escalades ouvertes, hors SLA, destinataires, emails).
30. Historique executions: sur `/project-tracking/reports`, verifier le tableau `Historique executions scheduler` (type, statut, duree, notifications, erreur) et la coherence avec `reportDispatchRuns`.
31. Relance manuelle digest: sur `/project-tracking/reports`, clic `Relancer digest` -> creation `reportManualRuns/{id}` en `requested`, puis passage `running/completed` (ou `failed`) + nouvelle ligne `manual_portfolio_report` dans `reportDispatchRuns`.
32. Anti-duplicat manuel: pendant une relance manuelle en cours (`requested` ou `running`), verifier que le bouton `Relancer digest` est desactive et qu'une nouvelle demande est refusee avec message explicite.
33. Controle sante digest: apres `08:45`, verifier creation d'un run `daily_portfolio_report_health_check` dans `reportDispatchRuns`; si le run quotidien `daily-YYYY-MM-DD` est absent/echoue, verifier notification in-app/email de type `report_dispatch_alert` et presence du verrou `reportDispatchControl/daily_portfolio_report_health_alert_YYYY-MM-DD`.
34. Auto-remediation digest: en cas d'incident detecte par le controle sante, verifier creation d'une demande `reportManualRuns/auto-YYYY-MM-DD` (`source = auto_health_recovery`, `status = requested`) puis execution associee `manual_portfolio_report` et visibilite dans `File des relances manuelles` + `Historique controle sante digest`.
35. Suivi auto-remediation: apres `09:30`, verifier creation d'un run `daily_portfolio_report_health_followup`; controler `autoRecoveryOutcome` sur le run `health-YYYY-MM-DD` (`completed/pending/failed/...`) et, en cas d'echec/blocage, verifier notification `report_dispatch_alert` de suivi + verrou `reportDispatchControl/daily_portfolio_report_recovery_alert_YYYY-MM-DD`.
36. SLA auto-remediation: sur `health-YYYY-MM-DD`, verifier `autoRecoveryLatencyMinutes`, `autoRecoverySlaTargetMinutes` et `autoRecoverySlaStatus` (`within_sla`, `pending`, `breached`), puis confirmer l'affichage des badges SLA dans `/project-tracking/reports` (`Historique controle sante digest`).
37. Resilience reporting: sur `health-YYYY-MM-DD`, verifier `resilienceScore`, `resilienceIncidents7d`, `resilienceConsecutiveIncidents`, `resilienceEscalated`; en cas de derive (score bas/serie longue), verifier alerte `report_dispatch_alert` et verrou `reportDispatchControl/daily_portfolio_report_resilience_alert_YYYY-MM-DD`.

## 8. Deploiement Firebase (Firestore, Storage, Functions)

1. Les fichiers de reference sont:
   `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `functions/src/index.ts`.
2. Commandes:
   `firebase login`
   `firebase use <project-id>`
   `firebase deploy --only firestore:rules`
   `firebase deploy --only firestore:indexes`
   `firebase deploy --only storage`
   `firebase deploy --only functions`
3. Config email SMTP (secrets Cloud Functions):
   `firebase functions:secrets:set SMTP_HOST`
   `firebase functions:secrets:set SMTP_PORT`
   `firebase functions:secrets:set SMTP_USER`
   `firebase functions:secrets:set SMTP_PASS`
   `firebase functions:secrets:set SMTP_FROM`
4. Variables non sensibles (fichier `functions/.env` pour local/emulator):
   `APP_BASE_URL=https://<votre-domaine-front>`
   `SMTP_SECURE=false` (mettre `true` si port 465)
   `SMTP_REPLY_TO=<adresse-optionnelle>`
   Schedulers par defaut (dans `functions/src/index.ts`):
   - digest portefeuille quotidien: tous les jours a `07:30` (`dispatchDailyPortfolioReport`)
   - controle sante digest quotidien + auto-remediation: tous les jours a `08:45` (`monitorDailyPortfolioReportHealth`)
   - suivi auto-remediation digest + SLA + resilience: tous les jours a `09:30` (`followupDailyPortfolioReportRecovery`)
   - escalade actions decisionnelles: toutes les `60 minutes` (`processOverdueDecisionActionEscalations`)
   - relances actions decisionnelles: tous les jours a `08:15` (`dispatchPlannedDecisionActionReminders`)
5. Bootstrap recommande:
   creer le compte `spruko@admin.com` en premier (ou promouvoir un compte via console) pour administrer les roles.
