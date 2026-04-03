import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import nodemailer from 'nodemailer';

initializeApp();

const db = getFirestore();

type NotificationOutboxStatus = 'pending' | 'sent' | 'failed';
type UserRole = 'admin' | 'pmo' | 'project_manager' | 'stakeholder' | 'validator' | 'decision_maker';
type ProjectStatus = 'planned' | 'in_progress' | 'blocked' | 'in_validation' | 'validated' | 'closed';
type ActivityStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
type DecisionActionStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
type EscalationSlaStatus = 'pending' | 'within_sla' | 'at_risk' | 'breached';
type NotificationChannel = 'in_app' | 'email';

interface NotificationOutboxItem {
  id: string;
  projectId: string;
  notificationId: string;
  recipientUid: string;
  recipientEmail: string;
  subject: string;
  message: string;
  actionUrl?: string;
  status: NotificationOutboxStatus;
  requestedByUid: string;
  createdAt: number;
}

interface ProjectNotification {
  id: string;
  projectId: string;
  recipientUid: string;
  actorUid: string;
  type:
    | 'document_submitted'
    | 'document_approved'
    | 'document_rejected'
    | 'document_general'
    | 'decision_action_assigned'
    | 'decision_action_status'
    | 'decision_action_escalated'
    | 'decision_action_reminder'
    | 'decision_action_acknowledged'
    | 'report_digest'
    | 'report_dispatch_alert';
  title: string;
  message: string;
  actionUrl: string;
  channels: NotificationChannel[];
  isRead: boolean;
  createdAt: number;
}

interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  role: UserRole;
}

interface Project {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  updatedAt: number;
}

interface ProjectActivity {
  projectId: string;
  dueDate: string;
  status: ActivityStatus;
}

interface ProjectBlockage {
  projectId: string;
  isResolved: boolean;
}

interface ProjectDecision {
  projectId: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface ProjectDecisionAction {
  id: string;
  projectId: string;
  title: string;
  ownerUid: string;
  createdByUid: string;
  status: DecisionActionStatus;
  dueDate: string;
  createdAt?: number;
  updatedAt?: number;
  escalationLevel?: number;
  escalatedAt?: number;
  escalationAcknowledgedAt?: number;
  lastEscalationDateKey?: string;
  reminderCount?: number;
  lastReminderDateKey?: string;
}

interface AuditLog {
  id: string;
  projectId: string;
  actorUid: string;
  action: string;
  targetType: 'decision_action';
  targetId: string;
  message: string;
  createdAt: number;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
  appBaseUrl?: string;
}

interface PortfolioRiskRow {
  projectId: string;
  code: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  delayedActivities: number;
  openBlockages: number;
  pendingValidations: number;
  openDecisionActions: number;
  overdueDecisionActions: number;
  escalatedDecisionActions: number;
  breachedEscalations: number;
  updatedAt: number;
}

interface PortfolioDigestTotals {
  projects: number;
  inProgress: number;
  blocked: number;
  completed: number;
  delayedActivities: number;
  openBlockages: number;
  pendingValidations: number;
  openDecisionActions: number;
  overdueDecisionActions: number;
  escalatedDecisionActions: number;
  breachedEscalations: number;
}

interface EscalationDigestTotals {
  escalatedOpen: number;
  unacknowledged: number;
  acknowledged: number;
  withinSla: number;
  atRisk: number;
  breached: number;
}

interface BreachedEscalationRow {
  actionId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  ownerUid: string;
  escalationLevel: number;
  dueDate: string;
  slaTargetHours: number;
  slaElapsedHours: number;
}

interface PortfolioDigest {
  totals: PortfolioDigestTotals;
  escalation: EscalationDigestTotals;
  topRiskProjects: PortfolioRiskRow[];
  topBreachedActions: BreachedEscalationRow[];
}

interface ReportManualRunRequest {
  id: string;
  type?: string;
  requestedByUid: string;
  requestedAt: number;
  status?: 'requested' | 'running' | 'completed' | 'failed';
  source?: string;
  runId?: string;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  lastError?: string;
  updatedAt?: number;
}

const EMAIL_SECRETS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;
const REPORT_RECIPIENT_ROLES: UserRole[] = ['admin', 'pmo', 'project_manager', 'decision_maker'];
const REPORT_ROUTE = '/project-tracking/reports';
const REPORT_PROJECT_ID = 'portfolio-report';
const REPORT_MANUAL_RUN_COLLECTION = 'reportManualRuns';
const REPORT_CONTROL_COLLECTION = 'reportDispatchControl';
const REPORT_MANUAL_MUTEX_DOC = 'manual_portfolio_report_mutex';
const REPORT_MANUAL_MUTEX_TTL_MS = 30 * 60_000;
const REPORT_DAILY_HEALTH_ALERT_PREFIX = 'daily_portfolio_report_health_alert';
const REPORT_DAILY_AUTO_RECOVERY_PREFIX = 'daily_portfolio_report_auto_recovery';
const REPORT_DAILY_RECOVERY_ALERT_PREFIX = 'daily_portfolio_report_recovery_alert';
const REPORT_DAILY_RESILIENCE_ALERT_PREFIX = 'daily_portfolio_report_resilience_alert';
const REPORT_AUTO_RECOVERY_SLA_TARGET_MINUTES = 60;
const REPORT_RESILIENCE_WINDOW_DAYS = 7;
const SYSTEM_ACTOR_UID = 'system';
const DECISION_ACTION_OPEN_STATUSES: DecisionActionStatus[] = ['todo', 'in_progress', 'blocked'];
const DECISION_ACTION_ESCALATION_ROLES: UserRole[] = ['admin', 'pmo', 'project_manager', 'decision_maker'];
const DECISION_ACTION_REMINDER_ROLES: UserRole[] = ['admin', 'pmo', 'project_manager', 'decision_maker'];
const DECISION_ACTION_REMINDER_WINDOW_DAYS = 2;

export const processNotificationOutbox = onDocumentCreated(
  {
    document: 'notificationOutbox/{outboxId}',
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '256MiB',
    retry: false,
    secrets: [...EMAIL_SECRETS],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn('Notification outbox trigger received empty snapshot.');
      return;
    }

    const outbox = snapshot.data() as NotificationOutboxItem;
    if ((outbox.status ?? 'pending') !== 'pending') {
      logger.info('Skipping outbox item because status is not pending.', {
        outboxId: snapshot.id,
        status: outbox.status,
      });
      return;
    }

    const attemptTimestamp = Date.now();
    const baseUpdate = {
      attempts: FieldValue.increment(1),
      attemptedAt: attemptTimestamp,
    };

    if (!outbox.recipientEmail || !outbox.subject || !outbox.message) {
      await snapshot.ref.set(
        {
          ...baseUpdate,
          status: 'failed',
          failedAt: Date.now(),
          lastError: 'Outbox invalide: recipientEmail, subject et message sont obligatoires.',
        },
        { merge: true }
      );
      return;
    }

    const smtpConfig = loadSmtpConfig();
    if (!smtpConfig) {
      await snapshot.ref.set(
        {
          ...baseUpdate,
          status: 'failed',
          failedAt: Date.now(),
          lastError: 'Configuration SMTP absente. Verifiez les secrets SMTP_*.',
        },
        { merge: true }
      );
      logger.error('SMTP configuration is missing. Unable to send email.', { outboxId: snapshot.id });
      return;
    }

    const actionLink = buildActionLink(outbox.actionUrl, smtpConfig.appBaseUrl);

    try {
      const transporter = createTransporter(smtpConfig);
      await transporter.sendMail({
        from: smtpConfig.from,
        to: outbox.recipientEmail,
        replyTo: smtpConfig.replyTo,
        subject: outbox.subject,
        text: buildPlainTextBody(outbox.message, actionLink),
        html: buildHtmlBody(outbox.message, actionLink),
      });

      await snapshot.ref.set(
        {
          ...baseUpdate,
          status: 'sent',
          provider: 'smtp',
          sentAt: Date.now(),
          failedAt: FieldValue.delete(),
          lastError: FieldValue.delete(),
        },
        { merge: true }
      );
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      logger.error('Email delivery failed for outbox item.', {
        outboxId: snapshot.id,
        recipientEmail: outbox.recipientEmail,
        error: errorMessage,
      });

      await snapshot.ref.set(
        {
          ...baseUpdate,
          status: 'failed',
          failedAt: Date.now(),
          lastError: errorMessage,
        },
        { merge: true }
      );
    }
  }
);

export const dispatchDailyPortfolioReport = onSchedule(
  {
    schedule: 'every day 07:30',
    timeZone: 'Europe/Paris',
    region: 'europe-west1',
    timeoutSeconds: 180,
    memory: '512MiB',
    secrets: [...EMAIL_SECRETS],
  },
  async () => {
    const nowMs = Date.now();
    const now = new Date(nowMs);
    const dateKey = formatDateKey(now, 'Europe/Paris');
    const runId = `daily-${dateKey}`;
    const runRef = db.collection('reportDispatchRuns').doc(runId);
    const runType = 'daily_portfolio_report';
    const lockAcquired = await claimRunLock(db, runRef, nowMs, dateKey, runType);

    if (!lockAcquired) {
      logger.info('Daily portfolio report already generated. Skipping duplicate run.', { runId });
      return;
    }

    await executePortfolioDigestRun({
      firestore: db,
      runRef,
      runId,
      runType,
      dateKey,
      nowMs,
      requestedByUid: SYSTEM_ACTOR_UID,
    });
  }
);

export const dispatchManualPortfolioReport = onDocumentCreated(
  {
    document: `${REPORT_MANUAL_RUN_COLLECTION}/{manualRunId}`,
    region: 'europe-west1',
    timeoutSeconds: 180,
    memory: '512MiB',
    retry: false,
    secrets: [...EMAIL_SECRETS],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn('Manual report trigger received empty snapshot.');
      return;
    }

    const request = snapshot.data() as Partial<ReportManualRunRequest>;
    const requestedByUid = String(request.requestedByUid ?? '').trim() || SYSTEM_ACTOR_UID;
    const nowMs = Date.now();
    const dateKey = formatDateKey(new Date(nowMs), 'Europe/Paris');
    const runType = 'manual_portfolio_report';
    const runId = `manual-${event.params.manualRunId}`;
    const runRef = db.collection('reportDispatchRuns').doc(runId);
    const mutexAcquired = await claimManualReportMutex(db, event.params.manualRunId, nowMs);
    if (!mutexAcquired) {
      await snapshot.ref.set(
        {
          id: snapshot.id,
          status: 'failed',
          failedAt: nowMs,
          lastError: 'Une autre relance manuelle est deja en cours.',
          updatedAt: nowMs,
        },
        { merge: true }
      );
      logger.info('Manual portfolio report skipped because another run is active.', {
        manualRunId: event.params.manualRunId,
      });
      return;
    }

    try {
      const lockAcquired = await claimRunLock(db, runRef, nowMs, dateKey, runType, {
        requestedByUid,
      });

      if (!lockAcquired) {
        await snapshot.ref.set(
          {
            id: snapshot.id,
            status: 'failed',
            failedAt: Date.now(),
            runId,
            lastError: 'Cette relance manuelle a deja ete traitee.',
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        logger.info('Manual portfolio report run already handled. Skipping duplicate trigger.', { runId });
        return;
      }

      await snapshot.ref.set(
        {
          id: snapshot.id,
          status: 'running',
          runId,
          startedAt: nowMs,
          updatedAt: nowMs,
        },
        { merge: true }
      );

      try {
        await executePortfolioDigestRun({
          firestore: db,
          runRef,
          runId,
          runType,
          dateKey,
          nowMs,
          requestedByUid,
        });

        await snapshot.ref.set(
          {
            status: 'completed',
            completedAt: Date.now(),
            runId,
            updatedAt: Date.now(),
            lastError: FieldValue.delete(),
          },
          { merge: true }
        );
      } catch (error) {
        const errorMessage = extractErrorMessage(error);
        await snapshot.ref.set(
          {
            status: 'failed',
            failedAt: Date.now(),
            runId,
            lastError: errorMessage,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        throw error;
      }
    } finally {
      await releaseManualReportMutex(db, event.params.manualRunId);
    }
  }
);

export const monitorDailyPortfolioReportHealth = onSchedule(
  {
    schedule: 'every day 08:45',
    timeZone: 'Europe/Paris',
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const nowMs = Date.now();
    const dateKey = formatDateKey(new Date(nowMs), 'Europe/Paris');
    const runId = `health-${dateKey}`;
    const runType = 'daily_portfolio_report_health_check';
    const runRef = db.collection('reportDispatchRuns').doc(runId);
    const lockAcquired = await claimRunLock(db, runRef, nowMs, dateKey, runType, {
      requestedByUid: SYSTEM_ACTOR_UID,
    });

    if (!lockAcquired) {
      logger.info('Daily portfolio report health check already completed. Skipping duplicate run.', {
        runId,
      });
      return;
    }

    const monitoredRunId = `daily-${dateKey}`;

    try {
      const monitoredSnapshot = await db.collection('reportDispatchRuns').doc(monitoredRunId).get();
      const monitoredStatus = monitoredSnapshot.exists
        ? String((monitoredSnapshot.data() as { status?: string }).status ?? 'running')
        : 'missing';
      const healthy = monitoredStatus === 'completed';

      let alertRaised = false;
      let autoRecoveryAttempted = false;
      let autoRecoveryTriggered = false;
      let autoRecoveryRunRequestId = '';
      let autoRecoveryOutcome = healthy ? 'not_required' : 'not_triggered';
      let autoRecoverySlaStatus = healthy ? 'not_applicable' : 'pending';
      let recipientsCount = 0;
      let notificationCount = 0;
      let emailQueuedCount = 0;

      if (!healthy) {
        alertRaised = await claimDailyReportHealthAlertLock(db, dateKey, monitoredRunId, nowMs);
        if (alertRaised) {
          const recipients = await loadReportRecipients(db);
          recipientsCount = recipients.length;
          const queued = await queueActionNotificationForRecipients(db, recipients, {
            projectId: REPORT_PROJECT_ID,
            relatedId: monitoredRunId,
            type: 'report_dispatch_alert',
            title: `Alerte reporting quotidien - ${dateKey}`,
            message: buildDailyReportHealthAlertMessage(monitoredStatus, dateKey),
            actionUrl: REPORT_ROUTE,
            nowMs,
          });
          notificationCount = queued.notifications;
          emailQueuedCount = queued.emails;
        }

        autoRecoveryAttempted = true;
        const recoveryLockAcquired = await claimDailyReportAutoRecoveryLock(
          db,
          dateKey,
          monitoredRunId,
          monitoredStatus,
          nowMs
        );
        if (recoveryLockAcquired) {
          const activeManualRun = await hasActiveManualReportRunRequest(db);
          if (!activeManualRun) {
            autoRecoveryRunRequestId = `auto-${dateKey}`;
            const autoRecoveryRef = db.collection(REPORT_MANUAL_RUN_COLLECTION).doc(autoRecoveryRunRequestId);
            await autoRecoveryRef.set(
              {
                id: autoRecoveryRunRequestId,
                type: 'manual_portfolio_report',
                requestedByUid: SYSTEM_ACTOR_UID,
                requestedAt: nowMs,
                status: 'requested',
                source: 'auto_health_recovery',
                updatedAt: nowMs,
              },
              { merge: true }
            );
            autoRecoveryTriggered = true;
            autoRecoveryOutcome = 'pending';
            autoRecoverySlaStatus = 'pending';
          } else {
            autoRecoveryOutcome = 'skipped_active_manual';
            autoRecoverySlaStatus = 'not_applicable';
          }
        } else {
          autoRecoveryOutcome = 'already_locked';
          autoRecoverySlaStatus = 'not_applicable';
        }
      }

      await runRef.set(
        {
          status: 'completed',
          completedAt: Date.now(),
          monitoredRunId,
          monitoredRunStatus: monitoredStatus,
          healthy,
          alertRaised,
          autoRecoveryAttempted,
          autoRecoveryTriggered,
          autoRecoveryRunRequestId: autoRecoveryRunRequestId || FieldValue.delete(),
          autoRecoveryOutcome,
          autoRecoverySlaTargetMinutes: autoRecoveryAttempted
            ? REPORT_AUTO_RECOVERY_SLA_TARGET_MINUTES
            : FieldValue.delete(),
          autoRecoverySlaStatus,
          recipientsCount,
          notificationCount,
          emailQueuedCount,
        },
        { merge: true }
      );

      logger.info('Daily portfolio report health check completed.', {
        runId,
        monitoredRunId,
        monitoredStatus,
        healthy,
        alertRaised,
        autoRecoveryAttempted,
        autoRecoveryTriggered,
        autoRecoveryRunRequestId: autoRecoveryRunRequestId || undefined,
        autoRecoveryOutcome,
        autoRecoverySlaStatus,
        notifications: notificationCount,
        emails: emailQueuedCount,
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      await runRef.set(
        {
          status: 'failed',
          failedAt: Date.now(),
          lastError: errorMessage,
        },
        { merge: true }
      );
      logger.error('Daily portfolio report health check failed.', {
        runId,
        monitoredRunId,
        error: errorMessage,
      });
      throw error;
    }
  }
);

export const followupDailyPortfolioReportRecovery = onSchedule(
  {
    schedule: 'every day 09:30',
    timeZone: 'Europe/Paris',
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const nowMs = Date.now();
    const dateKey = formatDateKey(new Date(nowMs), 'Europe/Paris');
    const runId = `health-followup-${dateKey}`;
    const runType = 'daily_portfolio_report_health_followup';
    const runRef = db.collection('reportDispatchRuns').doc(runId);
    const lockAcquired = await claimRunLock(db, runRef, nowMs, dateKey, runType, {
      requestedByUid: SYSTEM_ACTOR_UID,
    });

    if (!lockAcquired) {
      logger.info('Daily portfolio report recovery follow-up already completed. Skipping duplicate run.', {
        runId,
      });
      return;
    }

    const healthRunId = `health-${dateKey}`;

    try {
      const healthRunRef = db.collection('reportDispatchRuns').doc(healthRunId);
      const healthSnapshot = await healthRunRef.get();

      if (!healthSnapshot.exists) {
        await runRef.set(
          {
            status: 'completed',
            completedAt: Date.now(),
            healthRunId,
            autoRecoveryOutcome: 'health_run_missing',
          },
          { merge: true }
        );
        return;
      }

      const healthData = healthSnapshot.data() as Record<string, unknown>;
      const autoRecoveryAttempted = Boolean(healthData.autoRecoveryAttempted ?? false);
      const autoRecoveryTriggered = Boolean(healthData.autoRecoveryTriggered ?? false);
      const autoRecoveryRunRequestId = String(healthData.autoRecoveryRunRequestId ?? '').trim();
      let autoRecoveryOutcome = String(healthData.autoRecoveryOutcome ?? '').trim();
      const autoRecoverySlaTargetMinutes = Number(
        healthData.autoRecoverySlaTargetMinutes ?? REPORT_AUTO_RECOVERY_SLA_TARGET_MINUTES
      );
      let autoRecoveryLatencyMinutes = 0;
      let autoRecoverySlaStatus = 'not_applicable';

      let alertRaised = false;
      let resilienceAlertRaised = false;
      let recipientsCount = 0;
      let notificationCount = 0;
      let emailQueuedCount = 0;
      let resilienceScore = 100;
      let resilienceIncidents7d = 0;
      let resilienceConsecutiveIncidents = 0;
      let resilienceEscalated = false;

      if (!autoRecoveryAttempted) {
        autoRecoveryOutcome = autoRecoveryOutcome || 'not_required';
        autoRecoverySlaStatus = 'not_applicable';
      } else if (!autoRecoveryTriggered && !autoRecoveryRunRequestId) {
        autoRecoveryOutcome = autoRecoveryOutcome || 'not_triggered';
        autoRecoverySlaStatus = 'not_applicable';
      } else {
        const recoveryRequestId = autoRecoveryRunRequestId || `auto-${dateKey}`;
        const recoverySnapshot = await db.collection(REPORT_MANUAL_RUN_COLLECTION).doc(recoveryRequestId).get();

        if (!recoverySnapshot.exists) {
          autoRecoveryOutcome = 'missing_request';
          autoRecoverySlaStatus = 'breached';
        } else {
          const recoveryData = recoverySnapshot.data() as Partial<ReportManualRunRequest>;
          const recoveryStatus = String(recoveryData.status ?? 'requested');
          const requestedAt = Number(recoveryData.requestedAt ?? nowMs);
          const completedAt = Number(recoveryData.completedAt ?? 0);
          const failedAt = Number(recoveryData.failedAt ?? 0);
          const effectiveEndAt =
            recoveryStatus === 'completed' ? completedAt || nowMs : recoveryStatus === 'failed' ? failedAt || nowMs : nowMs;
          autoRecoveryLatencyMinutes = Math.max(0, Math.round((effectiveEndAt - requestedAt) / 60_000));

          if (recoveryStatus === 'completed') {
            autoRecoveryOutcome = 'completed';
            autoRecoverySlaStatus =
              autoRecoveryLatencyMinutes <= autoRecoverySlaTargetMinutes ? 'within_sla' : 'breached';
          } else if (recoveryStatus === 'failed') {
            autoRecoveryOutcome = 'failed';
            autoRecoverySlaStatus = 'breached';
          } else {
            autoRecoveryOutcome = 'pending';
            autoRecoverySlaStatus =
              autoRecoveryLatencyMinutes <= autoRecoverySlaTargetMinutes ? 'pending' : 'breached';
          }
        }

        if (
          autoRecoveryOutcome === 'failed' ||
          autoRecoveryOutcome === 'pending' ||
          autoRecoveryOutcome === 'missing_request' ||
          autoRecoverySlaStatus === 'breached'
        ) {
          const recoveryAlertLockAcquired = await claimDailyReportRecoveryAlertLock(
            db,
            dateKey,
            healthRunId,
            autoRecoveryOutcome,
            nowMs
          );
          if (recoveryAlertLockAcquired) {
            const recipients = await loadReportRecipients(db);
            recipientsCount = recipients.length;
            const queued = await queueActionNotificationForRecipients(db, recipients, {
              projectId: REPORT_PROJECT_ID,
              relatedId: recoveryRequestId,
              type: 'report_dispatch_alert',
              title: `Alerte suivi auto-relance digest - ${dateKey}`,
              message: buildDailyReportRecoveryAlertMessage(
                autoRecoveryOutcome,
                autoRecoverySlaStatus,
                autoRecoveryLatencyMinutes,
                autoRecoverySlaTargetMinutes,
                dateKey,
                recoveryRequestId
              ),
              actionUrl: REPORT_ROUTE,
              nowMs,
            });
            alertRaised = true;
            notificationCount = queued.notifications;
            emailQueuedCount = queued.emails;
          }
        }
      }

      const recentRunsSnapshot = await db.collection('reportDispatchRuns').orderBy('startedAt', 'desc').limit(80).get();
      const recentRuns = recentRunsSnapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return { id: doc.id, ...data } as Record<string, unknown>;
      });
      const historicalHealthRuns = recentRuns
        .filter(
          (run) =>
            String(run['type'] ?? '') === 'daily_portfolio_report_health_check' &&
            String(run['id'] ?? '') !== healthRunId
        )
        .map((run) => ({
          id: String(run['id'] ?? ''),
          startedAt: Number(run['startedAt'] ?? 0),
          monitoredRunStatus: String(run['monitoredRunStatus'] ?? ''),
          autoRecoveryOutcome: String(run['autoRecoveryOutcome'] ?? ''),
          autoRecoverySlaStatus: String(run['autoRecoverySlaStatus'] ?? ''),
        }));

      const currentHealthState = {
        id: healthRunId,
        startedAt: Number(healthData.startedAt ?? nowMs),
        monitoredRunStatus: String(healthData.monitoredRunStatus ?? ''),
        autoRecoveryOutcome,
        autoRecoverySlaStatus,
      };

      const resilienceWindow = [currentHealthState, ...historicalHealthRuns]
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, REPORT_RESILIENCE_WINDOW_DAYS);

      resilienceIncidents7d = resilienceWindow.filter((run) => isHealthRunIncident(run)).length;
      for (const run of resilienceWindow) {
        if (!isHealthRunIncident(run)) {
          break;
        }
        resilienceConsecutiveIncidents += 1;
      }
      resilienceScore = Math.max(0, 100 - resilienceIncidents7d * 15 - resilienceConsecutiveIncidents * 10);
      resilienceEscalated = resilienceConsecutiveIncidents >= 3 || resilienceIncidents7d >= 4;

      if (resilienceEscalated) {
        const resilienceLockAcquired = await claimDailyReportResilienceAlertLock(
          db,
          dateKey,
          healthRunId,
          resilienceScore,
          resilienceIncidents7d,
          resilienceConsecutiveIncidents,
          nowMs
        );
        if (resilienceLockAcquired) {
          const recipients = await loadReportRecipients(db);
          recipientsCount = Math.max(recipientsCount, recipients.length);
          const queued = await queueActionNotificationForRecipients(db, recipients, {
            projectId: REPORT_PROJECT_ID,
            relatedId: healthRunId,
            type: 'report_dispatch_alert',
            title: `Alerte resiliente reporting - ${dateKey}`,
            message: buildDailyReportResilienceAlertMessage(
              dateKey,
              resilienceScore,
              resilienceIncidents7d,
              resilienceConsecutiveIncidents
            ),
            actionUrl: REPORT_ROUTE,
            nowMs,
          });
          resilienceAlertRaised = true;
          notificationCount += queued.notifications;
          emailQueuedCount += queued.emails;
        }
      }

      await healthRunRef.set(
        {
          autoRecoveryOutcome,
          autoRecoveryCheckedAt: nowMs,
          autoRecoveryAlertRaised: alertRaised,
          autoRecoveryAlertedAt: alertRaised ? nowMs : FieldValue.delete(),
          autoRecoverySlaTargetMinutes,
          autoRecoveryLatencyMinutes,
          autoRecoverySlaStatus,
          resilienceScore,
          resilienceIncidents7d,
          resilienceConsecutiveIncidents,
          resilienceEscalated,
        },
        { merge: true }
      );

      await runRef.set(
        {
          status: 'completed',
          completedAt: Date.now(),
          healthRunId,
          autoRecoveryRunRequestId: autoRecoveryRunRequestId || FieldValue.delete(),
          autoRecoveryOutcome,
          autoRecoverySlaTargetMinutes,
          autoRecoveryLatencyMinutes,
          autoRecoverySlaStatus,
          resilienceScore,
          resilienceIncidents7d,
          resilienceConsecutiveIncidents,
          resilienceEscalated,
          alertRaised,
          recipientsCount,
          notificationCount,
          emailQueuedCount,
        },
        { merge: true }
      );

      logger.info('Daily portfolio report recovery follow-up completed.', {
        runId,
        healthRunId,
        autoRecoveryRunRequestId: autoRecoveryRunRequestId || undefined,
        autoRecoveryOutcome,
        autoRecoverySlaStatus,
        autoRecoveryLatencyMinutes,
        autoRecoverySlaTargetMinutes,
        resilienceScore,
        resilienceIncidents7d,
        resilienceConsecutiveIncidents,
        resilienceEscalated,
        alertRaised,
        resilienceAlertRaised,
        notifications: notificationCount,
        emails: emailQueuedCount,
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      await runRef.set(
        {
          status: 'failed',
          failedAt: Date.now(),
          lastError: errorMessage,
        },
        { merge: true }
      );
      logger.error('Daily portfolio report recovery follow-up failed.', {
        runId,
        healthRunId,
        error: errorMessage,
      });
      throw error;
    }
  }
);

export const processOverdueDecisionActionEscalations = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Europe/Paris',
    region: 'europe-west1',
    timeoutSeconds: 180,
    memory: '512MiB',
  },
  async () => {
    const nowMs = Date.now();
    const dateKey = formatDateKey(new Date(nowMs), 'Europe/Paris');
    const openActions = await loadOpenDecisionActions(db);

    if (!openActions.length) {
      logger.info('No open decision actions for escalation.');
      return;
    }

    const roleRecipients = await loadUsersByRoles(db, DECISION_ACTION_ESCALATION_ROLES);
    const directUids = new Set<string>();
    openActions.forEach((action) => {
      if (action.ownerUid) {
        directUids.add(action.ownerUid);
      }
      if (action.createdByUid) {
        directUids.add(action.createdByUid);
      }
    });
    const directRecipientsMap = await loadUsersByUids(db, Array.from(directUids));
    const projectMap = await loadProjectsMap(db);

    let escalatedCount = 0;
    let notificationCount = 0;
    let emailCount = 0;

    for (const action of openActions) {
      const dueAt = parseDate(action.dueDate);
      if (dueAt <= 0 || dueAt >= nowMs) {
        continue;
      }

      const overdueDays = Math.max(1, Math.floor((nowMs - dueAt) / 86_400_000));
      const expectedLevel = computeEscalationLevel(overdueDays);
      const currentLevel = Number(action.escalationLevel ?? 0);
      if (expectedLevel <= currentLevel) {
        continue;
      }

      const recipients = mergeRecipients(
        roleRecipients,
        [directRecipientsMap.get(action.ownerUid), directRecipientsMap.get(action.createdByUid)]
      );
      if (!recipients.length) {
        continue;
      }

      const project = projectMap.get(action.projectId);
      const projectLabel = project ? `[${project.code}] ${project.name}` : action.projectId;
      const title = `Escalade action decisionnelle - Niveau ${expectedLevel}`;
      const message = `${projectLabel}: ${action.title} en retard de ${overdueDays} jour(s). Responsable: ${action.ownerUid}.`;
      const actionUrl = `/project-tracking/projects/${action.projectId}`;

      const queued = await queueActionNotificationForRecipients(db, recipients, {
        projectId: action.projectId,
        relatedId: action.id,
        type: 'decision_action_escalated',
        title,
        message,
        actionUrl,
        nowMs,
      });
      notificationCount += queued.notifications;
      emailCount += queued.emails;

      await db.collection('decisionActions').doc(action.id).set(
        {
          escalationLevel: expectedLevel,
          escalatedAt: nowMs,
          lastEscalationDateKey: dateKey,
          updatedAt: nowMs,
        },
        { merge: true }
      );

      await createActionAuditLog(db, action.projectId, {
        action: 'decision_action_escalated',
        targetId: action.id,
        message: `Escalade niveau ${expectedLevel} pour action en retard (${overdueDays}j): ${action.title}`,
        actorUid: SYSTEM_ACTOR_UID,
      });

      escalatedCount += 1;
    }

    logger.info('Decision action escalation run completed.', {
      openActions: openActions.length,
      escalated: escalatedCount,
      notifications: notificationCount,
      emails: emailCount,
    });
  }
);

export const dispatchPlannedDecisionActionReminders = onSchedule(
  {
    schedule: 'every day 08:15',
    timeZone: 'Europe/Paris',
    region: 'europe-west1',
    timeoutSeconds: 180,
    memory: '512MiB',
  },
  async () => {
    const nowMs = Date.now();
    const nowDate = new Date(nowMs);
    const dateKey = formatDateKey(nowDate, 'Europe/Paris');
    const todayKey = dateKey;
    const reminderLimitDate = new Date(nowMs + DECISION_ACTION_REMINDER_WINDOW_DAYS * 86_400_000);
    const reminderLimitKey = formatDateKey(reminderLimitDate, 'Europe/Paris');

    const openActions = await loadOpenDecisionActions(db);
    if (!openActions.length) {
      logger.info('No open decision actions for reminder.');
      return;
    }

    const roleRecipients = await loadUsersByRoles(db, DECISION_ACTION_REMINDER_ROLES);
    const directUids = new Set<string>();
    openActions.forEach((action) => {
      if (action.ownerUid) {
        directUids.add(action.ownerUid);
      }
      if (action.createdByUid) {
        directUids.add(action.createdByUid);
      }
    });
    const directRecipientsMap = await loadUsersByUids(db, Array.from(directUids));
    const projectMap = await loadProjectsMap(db);

    let reminderCount = 0;
    let notificationCount = 0;
    let emailCount = 0;

    for (const action of openActions) {
      const dueKey = normalizeDateKey(action.dueDate);
      if (!dueKey || action.lastReminderDateKey === dateKey) {
        continue;
      }

      const isOverdue = dueKey < todayKey;
      const isDueSoon = dueKey >= todayKey && dueKey <= reminderLimitKey;
      if (!isOverdue && !isDueSoon) {
        continue;
      }

      const recipients = isOverdue
        ? mergeRecipients(
            roleRecipients,
            [directRecipientsMap.get(action.ownerUid), directRecipientsMap.get(action.createdByUid)]
          )
        : mergeRecipients([directRecipientsMap.get(action.ownerUid), directRecipientsMap.get(action.createdByUid)]);
      if (!recipients.length) {
        continue;
      }

      const project = projectMap.get(action.projectId);
      const projectLabel = project ? `[${project.code}] ${project.name}` : action.projectId;
      const title = isOverdue ? 'Relance action decisionnelle en retard' : 'Relance action decisionnelle a echeance proche';
      const message = isOverdue
        ? `${projectLabel}: ${action.title} est en retard (echeance ${action.dueDate}).`
        : `${projectLabel}: ${action.title} arrive a echeance le ${action.dueDate}.`;
      const actionUrl = `/project-tracking/projects/${action.projectId}`;

      const queued = await queueActionNotificationForRecipients(db, recipients, {
        projectId: action.projectId,
        relatedId: action.id,
        type: 'decision_action_reminder',
        title,
        message,
        actionUrl,
        nowMs,
      });
      notificationCount += queued.notifications;
      emailCount += queued.emails;

      await db.collection('decisionActions').doc(action.id).set(
        {
          reminderCount: Number(action.reminderCount ?? 0) + 1,
          lastReminderAt: nowMs,
          lastReminderDateKey: dateKey,
        },
        { merge: true }
      );

      await createActionAuditLog(db, action.projectId, {
        action: 'decision_action_reminder_sent',
        targetId: action.id,
        message: `${isOverdue ? 'Relance retard' : 'Relance echeance proche'}: ${action.title}`,
        actorUid: SYSTEM_ACTOR_UID,
      });

      reminderCount += 1;
    }

    logger.info('Decision action reminder run completed.', {
      openActions: openActions.length,
      reminders: reminderCount,
      notifications: notificationCount,
      emails: emailCount,
      dateKey,
      reminderLimitKey,
    });
  }
);

async function loadOpenDecisionActions(firestore: Firestore): Promise<ProjectDecisionAction[]> {
  const snapshot = await firestore.collection('decisionActions').where('status', 'in', DECISION_ACTION_OPEN_STATUSES).get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Partial<ProjectDecisionAction>;
    return {
      id: doc.id,
      projectId: String(data.projectId ?? ''),
      title: String(data.title ?? ''),
      ownerUid: String(data.ownerUid ?? ''),
      createdByUid: String(data.createdByUid ?? ''),
      status: (data.status ?? 'todo') as DecisionActionStatus,
      dueDate: String(data.dueDate ?? ''),
      createdAt: Number(data.createdAt ?? 0),
      updatedAt: Number(data.updatedAt ?? 0),
      escalationLevel: Number(data.escalationLevel ?? 0),
      escalatedAt: data.escalatedAt ? Number(data.escalatedAt) : undefined,
      escalationAcknowledgedAt: data.escalationAcknowledgedAt ? Number(data.escalationAcknowledgedAt) : undefined,
      lastEscalationDateKey: data.lastEscalationDateKey ? String(data.lastEscalationDateKey) : undefined,
      reminderCount: Number(data.reminderCount ?? 0),
      lastReminderDateKey: data.lastReminderDateKey ? String(data.lastReminderDateKey) : undefined,
    };
  }).filter((action) => action.projectId.length > 0 && action.id.length > 0);
}

async function loadUsersByRoles(firestore: Firestore, roles: UserRole[]): Promise<UserProfile[]> {
  if (!roles.length) {
    return [];
  }

  const snapshot = await firestore.collection('users').where('role', 'in', roles).get();
  const users = new Map<string, UserProfile>();

  snapshot.forEach((doc) => {
    const data = doc.data() as Partial<UserProfile>;
    const uid = String(data.uid ?? doc.id ?? '').trim();
    if (!uid) {
      return;
    }

    users.set(uid, {
      uid,
      email: data.email ? String(data.email) : '',
      displayName: data.displayName ? String(data.displayName) : '',
      role: (data.role ?? 'stakeholder') as UserRole,
    });
  });

  return Array.from(users.values());
}

async function loadUsersByUids(firestore: Firestore, uids: string[]): Promise<Map<string, UserProfile>> {
  const byUid = new Map<string, UserProfile>();
  const normalizedUids = Array.from(new Set(uids.map((uid) => uid.trim()).filter((uid) => uid.length > 0)));

  for (const chunk of chunkArray(normalizedUids, 10)) {
    const snapshot = await firestore.collection('users').where('uid', 'in', chunk).get();
    snapshot.forEach((doc) => {
      const data = doc.data() as Partial<UserProfile>;
      const uid = String(data.uid ?? doc.id ?? '').trim();
      if (!uid) {
        return;
      }

      byUid.set(uid, {
        uid,
        email: data.email ? String(data.email) : '',
        displayName: data.displayName ? String(data.displayName) : '',
        role: (data.role ?? 'stakeholder') as UserRole,
      });
    });
  }

  return byUid;
}

async function loadProjectsMap(firestore: Firestore): Promise<Map<string, Project>> {
  const snapshot = await firestore.collection('projects').get();
  const byProjectId = new Map<string, Project>();

  snapshot.forEach((doc) => {
    const data = doc.data() as Partial<Project>;
    byProjectId.set(doc.id, {
      id: doc.id,
      code: String(data.code ?? ''),
      name: String(data.name ?? ''),
      status: (data.status ?? 'planned') as ProjectStatus,
      progress: Number(data.progress ?? 0),
      updatedAt: Number(data.updatedAt ?? 0),
    });
  });

  return byProjectId;
}

function mergeRecipients(...groups: Array<Array<UserProfile | undefined>>): UserProfile[] {
  const byUid = new Map<string, UserProfile>();

  for (const group of groups) {
    for (const user of group) {
      if (!user?.uid) {
        continue;
      }
      byUid.set(user.uid, user);
    }
  }

  return Array.from(byUid.values());
}

async function queueActionNotificationForRecipients(
  firestore: Firestore,
  recipients: UserProfile[],
  payload: {
    projectId: string;
    relatedId: string;
    type: ProjectNotification['type'];
    title: string;
    message: string;
    actionUrl: string;
    nowMs: number;
  }
): Promise<{ notifications: number; emails: number }> {
  if (!recipients.length) {
    return { notifications: 0, emails: 0 };
  }

  let notificationCount = 0;
  let emailCount = 0;

  for (const chunk of chunkArray(recipients, 200)) {
    const batch = firestore.batch();

    for (const recipient of chunk) {
      const notificationRef = firestore.collection('projectNotifications').doc();
      const channels: NotificationChannel[] = recipient.email ? ['in_app', 'email'] : ['in_app'];
      const notification: ProjectNotification = {
        id: notificationRef.id,
        projectId: payload.projectId,
        recipientUid: recipient.uid,
        actorUid: SYSTEM_ACTOR_UID,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        actionUrl: payload.actionUrl,
        channels,
        isRead: false,
        createdAt: payload.nowMs,
      };
      batch.set(notificationRef, notification);
      notificationCount += 1;

      if (recipient.email) {
        const outboxRef = firestore.collection('notificationOutbox').doc();
        const outbox: NotificationOutboxItem = {
          id: outboxRef.id,
          projectId: payload.projectId,
          notificationId: notificationRef.id,
          recipientUid: recipient.uid,
          recipientEmail: recipient.email,
          subject: payload.title,
          message: payload.message,
          actionUrl: payload.actionUrl,
          status: 'pending',
          requestedByUid: SYSTEM_ACTOR_UID,
          createdAt: payload.nowMs,
        };
        batch.set(outboxRef, outbox);
        emailCount += 1;
      }
    }

    await batch.commit();
  }

  return {
    notifications: notificationCount,
    emails: emailCount,
  };
}

async function createActionAuditLog(
  firestore: Firestore,
  projectId: string,
  input: {
    action: string;
    targetId: string;
    message: string;
    actorUid: string;
  }
): Promise<void> {
  const logRef = firestore.collection('auditLogs').doc();
  const log: AuditLog = {
    id: logRef.id,
    projectId,
    actorUid: input.actorUid,
    action: input.action,
    targetType: 'decision_action',
    targetId: input.targetId,
    message: input.message,
    createdAt: Date.now(),
  };
  await logRef.set(log);
}

function computeEscalationLevel(overdueDays: number): number {
  if (overdueDays >= 7) {
    return 3;
  }
  if (overdueDays >= 3) {
    return 2;
  }
  return 1;
}

function normalizeDateKey(rawDate: string): string {
  const trimmed = (rawDate ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

async function executePortfolioDigestRun(input: {
  firestore: Firestore;
  runRef: FirebaseFirestore.DocumentReference;
  runId: string;
  runType: string;
  dateKey: string;
  nowMs: number;
  requestedByUid: string;
}): Promise<void> {
  const { firestore, runRef, runId, runType, dateKey, nowMs, requestedByUid } = input;

  try {
    const digest = await buildPortfolioDigest(firestore, nowMs);
    const recipients = await loadReportRecipients(firestore);
    const notificationTitle = `Reporting portefeuille - ${dateKey}`;
    const summaryMessage = buildSummaryMessage(digest);
    const emailMessage = buildDetailedReportMessage(digest, dateKey);

    const dispatchStats = await queueDigestForRecipients(firestore, recipients, {
      title: notificationTitle,
      summaryMessage,
      emailMessage,
      actionUrl: REPORT_ROUTE,
      nowMs,
    });

    const frequency = runType === 'manual_portfolio_report' ? 'manual' : 'daily';
    const snapshotRef = firestore.collection('projectReportSnapshots').doc(runId);
    await snapshotRef.set({
      id: runId,
      runType,
      generatedAt: nowMs,
      dateKey,
      frequency,
      requestedByUid,
      totals: digest.totals,
      escalation: digest.escalation,
      topRiskProjects: digest.topRiskProjects,
      topBreachedActions: digest.topBreachedActions,
      recipientsCount: recipients.length,
      notificationCount: dispatchStats.notifications,
      emailQueuedCount: dispatchStats.emails,
    });

    await runRef.set(
      {
        status: 'completed',
        completedAt: Date.now(),
        requestedByUid,
        recipientsCount: recipients.length,
        notificationCount: dispatchStats.notifications,
        emailQueuedCount: dispatchStats.emails,
        snapshotId: runId,
        totals: digest.totals,
        escalation: digest.escalation,
      },
      { merge: true }
    );

    logger.info('Portfolio report dispatched.', {
      runId,
      runType,
      requestedByUid,
      recipients: recipients.length,
      notifications: dispatchStats.notifications,
      emails: dispatchStats.emails,
    });
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    await runRef.set(
      {
        status: 'failed',
        failedAt: Date.now(),
        lastError: errorMessage,
      },
      { merge: true }
    );
    logger.error('Portfolio report dispatch failed.', { runId, runType, error: errorMessage });
    throw error;
  }
}

async function claimRunLock(
  firestore: Firestore,
  runRef: FirebaseFirestore.DocumentReference,
  nowMs: number,
  dateKey: string,
  type = 'daily_portfolio_report',
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(runRef);
    if (snapshot.exists) {
      return false;
    }

    transaction.create(runRef, {
      id: runRef.id,
      dateKey,
      type,
      status: 'running',
      startedAt: nowMs,
      ...metadata,
    });

    return true;
  });
}

async function claimManualReportMutex(
  firestore: Firestore,
  manualRunId: string,
  nowMs: number
): Promise<boolean> {
  const mutexRef = firestore.collection(REPORT_CONTROL_COLLECTION).doc(REPORT_MANUAL_MUTEX_DOC);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(mutexRef);
    const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
    const activeManualRunId = String(data.activeManualRunId ?? '');
    const expiresAt = Number(data.expiresAt ?? 0);

    if (activeManualRunId && activeManualRunId !== manualRunId && expiresAt > nowMs) {
      return false;
    }

    transaction.set(
      mutexRef,
      {
        id: REPORT_MANUAL_MUTEX_DOC,
        activeManualRunId: manualRunId,
        lockedAt: nowMs,
        expiresAt: nowMs + REPORT_MANUAL_MUTEX_TTL_MS,
        updatedAt: nowMs,
      },
      { merge: true }
    );

    return true;
  });
}

async function releaseManualReportMutex(firestore: Firestore, manualRunId: string): Promise<void> {
  const mutexRef = firestore.collection(REPORT_CONTROL_COLLECTION).doc(REPORT_MANUAL_MUTEX_DOC);
  const nowMs = Date.now();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(mutexRef);
    if (!snapshot.exists) {
      return;
    }

    const data = snapshot.data() as Record<string, unknown>;
    const activeManualRunId = String(data.activeManualRunId ?? '');
    if (activeManualRunId && activeManualRunId !== manualRunId) {
      return;
    }

    transaction.set(
      mutexRef,
      {
        activeManualRunId: FieldValue.delete(),
        lockedAt: FieldValue.delete(),
        expiresAt: FieldValue.delete(),
        releasedAt: nowMs,
        updatedAt: nowMs,
      },
      { merge: true }
    );
  });
}

async function claimDailyReportHealthAlertLock(
  firestore: Firestore,
  dateKey: string,
  monitoredRunId: string,
  nowMs: number
): Promise<boolean> {
  const alertId = `${REPORT_DAILY_HEALTH_ALERT_PREFIX}_${dateKey}`;
  const alertRef = firestore.collection(REPORT_CONTROL_COLLECTION).doc(alertId);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(alertRef);
    if (snapshot.exists) {
      return false;
    }

    transaction.create(alertRef, {
      id: alertId,
      type: REPORT_DAILY_HEALTH_ALERT_PREFIX,
      dateKey,
      monitoredRunId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    return true;
  });
}

async function claimDailyReportAutoRecoveryLock(
  firestore: Firestore,
  dateKey: string,
  monitoredRunId: string,
  monitoredRunStatus: string,
  nowMs: number
): Promise<boolean> {
  const recoveryId = `${REPORT_DAILY_AUTO_RECOVERY_PREFIX}_${dateKey}`;
  const recoveryRef = firestore.collection(REPORT_CONTROL_COLLECTION).doc(recoveryId);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(recoveryRef);
    if (snapshot.exists) {
      return false;
    }

    transaction.create(recoveryRef, {
      id: recoveryId,
      type: REPORT_DAILY_AUTO_RECOVERY_PREFIX,
      dateKey,
      monitoredRunId,
      monitoredRunStatus,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    return true;
  });
}

async function claimDailyReportRecoveryAlertLock(
  firestore: Firestore,
  dateKey: string,
  healthRunId: string,
  outcome: string,
  nowMs: number
): Promise<boolean> {
  const alertId = `${REPORT_DAILY_RECOVERY_ALERT_PREFIX}_${dateKey}`;
  const alertRef = firestore.collection(REPORT_CONTROL_COLLECTION).doc(alertId);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(alertRef);
    if (snapshot.exists) {
      return false;
    }

    transaction.create(alertRef, {
      id: alertId,
      type: REPORT_DAILY_RECOVERY_ALERT_PREFIX,
      dateKey,
      healthRunId,
      outcome,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    return true;
  });
}

async function claimDailyReportResilienceAlertLock(
  firestore: Firestore,
  dateKey: string,
  healthRunId: string,
  score: number,
  incidents7d: number,
  consecutiveIncidents: number,
  nowMs: number
): Promise<boolean> {
  const alertId = `${REPORT_DAILY_RESILIENCE_ALERT_PREFIX}_${dateKey}`;
  const alertRef = firestore.collection(REPORT_CONTROL_COLLECTION).doc(alertId);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(alertRef);
    if (snapshot.exists) {
      return false;
    }

    transaction.create(alertRef, {
      id: alertId,
      type: REPORT_DAILY_RESILIENCE_ALERT_PREFIX,
      dateKey,
      healthRunId,
      score,
      incidents7d,
      consecutiveIncidents,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    return true;
  });
}

async function hasActiveManualReportRunRequest(firestore: Firestore): Promise<boolean> {
  const snapshot = await firestore
    .collection(REPORT_MANUAL_RUN_COLLECTION)
    .where('status', 'in', ['requested', 'running'])
    .limit(1)
    .get();
  return !snapshot.empty;
}

function buildDailyReportHealthAlertMessage(monitoredStatus: string, dateKey: string): string {
  if (monitoredStatus === 'failed') {
    return `Le digest quotidien du ${dateKey} est en echec. Verifiez les erreurs dans le reporting et relancez le digest.`;
  }
  if (monitoredStatus === 'running') {
    return `Le digest quotidien du ${dateKey} est toujours en cours apres la fenetre cible. Verifiez l'execution scheduler.`;
  }
  return `Le digest quotidien du ${dateKey} n'a pas ete genere. Verifiez le scheduler et lancez une relance manuelle.`;
}

function isHealthRunIncident(input: {
  monitoredRunStatus?: string;
  autoRecoveryOutcome?: string;
  autoRecoverySlaStatus?: string;
}): boolean {
  const monitoredStatus = String(input.monitoredRunStatus ?? '').trim();
  if (monitoredStatus && monitoredStatus !== 'completed') {
    return true;
  }

  const outcome = String(input.autoRecoveryOutcome ?? '').trim();
  if (['failed', 'missing_request', 'pending', 'health_run_missing'].includes(outcome)) {
    return true;
  }

  const slaStatus = String(input.autoRecoverySlaStatus ?? '').trim();
  if (slaStatus === 'breached') {
    return true;
  }

  return false;
}

function buildDailyReportRecoveryAlertMessage(
  outcome: string,
  slaStatus: string,
  latencyMinutes: number,
  targetMinutes: number,
  dateKey: string,
  recoveryRequestId: string
): string {
  if (outcome === 'completed' && slaStatus === 'breached') {
    return `L'auto-relance du digest quotidien (${recoveryRequestId}) est terminee hors SLA (${latencyMinutes} min > ${targetMinutes} min) pour ${dateKey}.`;
  }
  if (outcome === 'failed') {
    return `L'auto-relance du digest quotidien (${recoveryRequestId}) a echoue pour ${dateKey}. Intervention manuelle requise.`;
  }
  if (outcome === 'missing_request') {
    return `L'auto-relance du digest quotidien attendue (${recoveryRequestId}) est introuvable pour ${dateKey}. Verifiez la file des relances.`;
  }
  if (outcome === 'pending' && slaStatus === 'breached') {
    return `L'auto-relance du digest quotidien (${recoveryRequestId}) est encore en cours hors SLA (${latencyMinutes} min > ${targetMinutes} min) pour ${dateKey}.`;
  }
  return `L'auto-relance du digest quotidien (${recoveryRequestId}) est toujours en cours pour ${dateKey}. Verifiez l'execution et relancez si necessaire.`;
}

function buildDailyReportResilienceAlertMessage(
  dateKey: string,
  resilienceScore: number,
  incidents7d: number,
  consecutiveIncidents: number
): string {
  return `Resilience reporting degradee (${dateKey}): score ${resilienceScore}/100, incidents ${incidents7d}/${REPORT_RESILIENCE_WINDOW_DAYS} jours, serie courante ${consecutiveIncidents} jour(s).`;
}

async function buildPortfolioDigest(firestore: Firestore, nowMs: number): Promise<PortfolioDigest> {
  const [projectsSnapshot, activeActivitiesSnapshot, openBlockagesSnapshot, pendingDecisionsSnapshot, openDecisionActionsSnapshot] =
    await Promise.all([
      firestore.collection('projects').get(),
      firestore.collection('projectActivities').where('status', 'in', ['todo', 'in_progress', 'blocked']).get(),
      firestore.collection('projectBlockages').where('isResolved', '==', false).get(),
      firestore.collection('projectDecisions').where('status', '==', 'pending').get(),
      firestore.collection('decisionActions').where('status', 'in', DECISION_ACTION_OPEN_STATUSES).get(),
    ]);

  const projects = projectsSnapshot.docs.map((doc) => {
    const data = doc.data() as Partial<Project>;
    return {
      id: doc.id,
      code: String(data.code ?? ''),
      name: String(data.name ?? ''),
      status: (data.status ?? 'planned') as ProjectStatus,
      progress: Number(data.progress ?? 0),
      updatedAt: Number(data.updatedAt ?? 0),
    } as Project;
  });
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const delayedByProject = new Map<string, number>();
  activeActivitiesSnapshot.forEach((doc) => {
    const activity = doc.data() as ProjectActivity;
    if (!activity?.projectId) {
      return;
    }

    const dueTimestamp = parseDate(activity.dueDate);
    if (dueTimestamp < nowMs) {
      delayedByProject.set(activity.projectId, (delayedByProject.get(activity.projectId) ?? 0) + 1);
    }
  });

  const openBlockagesByProject = new Map<string, number>();
  openBlockagesSnapshot.forEach((doc) => {
    const blockage = doc.data() as ProjectBlockage;
    if (!blockage?.projectId) {
      return;
    }

    openBlockagesByProject.set(blockage.projectId, (openBlockagesByProject.get(blockage.projectId) ?? 0) + 1);
  });

  const pendingValidationsByProject = new Map<string, number>();
  pendingDecisionsSnapshot.forEach((doc) => {
    const decision = doc.data() as ProjectDecision;
    if (!decision?.projectId) {
      return;
    }

    pendingValidationsByProject.set(decision.projectId, (pendingValidationsByProject.get(decision.projectId) ?? 0) + 1);
  });

  const openDecisionActionsByProject = new Map<string, number>();
  const overdueDecisionActionsByProject = new Map<string, number>();
  const escalatedDecisionActionsByProject = new Map<string, number>();
  const breachedEscalationsByProject = new Map<string, number>();
  const escalationTotals: EscalationDigestTotals = {
    escalatedOpen: 0,
    unacknowledged: 0,
    acknowledged: 0,
    withinSla: 0,
    atRisk: 0,
    breached: 0,
  };
  const breachedEscalations: BreachedEscalationRow[] = [];

  openDecisionActionsSnapshot.forEach((doc) => {
    const data = doc.data() as Partial<ProjectDecisionAction>;
    const action: ProjectDecisionAction = {
      id: doc.id,
      projectId: String(data.projectId ?? ''),
      title: String(data.title ?? ''),
      ownerUid: String(data.ownerUid ?? ''),
      createdByUid: String(data.createdByUid ?? ''),
      status: (data.status ?? 'todo') as DecisionActionStatus,
      dueDate: String(data.dueDate ?? ''),
      createdAt: Number(data.createdAt ?? 0),
      updatedAt: Number(data.updatedAt ?? 0),
      escalationLevel: Number(data.escalationLevel ?? 0),
      escalatedAt: data.escalatedAt ? Number(data.escalatedAt) : undefined,
      escalationAcknowledgedAt: data.escalationAcknowledgedAt ? Number(data.escalationAcknowledgedAt) : undefined,
    };
    if (!action.projectId) {
      return;
    }

    openDecisionActionsByProject.set(action.projectId, (openDecisionActionsByProject.get(action.projectId) ?? 0) + 1);

    const dueAt = parseDate(action.dueDate);
    if (dueAt > 0 && dueAt < nowMs) {
      overdueDecisionActionsByProject.set(
        action.projectId,
        (overdueDecisionActionsByProject.get(action.projectId) ?? 0) + 1
      );
    }

    const escalationLevel = Number(action.escalationLevel ?? 0);
    if (escalationLevel <= 0) {
      return;
    }

    escalatedDecisionActionsByProject.set(
      action.projectId,
      (escalatedDecisionActionsByProject.get(action.projectId) ?? 0) + 1
    );

    escalationTotals.escalatedOpen += 1;
    const acknowledged = Boolean(action.escalationAcknowledgedAt);
    if (acknowledged) {
      escalationTotals.acknowledged += 1;
    } else {
      escalationTotals.unacknowledged += 1;
    }

    const slaTargetHours = getEscalationSlaTargetHours(escalationLevel);
    const referenceAt = Number(action.escalatedAt ?? action.updatedAt ?? action.createdAt ?? nowMs);
    const effectiveEndAt = Number(action.escalationAcknowledgedAt ?? nowMs);
    const elapsedHoursRaw = Math.max(0, (effectiveEndAt - referenceAt) / 3_600_000);
    const slaElapsedHours = Math.round(elapsedHoursRaw * 10) / 10;
    const slaStatus = getEscalationSlaStatus(slaElapsedHours, slaTargetHours, acknowledged);

    if (slaStatus === 'within_sla') {
      escalationTotals.withinSla += 1;
      return;
    }
    if (slaStatus === 'at_risk') {
      escalationTotals.atRisk += 1;
      return;
    }

    escalationTotals.breached += 1;
    breachedEscalationsByProject.set(action.projectId, (breachedEscalationsByProject.get(action.projectId) ?? 0) + 1);
    const project = projectById.get(action.projectId);
    breachedEscalations.push({
      actionId: action.id,
      projectId: action.projectId,
      projectCode: project?.code ?? '-',
      projectName: project?.name ?? 'Projet',
      title: action.title,
      ownerUid: action.ownerUid,
      escalationLevel,
      dueDate: action.dueDate,
      slaTargetHours,
      slaElapsedHours,
    });
  });

  const risks: PortfolioRiskRow[] = projects.map((project) => ({
    projectId: project.id,
    code: project.code,
    name: project.name,
    status: project.status,
    progress: Number(project.progress ?? 0),
    delayedActivities: delayedByProject.get(project.id) ?? 0,
    openBlockages: openBlockagesByProject.get(project.id) ?? 0,
    pendingValidations: pendingValidationsByProject.get(project.id) ?? 0,
    openDecisionActions: openDecisionActionsByProject.get(project.id) ?? 0,
    overdueDecisionActions: overdueDecisionActionsByProject.get(project.id) ?? 0,
    escalatedDecisionActions: escalatedDecisionActionsByProject.get(project.id) ?? 0,
    breachedEscalations: breachedEscalationsByProject.get(project.id) ?? 0,
    updatedAt: Number(project.updatedAt ?? 0),
  }));

  const totals: PortfolioDigestTotals = {
    projects: projects.length,
    inProgress: projects.filter((project) => project.status === 'in_progress').length,
    blocked: projects.filter((project) => project.status === 'blocked').length,
    completed: projects.filter((project) => project.status === 'validated' || project.status === 'closed').length,
    delayedActivities: risks.reduce((sum, row) => sum + row.delayedActivities, 0),
    openBlockages: risks.reduce((sum, row) => sum + row.openBlockages, 0),
    pendingValidations: risks.reduce((sum, row) => sum + row.pendingValidations, 0),
    openDecisionActions: risks.reduce((sum, row) => sum + row.openDecisionActions, 0),
    overdueDecisionActions: risks.reduce((sum, row) => sum + row.overdueDecisionActions, 0),
    escalatedDecisionActions: risks.reduce((sum, row) => sum + row.escalatedDecisionActions, 0),
    breachedEscalations: risks.reduce((sum, row) => sum + row.breachedEscalations, 0),
  };

  const topRiskProjects = risks
    .filter(
      (row) =>
        row.delayedActivities > 0 ||
        row.openBlockages > 0 ||
        row.pendingValidations > 0 ||
        row.openDecisionActions > 0 ||
        row.overdueDecisionActions > 0 ||
        row.escalatedDecisionActions > 0 ||
        row.breachedEscalations > 0
    )
    .sort(
      (a, b) =>
        scoreRiskRow(b) - scoreRiskRow(a) ||
        b.updatedAt - a.updatedAt
    )
    .slice(0, 8);

  const topBreachedActions = breachedEscalations
    .sort(
      (a, b) =>
        b.escalationLevel - a.escalationLevel ||
        b.slaElapsedHours - a.slaElapsedHours ||
        parseDate(a.dueDate) - parseDate(b.dueDate)
    )
    .slice(0, 8);

  return {
    totals,
    escalation: escalationTotals,
    topRiskProjects,
    topBreachedActions,
  };
}

async function loadReportRecipients(firestore: Firestore): Promise<UserProfile[]> {
  const snapshot = await firestore.collection('users').where('role', 'in', REPORT_RECIPIENT_ROLES).get();
  const byUid = new Map<string, UserProfile>();

  snapshot.forEach((doc) => {
    const data = doc.data() as UserProfile;
    const uid = data.uid || doc.id;
    if (!uid) {
      return;
    }

    byUid.set(uid, {
      uid,
      email: data.email ?? '',
      displayName: data.displayName ?? '',
      role: data.role,
    });
  });

  return Array.from(byUid.values()).sort((a, b) => a.uid.localeCompare(b.uid));
}

async function queueDigestForRecipients(
  firestore: Firestore,
  recipients: UserProfile[],
  payload: {
    title: string;
    summaryMessage: string;
    emailMessage: string;
    actionUrl: string;
    nowMs: number;
  }
): Promise<{ notifications: number; emails: number }> {
  if (!recipients.length) {
    return { notifications: 0, emails: 0 };
  }

  let notificationCount = 0;
  let emailCount = 0;

  for (const chunk of chunkArray(recipients, 200)) {
    const batch = firestore.batch();

    for (const recipient of chunk) {
      const notificationRef = firestore.collection('projectNotifications').doc();
      const channels: Array<'in_app' | 'email'> = recipient.email ? ['in_app', 'email'] : ['in_app'];
      const notification: ProjectNotification = {
        id: notificationRef.id,
        projectId: REPORT_PROJECT_ID,
        recipientUid: recipient.uid,
        actorUid: SYSTEM_ACTOR_UID,
        type: 'report_digest',
        title: payload.title,
        message: payload.summaryMessage,
        actionUrl: payload.actionUrl,
        channels,
        isRead: false,
        createdAt: payload.nowMs,
      };
      batch.set(notificationRef, notification);
      notificationCount += 1;

      if (recipient.email) {
        const outboxRef = firestore.collection('notificationOutbox').doc();
        const outbox: NotificationOutboxItem = {
          id: outboxRef.id,
          projectId: REPORT_PROJECT_ID,
          notificationId: notificationRef.id,
          recipientUid: recipient.uid,
          recipientEmail: recipient.email,
          subject: payload.title,
          message: payload.emailMessage,
          actionUrl: payload.actionUrl,
          status: 'pending',
          requestedByUid: SYSTEM_ACTOR_UID,
          createdAt: payload.nowMs,
        };
        batch.set(outboxRef, outbox);
        emailCount += 1;
      }
    }

    await batch.commit();
  }

  return {
    notifications: notificationCount,
    emails: emailCount,
  };
}

function buildSummaryMessage(digest: PortfolioDigest): string {
  const { totals, escalation } = digest;
  return `Projets: ${totals.projects} | Retards: ${totals.delayedActivities} | Blocages: ${totals.openBlockages} | Validations: ${totals.pendingValidations} | Actions ouvertes: ${totals.openDecisionActions} (en retard: ${totals.overdueDecisionActions}) | Escalades ouvertes: ${escalation.escalatedOpen} (hors SLA: ${escalation.breached})`;
}

function buildDetailedReportMessage(digest: PortfolioDigest, dateKey: string): string {
  const { totals, escalation, topRiskProjects, topBreachedActions } = digest;
  const lines: string[] = [];

  lines.push(`Reporting automatique du portefeuille - ${dateKey}`);
  lines.push('');
  lines.push(`Projets suivis: ${totals.projects}`);
  lines.push(`En cours: ${totals.inProgress}`);
  lines.push(`Bloques: ${totals.blocked}`);
  lines.push(`Finalises: ${totals.completed}`);
  lines.push(`Activites en retard: ${totals.delayedActivities}`);
  lines.push(`Blocages ouverts: ${totals.openBlockages}`);
  lines.push(`Validations en attente: ${totals.pendingValidations}`);
  lines.push(`Actions decisionnelles ouvertes: ${totals.openDecisionActions}`);
  lines.push(`Actions decisionnelles en retard: ${totals.overdueDecisionActions}`);
  lines.push(`Actions decisionnelles escaladees: ${totals.escalatedDecisionActions}`);
  lines.push(`Escalades hors SLA: ${totals.breachedEscalations}`);
  lines.push('');
  lines.push(`Escalades ouvertes: ${escalation.escalatedOpen}`);
  lines.push(`Escalades sans accuse: ${escalation.unacknowledged}`);
  lines.push(`Escalades prises en charge: ${escalation.acknowledged}`);
  lines.push(`SLA respectees: ${escalation.withinSla}`);
  lines.push(`SLA a risque: ${escalation.atRisk}`);
  lines.push(`SLA hors cible: ${escalation.breached}`);
  lines.push('');

  if (topRiskProjects.length) {
    lines.push('Projets prioritaires (risques):');
    topRiskProjects.forEach((row, index) => {
      lines.push(
        `${index + 1}. [${row.code}] ${row.name} - Retards: ${row.delayedActivities}, Blocages: ${row.openBlockages}, Validations: ${row.pendingValidations}, Actions ouvertes: ${row.openDecisionActions} (en retard: ${row.overdueDecisionActions}), Progression: ${row.progress}%`
      );
    });
  } else {
    lines.push('Aucun projet a risque critique aujourd hui.');
  }

  lines.push('');
  if (topBreachedActions.length) {
    lines.push('Actions escaladees hors SLA (prioritaires):');
    topBreachedActions.forEach((row, index) => {
      lines.push(
        `${index + 1}. [${row.projectCode}] ${row.projectName} - ${row.title} (Niveau ${row.escalationLevel}, Responsable: ${row.ownerUid}, Cible: ${row.slaTargetHours}h, Ecoule: ${row.slaElapsedHours}h, Echeance: ${row.dueDate})`
      );
    });
  } else {
    lines.push('Aucune action escaladee hors SLA aujourd hui.');
  }

  return lines.join('\n');
}

function createTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

function loadSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim() ?? '';
  const portRaw = process.env.SMTP_PORT?.trim() ?? '';
  const user = process.env.SMTP_USER?.trim() ?? '';
  const pass = process.env.SMTP_PASS ?? '';
  const from = process.env.SMTP_FROM?.trim() ?? '';
  const replyTo = process.env.SMTP_REPLY_TO?.trim() || undefined;
  const appBaseUrl = process.env.APP_BASE_URL?.trim() || undefined;

  const port = Number(portRaw);
  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  const secure = port === 465 || (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true';

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    replyTo,
    appBaseUrl,
  };
}

function buildActionLink(actionUrl: string | undefined, appBaseUrl: string | undefined): string | undefined {
  if (!actionUrl) {
    return undefined;
  }

  if (/^https?:\/\//i.test(actionUrl)) {
    return actionUrl;
  }

  if (!appBaseUrl) {
    return undefined;
  }

  const normalizedBase = appBaseUrl.replace(/\/+$/, '');
  const normalizedPath = actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildPlainTextBody(message: string, actionLink?: string): string {
  if (!actionLink) {
    return message;
  }

  return `${message}\n\nOuvrir le suivi: ${actionLink}`;
}

function buildHtmlBody(message: string, actionLink?: string): string {
  const escapedMessage = escapeHtml(message).replace(/\n/g, '<br>');
  if (!actionLink) {
    return `<p>${escapedMessage}</p>`;
  }

  const escapedLink = escapeHtml(actionLink);
  return `<p>${escapedMessage}</p><p><a href="${escapedLink}" target="_blank" rel="noopener noreferrer">Ouvrir le suivi</a></p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseDate(value: string | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getEscalationSlaTargetHours(level: number): number {
  if (level >= 3) {
    return 8;
  }
  if (level === 2) {
    return 24;
  }
  return 48;
}

function getEscalationSlaStatus(
  elapsedHours: number,
  targetHours: number,
  acknowledged: boolean
): EscalationSlaStatus {
  if (acknowledged) {
    return elapsedHours <= targetHours ? 'within_sla' : 'breached';
  }

  if (elapsedHours > targetHours) {
    return 'breached';
  }

  if (elapsedHours >= targetHours * 0.75) {
    return 'at_risk';
  }

  return 'pending';
}

function scoreRiskRow(row: PortfolioRiskRow): number {
  return (
    row.delayedActivities * 3 +
    row.openBlockages * 4 +
    row.pendingValidations * 2 +
    row.openDecisionActions * 1 +
    row.overdueDecisionActions * 3 +
    row.escalatedDecisionActions * 2 +
    row.breachedEscalations * 4
  );
}

function formatDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 800);
  }

  return String(error).slice(0, 800);
}
