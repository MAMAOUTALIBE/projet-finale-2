export type WorkspaceItemType = 'activity' | 'validation' | 'blockage' | 'document';

export type WorkspacePriority = 'high' | 'medium' | 'low';

export interface WorkspaceItem {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  type: WorkspaceItemType;
  title: string;
  detail: string;
  status: string;
  dueAt?: number;
  createdAt: number;
  priority: WorkspacePriority;
  actionUrl: string;
}

export interface WorkspaceSummary {
  myActivities: number;
  overdueActivities: number;
  pendingValidations: number;
  myOpenBlockages: number;
  documentsToReview: number;
}

export interface ProjectWorkspaceData {
  summary: WorkspaceSummary;
  items: WorkspaceItem[];
}
