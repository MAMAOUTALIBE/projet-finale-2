export type DecisionJournalEntryType = 'validation_request' | 'document_validation' | 'governance_action';

export type DecisionJournalStatus = 'pending' | 'approved' | 'rejected' | 'info';

export interface DecisionJournalEntry {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  type: DecisionJournalEntryType;
  status: DecisionJournalStatus;
  title: string;
  detail: string;
  actorUid: string;
  targetUid?: string;
  level?: number;
  createdAt: number;
  decidedAt?: number;
  actionUrl: string;
}

export interface DecisionJournalSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  recent7d: number;
}

export interface DecisionJournalData {
  summary: DecisionJournalSummary;
  entries: DecisionJournalEntry[];
}
