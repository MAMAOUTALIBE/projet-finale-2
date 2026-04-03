import { ProjectStatus } from './project.model';

export type DecisionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface DecisionSupportAction {
  id: string;
  projectId: string;
  code: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  delayedActivities: number;
  openBlockages: number;
  criticalBlockages: number;
  pendingValidations: number;
  openDecisionActions: number;
  overdueDecisionActions: number;
  riskScore: number;
  priority: DecisionPriority;
  mainIssue: string;
  recommendation: string;
  updatedAt: number;
  actionUrl: string;
}

export interface DecisionSupportSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  blockedProjects: number;
  averageProgress: number;
}

export interface DecisionSupportData {
  summary: DecisionSupportSummary;
  actions: DecisionSupportAction[];
}
