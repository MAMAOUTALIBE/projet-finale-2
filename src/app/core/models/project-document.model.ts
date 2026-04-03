export type DocumentValidationStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface ProjectDocument {
  id: string;
  projectId: string;
  documentGroupId?: string;
  version?: number;
  isLatest?: boolean;
  isArchived?: boolean;
  supersedesDocumentId?: string;
  archivedAt?: number;
  archivedByUid?: string;
  validationStatus?: DocumentValidationStatus;
  submittedByUid?: string;
  submittedAt?: number;
  decidedByUid?: string;
  decidedAt?: number;
  decisionComment?: string;
  fileName: string;
  fileType: string;
  size: number;
  storagePath: string;
  downloadUrl: string;
  uploadedByUid: string;
  description: string;
  createdAt: number;
}
