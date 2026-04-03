import { ProjectStatus } from './project.model';
import { BlockageSeverity } from './project-blockage.model';

export interface ProjectReportRow {
  projectId: string;
  code: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  stages: number;
  activities: number;
  delayedActivities: number;
  openBlockages: number;
  pendingValidations: number;
  openDecisionActions: number;
  overdueDecisionActions: number;
  escalatedDecisionActions: number;
  breachedEscalations: number;
  updatedAt: number;
}

export interface PortfolioBlockageCauseRow {
  cause: string;
  openCount: number;
  totalCount: number;
  impactedProjects: number;
  criticalOpenCount: number;
}

export interface PortfolioBlockageSeverityRow {
  severity: BlockageSeverity;
  openCount: number;
  totalCount: number;
  share: number;
}

export interface PortfolioBlockageProjectRow {
  projectId: string;
  code: string;
  name: string;
  openBlockages: number;
  criticalOpenCount: number;
  lastBlockageAt: number;
}

export interface PortfolioBlockageInsights {
  totalBlockages: number;
  openBlockages: number;
  resolvedBlockages: number;
  causeDistribution: PortfolioBlockageCauseRow[];
  severityDistribution: PortfolioBlockageSeverityRow[];
  topProjects: PortfolioBlockageProjectRow[];
}

export interface ReportSnapshotTotals {
  projects: number;
  inProgress: number;
  blocked: number;
  completed: number;
  delayedActivities: number;
  openBlockages: number;
  pendingValidations: number;
  openDecisionActions: number;
  overdueDecisionActions: number;
  escalatedDecisionActions?: number;
  breachedEscalations?: number;
}

export interface ReportSnapshotEscalationTotals {
  escalatedOpen: number;
  unacknowledged: number;
  acknowledged: number;
  withinSla: number;
  atRisk: number;
  breached: number;
}

export interface ProjectReportSnapshot {
  id: string;
  dateKey: string;
  generatedAt: number;
  frequency: string;
  recipientsCount: number;
  notificationCount: number;
  emailQueuedCount: number;
  totals: ReportSnapshotTotals;
  escalation?: ReportSnapshotEscalationTotals;
}

export interface ReportDispatchRun {
  id: string;
  dateKey: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  failedAt?: number;
  lastError?: string;
  snapshotId?: string;
  recipientsCount?: number;
  notificationCount?: number;
  emailQueuedCount?: number;
  monitoredRunId?: string;
  monitoredRunStatus?: string;
  healthy?: boolean;
  alertRaised?: boolean;
  autoRecoveryAttempted?: boolean;
  autoRecoveryTriggered?: boolean;
  autoRecoveryRunRequestId?: string;
  autoRecoveryOutcome?: string;
  autoRecoveryCheckedAt?: number;
  autoRecoveryAlertRaised?: boolean;
  autoRecoverySlaTargetMinutes?: number;
  autoRecoveryLatencyMinutes?: number;
  autoRecoverySlaStatus?: string;
  resilienceScore?: number;
  resilienceIncidents7d?: number;
  resilienceConsecutiveIncidents?: number;
  resilienceEscalated?: boolean;
}

export interface ReportManualRun {
  id: string;
  type: string;
  requestedByUid: string;
  requestedAt: number;
  status: 'requested' | 'running' | 'completed' | 'failed';
  source?: string;
  runId?: string;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  lastError?: string;
  updatedAt?: number;
}
