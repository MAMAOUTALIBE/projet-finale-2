import { ProjectStatus } from './project.model';

export type DecisionActionPriority = 'critical' | 'high' | 'medium' | 'low';

export type DecisionActionStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type EscalationSlaStatus = 'pending' | 'within_sla' | 'at_risk' | 'breached';

export interface ProjectDecisionAction {
  id: string;
  projectId: string;
  decisionId?: string;
  stageId?: string;
  title: string;
  description: string;
  ownerUid: string;
  dueDate: string;
  priority: DecisionActionPriority;
  status: DecisionActionStatus;
  resolutionNote: string;
  createdByUid: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  escalationLevel?: number;
  escalatedAt?: number;
  lastEscalationDateKey?: string;
  reminderCount?: number;
  lastReminderAt?: number;
  lastReminderDateKey?: string;
  escalationAcknowledgedAt?: number;
  escalationAcknowledgedByUid?: string;
  escalationAckComment?: string;
}

export type ProjectDecisionActionCreatePayload = Omit<
  ProjectDecisionAction,
  | 'id'
  | 'projectId'
  | 'status'
  | 'resolutionNote'
  | 'createdByUid'
  | 'createdAt'
  | 'updatedAt'
  | 'completedAt'
  | 'escalationLevel'
  | 'escalatedAt'
  | 'lastEscalationDateKey'
  | 'reminderCount'
  | 'lastReminderAt'
  | 'lastReminderDateKey'
  | 'escalationAcknowledgedAt'
  | 'escalationAcknowledgedByUid'
  | 'escalationAckComment'
>;

export interface DecisionActionPlanItem {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: ProjectStatus;
  title: string;
  description: string;
  ownerUid: string;
  dueDate: string;
  priority: DecisionActionPriority;
  status: DecisionActionStatus;
  resolutionNote: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  escalatedAt?: number;
  escalationLevel: number;
  reminderCount: number;
  escalationAcknowledgedAt?: number;
  escalationAcknowledgedByUid?: string;
  escalationAckComment?: string;
  slaTargetHours?: number;
  slaElapsedHours?: number;
  slaStatus?: EscalationSlaStatus;
  overdue: boolean;
  actionUrl: string;
}

export interface DecisionActionPlanSummary {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  done: number;
  overdue: number;
  criticalOrHigh: number;
}

export interface DecisionActionPlanData {
  summary: DecisionActionPlanSummary;
  items: DecisionActionPlanItem[];
}

export interface EscalationPerformanceSummary {
  escalated: number;
  unacknowledged: number;
  acknowledged: number;
  withinSla: number;
  atRisk: number;
  breached: number;
  averageAckHours: number;
}

export interface EscalationPerformanceData {
  summary: EscalationPerformanceSummary;
  items: DecisionActionPlanItem[];
}
