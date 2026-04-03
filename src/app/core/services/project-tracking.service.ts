import { Injectable, inject } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AuditLog, AuditLogCreatePayload } from '../models/audit-log.model';
import { ProjectActivity, ProjectActivityCreatePayload, ProjectActivityUpdatePayload } from '../models/project-activity.model';
import { ProjectAlert, ProjectAlertSeverity } from '../models/project-alert.model';
import { ProjectBlockage, ProjectBlockageCreatePayload } from '../models/project-blockage.model';
import {
  DecisionActionPlanData,
  EscalationPerformanceData,
  DecisionActionPlanItem,
  DecisionActionPriority,
  EscalationSlaStatus,
  DecisionActionStatus,
  ProjectDecisionAction,
  ProjectDecisionActionCreatePayload,
} from '../models/project-decision-action.model';
import {
  ProjectDecision,
  ProjectDecisionCreatePayload,
  ValidationDecisionStatus,
} from '../models/project-decision.model';
import { DocumentValidationStatus, ProjectDocument } from '../models/project-document.model';
import {
  NotificationChannel,
  NotificationOutboxItem,
  ProjectNotification,
  ProjectNotificationType,
} from '../models/project-notification.model';
import { Project, ProjectCreatePayload } from '../models/project.model';
import {
  DecisionPriority,
  DecisionSupportAction,
  DecisionSupportData,
  DecisionSupportSummary,
} from '../models/project-decision-support.model';
import {
  DecisionJournalData,
  DecisionJournalEntry,
  DecisionJournalEntryType,
  DecisionJournalStatus,
  DecisionJournalSummary,
} from '../models/project-decision-journal.model';
import {
  PortfolioBlockageCauseRow,
  PortfolioBlockageInsights,
  PortfolioBlockageProjectRow,
  PortfolioBlockageSeverityRow,
  ProjectReportSnapshot,
  ReportDispatchRun,
  ReportManualRun,
  ReportSnapshotEscalationTotals,
  ReportSnapshotTotals,
  ProjectReportRow,
} from '../models/project-report.model';
import { ProjectWorkspaceData, WorkspaceItem, WorkspacePriority, WorkspaceSummary } from '../models/project-workspace.model';
import { ProjectStage, ProjectStageCreatePayload, ProjectStageUpdatePayload } from '../models/project-stage.model';
import { UserProfile, UserRole } from '../models/user-role.model';
import { RoleService } from './role.service';
import { AuthService } from '../../shared/services/auth.service';

export interface ProjectDashboardMetrics {
  total: number;
  inProgress: number;
  blocked: number;
  completed: number;
}

interface AuthContext {
  uid: string;
  role: UserRole;
}

interface NotificationDispatchInput {
  type: ProjectNotificationType;
  title: string;
  message: string;
  actionUrl: string;
  relatedId?: string;
  recipientRoles?: UserRole[];
  recipientUids?: string[];
  excludeUids?: string[];
  channels?: NotificationChannel[];
}

@Injectable({
  providedIn: 'root',
})
export class ProjectTrackingService {
  private afs = inject(AngularFirestore);
  private afAuth = inject(AngularFireAuth);
  private storage = inject(AngularFireStorage);
  private roleService = inject(RoleService);
  private authService = inject(AuthService);

  private readonly projectCollection = 'projects';
  private readonly stageCollection = 'projectStages';
  private readonly activityCollection = 'projectActivities';
  private readonly blockageCollection = 'projectBlockages';
  private readonly decisionCollection = 'projectDecisions';
  private readonly decisionActionCollection = 'decisionActions';
  private readonly documentCollection = 'projectDocuments';
  private readonly notificationCollection = 'projectNotifications';
  private readonly notificationOutboxCollection = 'notificationOutbox';
  private readonly auditCollection = 'auditLogs';
  private readonly reportSnapshotCollection = 'projectReportSnapshots';
  private readonly reportDispatchRunCollection = 'reportDispatchRuns';
  private readonly reportManualRunCollection = 'reportManualRuns';
  private readonly manualReportRunType = 'manual_portfolio_report';
  private readonly usersCollection = 'users';

  private readonly projectWriteRoles: UserRole[] = ['admin', 'pmo', 'project_manager'];
  private readonly reportDispatchRoles: UserRole[] = ['admin', 'pmo', 'project_manager', 'decision_maker'];
  private readonly validationDecisionRoles: UserRole[] = [
    'admin',
    'pmo',
    'project_manager',
    'validator',
    'decision_maker',
  ];
  private readonly decisionActionWriteRoles: UserRole[] = ['admin', 'pmo', 'project_manager', 'decision_maker'];
  private readonly maxDocumentSizeBytes = 10 * 1024 * 1024;
  private readonly allowedDocumentMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
  ]);

  listProjects(): Observable<Project[]> {
    return this.afs
      .collection<Project>(this.projectCollection, (ref) => ref.orderBy('updatedAt', 'desc'))
      .valueChanges({ idField: 'id' })
      .pipe(
        map((projects) =>
          projects.map((project) => ({
            ...project,
            progress: Number(project.progress ?? 0),
            budget: Number(project.budget ?? 0),
          }))
        ),
        catchError(() => of([]))
      );
  }

  getProject(projectId: string): Observable<Project | null> {
    return this.afs
      .doc<Project>(`${this.projectCollection}/${projectId}`)
      .valueChanges({ idField: 'id' })
      .pipe(map((project) => project ?? null));
  }

  async createProject(payload: ProjectCreatePayload): Promise<string> {
    const context = await this.requireProjectWriter('Creation projet non autorisee pour ce role.');

    const id = this.afs.createId();
    const now = Date.now();
    const project: Project = {
      id,
      code: payload.code.trim(),
      name: payload.name.trim(),
      description: payload.description.trim(),
      sponsor: payload.sponsor.trim(),
      ownerOrganization: payload.ownerOrganization.trim(),
      startDate: payload.startDate,
      endDate: payload.endDate,
      budget: Number(payload.budget),
      status: payload.status,
      progress: Number(payload.progress ?? 0),
      createdBy: context.uid,
      createdAt: now,
      updatedAt: now,
    };

    await this.afs.doc<Project>(`${this.projectCollection}/${id}`).set(project);
    await this.createAuditLog(id, {
      projectId: id,
      action: 'project_created',
      targetType: 'project',
      targetId: id,
      message: `Projet cree: ${project.name}`,
    });

    return id;
  }

  async updateProject(projectId: string, changes: Partial<Project>): Promise<void> {
    await this.requireProjectWriter('Mise a jour projet non autorisee pour ce role.');

    const payload = {
      ...changes,
      updatedAt: Date.now(),
    };

    await this.afs.doc<Project>(`${this.projectCollection}/${projectId}`).update(payload);

    await this.createAuditLog(projectId, {
      projectId,
      action: 'project_updated',
      targetType: 'project',
      targetId: projectId,
      message: 'Projet mis a jour',
    });
  }

  listStages(projectId: string): Observable<ProjectStage[]> {
    if (!projectId) {
      return of([]);
    }

    return this.afs
      .collection<ProjectStage>(this.stageCollection, (ref) =>
        ref.where('projectId', '==', projectId).orderBy('order', 'asc')
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((stages) =>
          stages.map((stage) => ({
            ...stage,
            progress: Number(stage.progress ?? 0),
            order: Number(stage.order ?? 0),
          }))
        )
      );
  }

  async createStage(projectId: string, payload: ProjectStageCreatePayload): Promise<string> {
    await this.requireProjectWriter('Creation etape non autorisee pour ce role.');

    const id = this.afs.createId();
    const now = Date.now();
    const stage: ProjectStage = {
      id,
      projectId,
      name: payload.name.trim(),
      order: Number(payload.order),
      responsibleUid: payload.responsibleUid.trim(),
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: payload.status,
      progress: Number(payload.progress ?? 0),
      createdAt: now,
      updatedAt: now,
    };

    await this.afs.doc<ProjectStage>(`${this.stageCollection}/${id}`).set(stage);
    await this.createAuditLog(projectId, {
      projectId,
      action: 'stage_created',
      targetType: 'stage',
      targetId: id,
      message: `Etape creee: ${stage.name}`,
    });

    return id;
  }

  async updateStage(projectId: string, stageId: string, changes: ProjectStageUpdatePayload): Promise<void> {
    await this.requireProjectWriter('Mise a jour etape non autorisee pour ce role.');

    await this.afs.doc<ProjectStage>(`${this.stageCollection}/${stageId}`).update({
      ...changes,
      updatedAt: Date.now(),
    });

    await this.createAuditLog(projectId, {
      projectId,
      action: 'stage_updated',
      targetType: 'stage',
      targetId: stageId,
      message: 'Etape mise a jour',
    });
  }

  listActivities(projectId: string): Observable<ProjectActivity[]> {
    if (!projectId) {
      return of([]);
    }

    return this.afs
      .collection<ProjectActivity>(this.activityCollection, (ref) =>
        ref.where('projectId', '==', projectId).orderBy('dueDate', 'asc')
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((activities) =>
          activities.map((activity) => ({
            ...activity,
            progress: Number(activity.progress ?? 0),
            dependencyActivityIds: activity.dependencyActivityIds ?? [],
          }))
        )
      );
  }

  async createActivity(projectId: string, payload: ProjectActivityCreatePayload): Promise<string> {
    await this.requireProjectWriter('Creation activite non autorisee pour ce role.');

    const id = this.afs.createId();
    const now = Date.now();
    const activity: ProjectActivity = {
      id,
      projectId,
      stageId: payload.stageId,
      title: payload.title.trim(),
      description: payload.description.trim(),
      responsibleUid: payload.responsibleUid.trim(),
      dueDate: payload.dueDate,
      status: payload.status,
      progress: Number(payload.progress),
      dependencyActivityIds: payload.dependencyActivityIds,
      createdAt: now,
      updatedAt: now,
    };

    await this.afs.doc<ProjectActivity>(`${this.activityCollection}/${id}`).set(activity);
    await this.createAuditLog(projectId, {
      projectId,
      action: 'activity_created',
      targetType: 'activity',
      targetId: id,
      message: `Activite creee: ${activity.title}`,
    });

    return id;
  }

  async updateActivity(projectId: string, activityId: string, changes: ProjectActivityUpdatePayload): Promise<void> {
    await this.requireProjectWriter('Mise a jour activite non autorisee pour ce role.');

    await this.afs.doc<ProjectActivity>(`${this.activityCollection}/${activityId}`).update({
      ...changes,
      updatedAt: Date.now(),
    });

    await this.createAuditLog(projectId, {
      projectId,
      action: 'activity_updated',
      targetType: 'activity',
      targetId: activityId,
      message: 'Activite mise a jour',
    });
  }

  listBlockages(projectId: string): Observable<ProjectBlockage[]> {
    if (!projectId) {
      return of([]);
    }

    return this.afs
      .collection<ProjectBlockage>(this.blockageCollection, (ref) =>
        ref.where('projectId', '==', projectId).orderBy('createdAt', 'desc')
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((blockages) =>
          blockages.map((blockage) => ({
            ...blockage,
            isResolved: Boolean(blockage.isResolved),
          }))
        )
      );
  }

  async createBlockage(projectId: string, payload: ProjectBlockageCreatePayload): Promise<string> {
    const context = await this.getAuthenticatedContext();

    const id = this.afs.createId();
    const now = Date.now();
    const blockage: ProjectBlockage = {
      id,
      projectId,
      stageId: payload.stageId?.trim() || undefined,
      activityId: payload.activityId?.trim() || undefined,
      title: payload.title.trim(),
      cause: payload.cause.trim(),
      impact: payload.impact.trim(),
      severity: payload.severity,
      ownerUid: context.uid,
      isResolved: false,
      createdAt: now,
    };

    await this.afs.doc<ProjectBlockage>(`${this.blockageCollection}/${id}`).set(blockage);
    await this.createAuditLog(projectId, {
      projectId,
      action: 'blockage_created',
      targetType: 'blockage',
      targetId: id,
      message: `Blocage signale: ${blockage.title}`,
    });

    return id;
  }

  async resolveBlockage(projectId: string, blockageId: string): Promise<void> {
    const context = await this.getAuthenticatedContext();
    const blockageRef = this.afs.doc<ProjectBlockage>(`${this.blockageCollection}/${blockageId}`).ref;
    const snapshot = await blockageRef.get();

    if (!snapshot.exists) {
      throw new Error('Blocage introuvable.');
    }

    const blockage = snapshot.data();
    const canManage =
      this.projectWriteRoles.includes(context.role) ||
      (context.role === 'decision_maker' && blockage?.isResolved !== true) ||
      blockage?.ownerUid === context.uid;

    if (!canManage) {
      throw new Error('Resolution blocage non autorisee pour ce role.');
    }

    await this.afs.doc<ProjectBlockage>(`${this.blockageCollection}/${blockageId}`).update({
      isResolved: true,
      resolvedAt: Date.now(),
    });

    await this.createAuditLog(projectId, {
      projectId,
      action: 'blockage_resolved',
      targetType: 'blockage',
      targetId: blockageId,
      message: 'Blocage resolu',
    });
  }

  listDecisions(projectId: string): Observable<ProjectDecision[]> {
    if (!projectId) {
      return of([]);
    }

    return this.afs
      .collection<ProjectDecision>(this.decisionCollection, (ref) =>
        ref.where('projectId', '==', projectId).orderBy('createdAt', 'desc')
      )
      .valueChanges({ idField: 'id' });
  }

  async createValidationRequest(projectId: string, payload: ProjectDecisionCreatePayload): Promise<string> {
    const context = await this.requireProjectWriter('Demande de validation non autorisee pour ce role.');

    const id = this.afs.createId();
    const now = Date.now();

    const decision: ProjectDecision = {
      id,
      projectId,
      stageId: payload.stageId,
      requestedByUid: context.uid,
      validatorUid: payload.validatorUid.trim(),
      level: Number(payload.level),
      status: 'pending',
      comment: payload.comment.trim(),
      createdAt: now,
    };

    await this.afs.doc<ProjectDecision>(`${this.decisionCollection}/${id}`).set(decision);
    await this.createAuditLog(projectId, {
      projectId,
      action: 'validation_requested',
      targetType: 'decision',
      targetId: id,
      message: `Validation demandee niveau ${decision.level}`,
    });

    return id;
  }

  async decideValidation(
    projectId: string,
    decisionId: string,
    status: Exclude<ValidationDecisionStatus, 'pending'>,
    comment?: string
  ): Promise<void> {
    const context = await this.getAuthenticatedContext();
    this.assertRole(
      context.role,
      this.validationDecisionRoles,
      'Decision de validation non autorisee pour ce role.'
    );

    const decisionRef = this.afs.doc<ProjectDecision>(`${this.decisionCollection}/${decisionId}`).ref;
    const decisionSnapshot = await decisionRef.get();
    if (!decisionSnapshot.exists) {
      throw new Error('Demande de validation introuvable.');
    }

    const decision = decisionSnapshot.data();
    if (decision?.status !== 'pending') {
      throw new Error('Cette demande de validation est deja traitee.');
    }

    await this.afs.doc<ProjectDecision>(`${this.decisionCollection}/${decisionId}`).update({
      status,
      comment: comment?.trim() || '',
      decidedAt: Date.now(),
    });

    await this.createAuditLog(projectId, {
      projectId,
      action: status === 'approved' ? 'validation_approved' : 'validation_rejected',
      targetType: 'decision',
      targetId: decisionId,
      message: status === 'approved' ? 'Validation approuvee' : 'Validation rejetee',
    });
  }

  listDecisionActions(projectId: string): Observable<ProjectDecisionAction[]> {
    if (!projectId) {
      return of([]);
    }

    return this.afs
      .collection<ProjectDecisionAction>(this.decisionActionCollection, (ref) =>
        ref.where('projectId', '==', projectId).orderBy('dueDate', 'asc')
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((actions) =>
          actions.map((action) => ({
            ...action,
            priority: (action.priority ?? 'medium') as DecisionActionPriority,
            status: (action.status ?? 'todo') as DecisionActionStatus,
            resolutionNote: action.resolutionNote ?? '',
            createdAt: Number(action.createdAt ?? 0),
            updatedAt: Number(action.updatedAt ?? 0),
            completedAt: action.completedAt ? Number(action.completedAt) : undefined,
            escalationLevel: Number(action.escalationLevel ?? 0),
            escalatedAt: action.escalatedAt ? Number(action.escalatedAt) : undefined,
            lastEscalationDateKey: action.lastEscalationDateKey || undefined,
            reminderCount: Number(action.reminderCount ?? 0),
            lastReminderAt: action.lastReminderAt ? Number(action.lastReminderAt) : undefined,
            lastReminderDateKey: action.lastReminderDateKey || undefined,
            escalationAcknowledgedAt: action.escalationAcknowledgedAt
              ? Number(action.escalationAcknowledgedAt)
              : undefined,
            escalationAcknowledgedByUid: action.escalationAcknowledgedByUid || undefined,
            escalationAckComment: action.escalationAckComment || '',
          }))
        )
      );
  }

  async createDecisionAction(projectId: string, payload: ProjectDecisionActionCreatePayload): Promise<string> {
    const context = await this.getAuthenticatedContext();
    this.assertRole(
      context.role,
      this.decisionActionWriteRoles,
      'Creation action decisionnelle non autorisee pour ce role.'
    );

    const id = this.afs.createId();
    const now = Date.now();
    const action: ProjectDecisionAction = {
      id,
      projectId,
      decisionId: payload.decisionId?.trim() || undefined,
      stageId: payload.stageId?.trim() || undefined,
      title: payload.title.trim(),
      description: payload.description.trim(),
      ownerUid: payload.ownerUid.trim(),
      dueDate: payload.dueDate,
      priority: payload.priority,
      status: 'todo',
      resolutionNote: '',
      createdByUid: context.uid,
      createdAt: now,
      updatedAt: now,
      escalationLevel: 0,
      reminderCount: 0,
    };

    await this.afs.doc<ProjectDecisionAction>(`${this.decisionActionCollection}/${id}`).set(action);
    await this.createAuditLog(projectId, {
      projectId,
      action: 'decision_action_created',
      targetType: 'decision_action',
      targetId: id,
      message: `Action decisionnelle creee: ${action.title}`,
    });

    await this.dispatchProjectNotifications(projectId, {
      type: 'decision_action_assigned',
      title: 'Nouvelle action decisionnelle',
      message: `${action.title} vous est assignee (priorite ${action.priority}, echeance ${action.dueDate}).`,
      actionUrl: `/project-tracking/projects/${projectId}`,
      relatedId: id,
      recipientUids: [action.ownerUid],
      excludeUids: [context.uid],
      channels: ['in_app', 'email'],
    });

    return id;
  }

  async updateDecisionActionStatus(
    projectId: string,
    actionId: string,
    status: DecisionActionStatus,
    resolutionNote = ''
  ): Promise<void> {
    const context = await this.getAuthenticatedContext();
    const actionRef = this.afs.doc<ProjectDecisionAction>(`${this.decisionActionCollection}/${actionId}`).ref;
    const actionSnapshot = await actionRef.get();

    if (!actionSnapshot.exists) {
      throw new Error('Action decisionnelle introuvable.');
    }

    const action = actionSnapshot.data();
    if (!action || action.projectId !== projectId) {
      throw new Error('Action decisionnelle invalide pour ce projet.');
    }

    const canManage =
      this.decisionActionWriteRoles.includes(context.role) ||
      action.ownerUid === context.uid;
    if (!canManage) {
      throw new Error('Mise a jour action decisionnelle non autorisee pour ce role.');
    }

    const now = Date.now();
    const updatePayload: Partial<ProjectDecisionAction> = {
      status,
      resolutionNote: resolutionNote.trim(),
      updatedAt: now,
    };
    if (status === 'done') {
      updatePayload.completedAt = now;
    }

    await this.afs.doc<ProjectDecisionAction>(`${this.decisionActionCollection}/${actionId}`).update(updatePayload);

    const statusActionLogMap: Record<DecisionActionStatus, string> = {
      todo: 'decision_action_reopened',
      in_progress: 'decision_action_started',
      blocked: 'decision_action_blocked',
      done: 'decision_action_completed',
    };
    const statusLabelMap: Record<DecisionActionStatus, string> = {
      todo: 'relancee',
      in_progress: 'demarree',
      blocked: 'bloquee',
      done: 'terminee',
    };

    await this.createAuditLog(projectId, {
      projectId,
      action: statusActionLogMap[status],
      targetType: 'decision_action',
      targetId: actionId,
      message: `Action decisionnelle ${statusLabelMap[status]}: ${action.title}`,
    });

    await this.dispatchProjectNotifications(projectId, {
      type: 'decision_action_status',
      title: 'Mise a jour action decisionnelle',
      message: `${action.title} est maintenant ${statusLabelMap[status]}.`,
      actionUrl: `/project-tracking/projects/${projectId}`,
      relatedId: actionId,
      recipientRoles: ['admin', 'pmo', 'project_manager', 'decision_maker'],
      recipientUids: [action.ownerUid, action.createdByUid],
      excludeUids: [context.uid],
      channels: ['in_app', 'email'],
    });
  }

  async acknowledgeDecisionActionEscalation(projectId: string, actionId: string, comment = ''): Promise<void> {
    const context = await this.getAuthenticatedContext();
    const actionRef = this.afs.doc<ProjectDecisionAction>(`${this.decisionActionCollection}/${actionId}`).ref;
    const actionSnapshot = await actionRef.get();

    if (!actionSnapshot.exists) {
      throw new Error('Action decisionnelle introuvable.');
    }

    const action = actionSnapshot.data();
    if (!action || action.projectId !== projectId) {
      throw new Error('Action decisionnelle invalide pour ce projet.');
    }

    const canAcknowledge =
      this.decisionActionWriteRoles.includes(context.role) ||
      action.ownerUid === context.uid;
    if (!canAcknowledge) {
      throw new Error('Accuse de prise en charge non autorise pour ce role.');
    }

    if (Number(action.escalationLevel ?? 0) <= 0) {
      throw new Error('Cette action n est pas escaladee.');
    }

    const now = Date.now();
    await this.afs.doc<ProjectDecisionAction>(`${this.decisionActionCollection}/${actionId}`).update({
      escalationAcknowledgedAt: now,
      escalationAcknowledgedByUid: context.uid,
      escalationAckComment: comment.trim() || 'Prise en charge accusee.',
      updatedAt: now,
    });

    await this.createAuditLog(projectId, {
      projectId,
      action: 'decision_action_acknowledged',
      targetType: 'decision_action',
      targetId: actionId,
      message: `Escalade prise en charge: ${action.title}`,
    });

    await this.dispatchProjectNotifications(projectId, {
      type: 'decision_action_acknowledged',
      title: 'Escalade prise en charge',
      message: `${action.title} est prise en charge par ${context.uid}.`,
      actionUrl: `/project-tracking/projects/${projectId}`,
      relatedId: actionId,
      recipientRoles: ['admin', 'pmo', 'project_manager', 'decision_maker'],
      recipientUids: [action.ownerUid, action.createdByUid],
      excludeUids: [context.uid],
      channels: ['in_app', 'email'],
    });
  }

  listProjectDocuments(projectId: string): Observable<ProjectDocument[]> {
    if (!projectId) {
      return of([]);
    }

    return this.afs
      .collection<ProjectDocument>(this.documentCollection, (ref) =>
        ref.where('projectId', '==', projectId).orderBy('createdAt', 'desc')
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((documents) =>
          documents.map((document) => ({
            ...document,
            documentGroupId: document.documentGroupId ?? document.id,
            version: Number(document.version ?? 1),
            isLatest: document.isLatest ?? true,
            isArchived: Boolean(document.isArchived),
            validationStatus: (document.validationStatus ?? 'draft') as DocumentValidationStatus,
            size: Number(document.size ?? 0),
          }))
        )
      );
  }

  async uploadProjectDocument(
    projectId: string,
    file: File,
    description = '',
    supersededDocumentId?: string
  ): Promise<string> {
    const context = await this.getAuthenticatedContext();
    this.assertDocumentIsAllowed(file);

    const id = this.afs.createId();
    const now = Date.now();
    const safeFileName = this.sanitizeFileName(file.name);
    const storagePath = `project-documents/${projectId}/${id}-${safeFileName}`;
    let documentGroupId = id;
    let version = 1;

    if (supersededDocumentId) {
      const supersededSnapshot = await this.afs
        .doc<ProjectDocument>(`${this.documentCollection}/${supersededDocumentId}`)
        .ref.get();
      if (!supersededSnapshot.exists) {
        throw new Error('Document source introuvable pour creer une nouvelle version.');
      }

      const supersededDocument = supersededSnapshot.data();
      if (!supersededDocument || supersededDocument.projectId !== projectId) {
        throw new Error('Le document source ne correspond pas au projet courant.');
      }

      documentGroupId = supersededDocument.documentGroupId ?? supersededDocument.id;
      version = Number(supersededDocument.version ?? 1) + 1;
    }

    const uploadSnapshot = await this.storage.storage.ref(storagePath).put(file, {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        projectId,
        uploaderUid: context.uid,
      },
    });
    const downloadUrl = await uploadSnapshot.ref.getDownloadURL();

    const document: ProjectDocument = {
      id,
      projectId,
      documentGroupId,
      version,
      isLatest: true,
      isArchived: false,
      validationStatus: 'draft',
      supersedesDocumentId: supersededDocumentId,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      size: file.size,
      storagePath,
      downloadUrl,
      uploadedByUid: context.uid,
      description: description.trim(),
      createdAt: now,
    };

    const batch = this.afs.firestore.batch();
    const newDocumentRef = this.afs.firestore.collection(this.documentCollection).doc(id);
    batch.set(newDocumentRef, document as ProjectDocument);
    if (supersededDocumentId) {
      const supersededDocumentRef = this.afs.firestore.collection(this.documentCollection).doc(supersededDocumentId);
      batch.update(supersededDocumentRef, {
        isLatest: false,
      });
    }
    await batch.commit();

    await this.createAuditLog(projectId, {
      projectId,
      action: 'document_uploaded',
      targetType: 'document',
      targetId: id,
      message: `Piece justificative ajoutee: ${file.name}`,
    });

    return id;
  }

  async archiveProjectDocument(projectId: string, documentId: string): Promise<void> {
    const context = await this.getAuthenticatedContext();
    const documentRef = this.afs.doc<ProjectDocument>(`${this.documentCollection}/${documentId}`).ref;
    const documentSnapshot = await documentRef.get();

    if (!documentSnapshot.exists) {
      throw new Error('Document introuvable.');
    }

    const document = documentSnapshot.data();
    if (!document || document.projectId !== projectId) {
      throw new Error('Document invalide pour ce projet.');
    }

    const canManage =
      this.projectWriteRoles.includes(context.role) ||
      document.uploadedByUid === context.uid;

    if (!canManage) {
      throw new Error('Archivage document non autorise pour ce role.');
    }

    if (document.isArchived) {
      return;
    }

    await this.afs.doc<ProjectDocument>(`${this.documentCollection}/${documentId}`).update({
      isArchived: true,
      isLatest: false,
      archivedAt: Date.now(),
      archivedByUid: context.uid,
    });

    await this.createAuditLog(projectId, {
      projectId,
      action: 'document_archived',
      targetType: 'document',
      targetId: documentId,
      message: `Piece justificative archivee: ${document.fileName}`,
    });
  }

  async submitProjectDocumentForValidation(projectId: string, documentId: string): Promise<void> {
    const context = await this.getAuthenticatedContext();
    const documentRef = this.afs.doc<ProjectDocument>(`${this.documentCollection}/${documentId}`).ref;
    const documentSnapshot = await documentRef.get();

    if (!documentSnapshot.exists) {
      throw new Error('Document introuvable.');
    }

    const document = documentSnapshot.data();
    if (!document || document.projectId !== projectId) {
      throw new Error('Document invalide pour ce projet.');
    }

    const canSubmit =
      this.projectWriteRoles.includes(context.role) ||
      document.uploadedByUid === context.uid;

    if (!canSubmit) {
      throw new Error('Soumission document non autorisee pour ce role.');
    }

    if (document.isArchived) {
      throw new Error('Impossible de soumettre un document archive.');
    }

    await this.afs.doc<ProjectDocument>(`${this.documentCollection}/${documentId}`).update({
      validationStatus: 'submitted',
      submittedAt: Date.now(),
      submittedByUid: context.uid,
      decisionComment: '',
    });

    await this.createAuditLog(projectId, {
      projectId,
      action: 'document_submitted',
      targetType: 'document',
      targetId: documentId,
      message: `Piece justificative soumise: ${document.fileName}`,
    });

    await this.dispatchProjectNotifications(projectId, {
      type: 'document_submitted',
      title: 'Document soumis',
      message: `${document.fileName} a ete soumis pour validation.`,
      actionUrl: `/project-tracking/projects/${projectId}`,
      relatedId: documentId,
      recipientRoles: ['validator', 'decision_maker', 'admin', 'pmo', 'project_manager'],
      excludeUids: [context.uid],
      channels: ['in_app', 'email'],
    });
  }

  async decideProjectDocumentValidation(
    projectId: string,
    documentId: string,
    status: Exclude<DocumentValidationStatus, 'draft' | 'submitted'>,
    comment = ''
  ): Promise<void> {
    const context = await this.getAuthenticatedContext();
    this.assertRole(
      context.role,
      this.validationDecisionRoles,
      'Decision de validation document non autorisee pour ce role.'
    );

    const documentRef = this.afs.doc<ProjectDocument>(`${this.documentCollection}/${documentId}`).ref;
    const documentSnapshot = await documentRef.get();
    if (!documentSnapshot.exists) {
      throw new Error('Document introuvable.');
    }

    const document = documentSnapshot.data();
    if (!document || document.projectId !== projectId) {
      throw new Error('Document invalide pour ce projet.');
    }

    if (document.isArchived) {
      throw new Error('Impossible de valider un document archive.');
    }

    if ((document.validationStatus ?? 'draft') !== 'submitted') {
      throw new Error('Le document doit etre soumis avant validation.');
    }

    await this.afs.doc<ProjectDocument>(`${this.documentCollection}/${documentId}`).update({
      validationStatus: status,
      decidedAt: Date.now(),
      decidedByUid: context.uid,
      decisionComment: comment.trim(),
    });

    await this.createAuditLog(projectId, {
      projectId,
      action: status === 'approved' ? 'document_approved' : 'document_rejected',
      targetType: 'document',
      targetId: documentId,
      message: status === 'approved'
        ? `Piece justificative approuvee: ${document.fileName}`
        : `Piece justificative rejetee: ${document.fileName}`,
    });

    await this.dispatchProjectNotifications(projectId, {
      type: status === 'approved' ? 'document_approved' : 'document_rejected',
      title: status === 'approved' ? 'Document approuve' : 'Document rejete',
      message: status === 'approved'
        ? `${document.fileName} a ete approuve.`
        : `${document.fileName} a ete rejete.`,
      actionUrl: `/project-tracking/projects/${projectId}`,
      relatedId: documentId,
      recipientUids: [document.uploadedByUid],
      excludeUids: [context.uid],
      channels: ['in_app', 'email'],
    });
  }

  getProjectAlerts(projectId: string): Observable<ProjectAlert[]> {
    return combineLatest([
      this.listActivities(projectId),
      this.listBlockages(projectId),
      this.listDecisions(projectId),
      this.listProjectDocuments(projectId),
      this.listDecisionActions(projectId),
    ]).pipe(
      map(([activities, blockages, decisions, documents, decisionActions]) => {
        const now = Date.now();

        const activityAlerts: ProjectAlert[] = activities
          .filter((activity) => activity.status !== 'done' && this.parseDate(activity.dueDate) < now)
          .map((activity) => {
            const due = this.parseDate(activity.dueDate);
            const overdueDays = Math.floor((now - due) / 86_400_000);
            const severity: ProjectAlertSeverity = overdueDays > 14 ? 'critical' : overdueDays > 7 ? 'high' : 'medium';

            return {
              id: `delay-${activity.id}`,
              projectId,
              type: 'delay',
              severity,
              message: `Activite en retard (${overdueDays}j): ${activity.title}`,
              relatedId: activity.id,
              createdAt: due,
              resolved: false,
            };
          });

        const blockageAlerts: ProjectAlert[] = blockages.map((blockage) => ({
          id: `blockage-${blockage.id}`,
          projectId,
          type: 'blockage',
          severity: blockage.severity,
          message: `${blockage.isResolved ? '[Resolu]' : '[Ouvert]'} Blocage: ${blockage.title}`,
          relatedId: blockage.id,
          createdAt: blockage.createdAt,
          resolved: blockage.isResolved,
        }));

        const validationAlerts: ProjectAlert[] = decisions
          .filter((decision) => decision.status === 'pending')
          .map((decision) => ({
            id: `validation-${decision.id}`,
            projectId,
            type: 'validation',
            severity: 'medium',
            message: `Validation en attente niveau ${decision.level}`,
            relatedId: decision.id,
            createdAt: decision.createdAt,
            resolved: false,
          }));

        const documentAlerts: ProjectAlert[] = documents
          .filter((document) => !document.isArchived && (document.validationStatus ?? 'draft') === 'submitted')
          .map((document) => ({
            id: `document-validation-${document.id}`,
            projectId,
            type: 'validation',
            severity: 'medium' as ProjectAlertSeverity,
            message: `Document en attente de validation: ${document.fileName}`,
            relatedId: document.id,
            createdAt: document.submittedAt ?? document.createdAt,
            resolved: false,
          }));

        const decisionActionAlerts: ProjectAlert[] = decisionActions
          .filter((action) => action.status !== 'done' && this.parseDate(action.dueDate) < now)
          .map((action) => ({
            id: `decision-action-delay-${action.id}`,
            projectId,
            type: 'delay' as const,
            severity: this.alertSeverityFromDecisionActionPriority(action.priority),
            message: `Action decisionnelle en retard: ${action.title}`,
            relatedId: action.id,
            createdAt: this.parseDate(action.dueDate),
            resolved: false,
          }));

        return [...activityAlerts, ...blockageAlerts, ...validationAlerts, ...documentAlerts, ...decisionActionAlerts]
          .sort(
            (a, b) =>
              this.alertSeverityRank(b.severity) - this.alertSeverityRank(a.severity) || b.createdAt - a.createdAt
          );
      })
    );
  }

  listAuditLogs(projectId: string): Observable<AuditLog[]> {
    if (!projectId) {
      return of([]);
    }

    return this.afs
      .collection<AuditLog>(this.auditCollection, (ref) =>
        ref.where('projectId', '==', projectId).orderBy('createdAt', 'desc')
      )
      .valueChanges({ idField: 'id' });
  }

  getPortfolioReportRows(): Observable<ProjectReportRow[]> {
    return this.listProjects().pipe(
      switchMap((projects) => {
        if (projects.length === 0) {
          return of([]);
        }

        const rowsStreams = projects.map((project) =>
          combineLatest([
            this.listStages(project.id),
            this.listActivities(project.id),
            this.listBlockages(project.id),
            this.listDecisions(project.id),
            this.listDecisionActions(project.id),
          ]).pipe(
            map(([stages, activities, blockages, decisions, decisionActions]) => {
              const now = Date.now();
              const delayedActivities = activities.filter(
                (activity) => activity.status !== 'done' && this.parseDate(activity.dueDate) < now
              ).length;
              const openDecisionActions = decisionActions.filter((action) => action.status !== 'done');
              const overdueDecisionActions = openDecisionActions.filter(
                (action) => this.parseDate(action.dueDate) < now
              ).length;

              const escalatedDecisionActions = openDecisionActions.filter(
                (action) => Number(action.escalationLevel ?? 0) > 0
              );
              const breachedEscalations = escalatedDecisionActions.filter((action) => {
                const escalationLevel = Number(action.escalationLevel ?? 0);
                const targetHours = this.getEscalationSlaTargetHours(escalationLevel);
                const referenceAt = Number(action.escalatedAt ?? action.updatedAt ?? action.createdAt ?? now);
                const effectiveEndAt = Number(action.escalationAcknowledgedAt ?? now);
                const elapsedHours = Math.max(0, (effectiveEndAt - referenceAt) / 3_600_000);
                const status = this.getEscalationSlaStatus(
                  elapsedHours,
                  targetHours,
                  Boolean(action.escalationAcknowledgedAt)
                );
                return status === 'breached';
              }).length;

              return {
                projectId: project.id,
                code: project.code,
                name: project.name,
                status: project.status,
                progress: project.progress,
                stages: stages.length,
                activities: activities.length,
                delayedActivities,
                openBlockages: blockages.filter((blockage) => !blockage.isResolved).length,
                pendingValidations: decisions.filter((decision) => decision.status === 'pending').length,
                openDecisionActions: openDecisionActions.length,
                overdueDecisionActions,
                escalatedDecisionActions: escalatedDecisionActions.length,
                breachedEscalations,
                updatedAt: project.updatedAt,
              } as ProjectReportRow;
            })
          )
        );

        return combineLatest(rowsStreams).pipe(
          map((rows) => rows.sort((a, b) => b.updatedAt - a.updatedAt))
        );
      })
    );
  }

  getReportSnapshotHistory(limit = 15): Observable<ProjectReportSnapshot[]> {
    const normalizedLimit = Math.max(5, limit);

    return this.afs
      .collection<ProjectReportSnapshot>(this.reportSnapshotCollection, (ref) =>
        ref.orderBy('generatedAt', 'desc').limit(normalizedLimit)
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((snapshots) =>
          snapshots
            .map((snapshot) => {
              const totalsRaw = (snapshot as any).totals ?? {};
              const escalationRaw = (snapshot as any).escalation ?? null;
              const totals: ReportSnapshotTotals = {
                projects: Number(totalsRaw.projects ?? 0),
                inProgress: Number(totalsRaw.inProgress ?? 0),
                blocked: Number(totalsRaw.blocked ?? 0),
                completed: Number(totalsRaw.completed ?? 0),
                delayedActivities: Number(totalsRaw.delayedActivities ?? 0),
                openBlockages: Number(totalsRaw.openBlockages ?? 0),
                pendingValidations: Number(totalsRaw.pendingValidations ?? 0),
                openDecisionActions: Number(totalsRaw.openDecisionActions ?? 0),
                overdueDecisionActions: Number(totalsRaw.overdueDecisionActions ?? 0),
                escalatedDecisionActions: Number(totalsRaw.escalatedDecisionActions ?? 0),
                breachedEscalations: Number(totalsRaw.breachedEscalations ?? 0),
              };

              const escalation = escalationRaw
                ? ({
                    escalatedOpen: Number(escalationRaw.escalatedOpen ?? 0),
                    unacknowledged: Number(escalationRaw.unacknowledged ?? 0),
                    acknowledged: Number(escalationRaw.acknowledged ?? 0),
                    withinSla: Number(escalationRaw.withinSla ?? 0),
                    atRisk: Number(escalationRaw.atRisk ?? 0),
                    breached: Number(escalationRaw.breached ?? 0),
                  } as ReportSnapshotEscalationTotals)
                : undefined;

              return {
                id: snapshot.id,
                dateKey: snapshot.dateKey || '',
                generatedAt: Number(snapshot.generatedAt ?? 0),
                frequency: snapshot.frequency || 'daily',
                recipientsCount: Number(snapshot.recipientsCount ?? 0),
                notificationCount: Number(snapshot.notificationCount ?? 0),
                emailQueuedCount: Number(snapshot.emailQueuedCount ?? 0),
                totals,
                escalation,
              } as ProjectReportSnapshot;
            })
            .sort((a, b) => b.generatedAt - a.generatedAt)
        )
      );
  }

  getReportDispatchRunHistory(limit = 15): Observable<ReportDispatchRun[]> {
    const normalizedLimit = Math.max(5, limit);

    return this.afs
      .collection<ReportDispatchRun>(this.reportDispatchRunCollection, (ref) =>
        ref.orderBy('startedAt', 'desc').limit(normalizedLimit)
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((runs) =>
          runs
            .map((run) => {
              const runRaw = run as any;
              const status = run.status;
              const normalizedStatus: ReportDispatchRun['status'] =
                status === 'completed' || status === 'failed' || status === 'running' ? status : 'running';

              return {
                id: run.id,
                dateKey: run.dateKey || '',
                type: run.type || 'daily_portfolio_report',
                status: normalizedStatus,
                startedAt: Number(run.startedAt ?? 0),
                completedAt: run.completedAt ? Number(run.completedAt) : undefined,
                failedAt: run.failedAt ? Number(run.failedAt) : undefined,
                lastError: run.lastError || undefined,
                snapshotId: run.snapshotId || undefined,
                recipientsCount: run.recipientsCount != null ? Number(run.recipientsCount) : undefined,
                notificationCount: run.notificationCount != null ? Number(run.notificationCount) : undefined,
                emailQueuedCount: run.emailQueuedCount != null ? Number(run.emailQueuedCount) : undefined,
                monitoredRunId: runRaw.monitoredRunId ? String(runRaw.monitoredRunId) : undefined,
                monitoredRunStatus: runRaw.monitoredRunStatus ? String(runRaw.monitoredRunStatus) : undefined,
                healthy: runRaw.healthy != null ? Boolean(runRaw.healthy) : undefined,
                alertRaised: runRaw.alertRaised != null ? Boolean(runRaw.alertRaised) : undefined,
                autoRecoveryAttempted:
                  runRaw.autoRecoveryAttempted != null ? Boolean(runRaw.autoRecoveryAttempted) : undefined,
                autoRecoveryTriggered:
                  runRaw.autoRecoveryTriggered != null ? Boolean(runRaw.autoRecoveryTriggered) : undefined,
                autoRecoveryRunRequestId: runRaw.autoRecoveryRunRequestId
                  ? String(runRaw.autoRecoveryRunRequestId)
                  : undefined,
                autoRecoveryOutcome: runRaw.autoRecoveryOutcome ? String(runRaw.autoRecoveryOutcome) : undefined,
                autoRecoveryCheckedAt:
                  runRaw.autoRecoveryCheckedAt != null ? Number(runRaw.autoRecoveryCheckedAt) : undefined,
                autoRecoveryAlertRaised:
                  runRaw.autoRecoveryAlertRaised != null ? Boolean(runRaw.autoRecoveryAlertRaised) : undefined,
                autoRecoverySlaTargetMinutes:
                  runRaw.autoRecoverySlaTargetMinutes != null ? Number(runRaw.autoRecoverySlaTargetMinutes) : undefined,
                autoRecoveryLatencyMinutes:
                  runRaw.autoRecoveryLatencyMinutes != null ? Number(runRaw.autoRecoveryLatencyMinutes) : undefined,
                autoRecoverySlaStatus: runRaw.autoRecoverySlaStatus
                  ? String(runRaw.autoRecoverySlaStatus)
                  : undefined,
                resilienceScore: runRaw.resilienceScore != null ? Number(runRaw.resilienceScore) : undefined,
                resilienceIncidents7d:
                  runRaw.resilienceIncidents7d != null ? Number(runRaw.resilienceIncidents7d) : undefined,
                resilienceConsecutiveIncidents:
                  runRaw.resilienceConsecutiveIncidents != null
                    ? Number(runRaw.resilienceConsecutiveIncidents)
                    : undefined,
                resilienceEscalated:
                  runRaw.resilienceEscalated != null ? Boolean(runRaw.resilienceEscalated) : undefined,
              } as ReportDispatchRun;
            })
            .sort((a, b) => b.startedAt - a.startedAt)
        )
      );
  }

  getManualReportRunHistory(limit = 15): Observable<ReportManualRun[]> {
    const normalizedLimit = Math.max(5, limit);
    const fetchLimit = Math.max(15, normalizedLimit * 3);

    return this.afs
      .collection<ReportManualRun>(this.reportManualRunCollection, (ref) =>
        ref.orderBy('requestedAt', 'desc').limit(fetchLimit)
      )
      .valueChanges({ idField: 'id' })
      .pipe(
        map((runs) =>
          runs
            .map((run) => this.normalizeManualReportRun(run))
            .filter((run) => run.type === this.manualReportRunType)
            .sort((a, b) => b.requestedAt - a.requestedAt)
            .slice(0, normalizedLimit)
        )
      );
  }

  getActiveManualReportRunStream(): Observable<ReportManualRun | null> {
    return this.getManualReportRunHistory(20).pipe(
      map((runs) => runs.find((run) => this.isManualReportRunActive(run)) ?? null)
    );
  }

  async requestManualPortfolioReport(): Promise<string> {
    const context = await this.getAuthenticatedContext();
    this.assertRole(context.role, this.reportDispatchRoles, 'Relance reporting non autorisee pour ce role.');

    const activeRun = await this.findActiveManualReportRunOnce();
    if (activeRun) {
      const statusLabel = activeRun.status === 'running' ? 'en cours de traitement' : 'deja en attente de traitement';
      throw new Error(`Une relance manuelle est ${statusLabel}.`);
    }

    const id = this.afs.createId();
    const now = Date.now();
    await this.afs.doc(`${this.reportManualRunCollection}/${id}`).set({
      id,
      type: this.manualReportRunType,
      requestedByUid: context.uid,
      requestedAt: now,
      status: 'requested',
      source: 'ui',
      updatedAt: now,
    });

    await this.createAuditLog('portfolio-report', {
      projectId: 'portfolio-report',
      action: 'report_digest_manual_requested',
      targetType: 'project',
      targetId: id,
      message: 'Relance manuelle du digest portefeuille demandee.',
    });

    return id;
  }

  getPortfolioBlockageInsights(
    causeLimit = 8,
    projectLimit = 8
  ): Observable<PortfolioBlockageInsights> {
    return combineLatest([
      this.listProjects(),
      this.afs
        .collection<ProjectBlockage>(this.blockageCollection, (ref) => ref.orderBy('createdAt', 'desc'))
        .valueChanges({ idField: 'id' })
        .pipe(
          map((blockages) =>
            blockages.map((blockage) => ({
              ...blockage,
              isResolved: Boolean(blockage.isResolved),
              createdAt: Number(blockage.createdAt ?? 0),
            }))
          )
        ),
    ]).pipe(
      map(([projects, blockages]) => {
        const totalBlockages = blockages.length;
        const openBlockages = blockages.filter((blockage) => !blockage.isResolved).length;
        const resolvedBlockages = totalBlockages - openBlockages;

        const projectMap = new Map(projects.map((project) => [project.id, project]));
        const causeStats = new Map<
          string,
          {
            cause: string;
            openCount: number;
            totalCount: number;
            criticalOpenCount: number;
            projectIds: Set<string>;
          }
        >();
        const projectStats = new Map<
          string,
          {
            openBlockages: number;
            criticalOpenCount: number;
            lastBlockageAt: number;
          }
        >();

        for (const blockage of blockages) {
          const groupingCause = this.normalizeBlockageCause(blockage.cause || blockage.title || 'Non precise');
          const causeEntry = causeStats.get(groupingCause) ?? {
            cause: groupingCause,
            openCount: 0,
            totalCount: 0,
            criticalOpenCount: 0,
            projectIds: new Set<string>(),
          };

          causeEntry.totalCount += 1;
          if (!blockage.isResolved) {
            causeEntry.openCount += 1;
            if (blockage.severity === 'critical') {
              causeEntry.criticalOpenCount += 1;
            }
          }

          if (blockage.projectId) {
            causeEntry.projectIds.add(blockage.projectId);
          }

          causeStats.set(groupingCause, causeEntry);

          if (!blockage.isResolved && blockage.projectId) {
            const projectEntry = projectStats.get(blockage.projectId) ?? {
              openBlockages: 0,
              criticalOpenCount: 0,
              lastBlockageAt: 0,
            };
            projectEntry.openBlockages += 1;
            if (blockage.severity === 'critical') {
              projectEntry.criticalOpenCount += 1;
            }
            projectEntry.lastBlockageAt = Math.max(projectEntry.lastBlockageAt, Number(blockage.createdAt ?? 0));
            projectStats.set(blockage.projectId, projectEntry);
          }
        }

        const causeDistribution: PortfolioBlockageCauseRow[] = Array.from(causeStats.values())
          .map((entry) => ({
            cause: entry.cause,
            openCount: entry.openCount,
            totalCount: entry.totalCount,
            impactedProjects: entry.projectIds.size,
            criticalOpenCount: entry.criticalOpenCount,
          }))
          .sort((a, b) => b.openCount - a.openCount || b.totalCount - a.totalCount)
          .slice(0, causeLimit);

        const severityOrder: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low'];
        const severityDistribution: PortfolioBlockageSeverityRow[] = severityOrder.map((severity) => {
          const totalCount = blockages.filter((blockage) => blockage.severity === severity).length;
          const openCount = blockages.filter(
            (blockage) => blockage.severity === severity && !blockage.isResolved
          ).length;

          return {
            severity,
            openCount,
            totalCount,
            share: openBlockages > 0 ? Math.round((openCount / openBlockages) * 1000) / 10 : 0,
          };
        });

        const topProjects: PortfolioBlockageProjectRow[] = Array.from(projectStats.entries())
          .map(([projectId, stats]) => {
            const project = projectMap.get(projectId);
            return {
              projectId,
              code: project?.code ?? '-',
              name: project?.name ?? 'Projet inconnu',
              openBlockages: stats.openBlockages,
              criticalOpenCount: stats.criticalOpenCount,
              lastBlockageAt: stats.lastBlockageAt,
            };
          })
          .sort(
            (a, b) =>
              b.openBlockages - a.openBlockages ||
              b.criticalOpenCount - a.criticalOpenCount ||
              b.lastBlockageAt - a.lastBlockageAt
          )
          .slice(0, projectLimit);

        return {
          totalBlockages,
          openBlockages,
          resolvedBlockages,
          causeDistribution,
          severityDistribution,
          topProjects,
        } as PortfolioBlockageInsights;
      })
    );
  }

  getDecisionSupportData(limit = 12): Observable<DecisionSupportData> {
    return this.listProjects().pipe(
      switchMap((projects) => {
        if (projects.length === 0) {
          return of({
            summary: {
              critical: 0,
              high: 0,
              medium: 0,
              low: 0,
              blockedProjects: 0,
              averageProgress: 0,
            },
            actions: [],
          } as DecisionSupportData);
        }

        const actionsStreams = projects.map((project) =>
          combineLatest([
            this.listActivities(project.id),
            this.listBlockages(project.id),
            this.listDecisions(project.id),
            this.listDecisionActions(project.id),
          ]).pipe(
            map(([activities, blockages, decisions, decisionActions]) => {
              const now = Date.now();
              const delayedActivities = activities.filter(
                (activity) => activity.status !== 'done' && this.parseDate(activity.dueDate) < now
              ).length;
              const openBlockages = blockages.filter((blockage) => !blockage.isResolved);
              const criticalBlockages = openBlockages.filter((blockage) => blockage.severity === 'critical').length;
              const pendingValidations = decisions.filter((decision) => decision.status === 'pending').length;
              const openDecisionActions = decisionActions.filter((action) => action.status !== 'done').length;
              const overdueDecisionActions = decisionActions.filter(
                (action) => action.status !== 'done' && this.parseDate(action.dueDate) < now
              ).length;

              const riskScoreRaw =
                delayedActivities * 2 +
                openBlockages.length * 3 +
                criticalBlockages * 5 +
                pendingValidations * 1 +
                openDecisionActions * 1 +
                overdueDecisionActions * 3 +
                (project.status === 'blocked' ? 6 : 0) +
                (project.progress < 40 ? 2 : 0);
              const riskScore = Math.min(100, riskScoreRaw);
              const priority = this.toDecisionPriority(riskScore);
              const mainIssue = this.getDecisionMainIssue(
                openBlockages.length,
                criticalBlockages,
                delayedActivities,
                pendingValidations,
                overdueDecisionActions,
                openDecisionActions
              );

              return {
                id: `decision-${project.id}`,
                projectId: project.id,
                code: project.code,
                name: project.name,
                status: project.status,
                progress: project.progress,
                delayedActivities,
                openBlockages: openBlockages.length,
                criticalBlockages,
                pendingValidations,
                openDecisionActions,
                overdueDecisionActions,
                riskScore,
                priority,
                mainIssue,
                recommendation: this.getDecisionRecommendation(
                  mainIssue,
                  delayedActivities,
                  openBlockages.length,
                  pendingValidations,
                  overdueDecisionActions
                ),
                updatedAt: project.updatedAt,
                actionUrl: `/project-tracking/projects/${project.id}`,
              } as DecisionSupportAction;
            })
          )
        );

        return combineLatest(actionsStreams).pipe(
          map((actions) => {
            const sortedActions = actions
              .sort(
                (a, b) =>
                  this.decisionPriorityRank(b.priority) - this.decisionPriorityRank(a.priority) ||
                  b.riskScore - a.riskScore ||
                  b.updatedAt - a.updatedAt
              )
              .slice(0, limit);

            const summary: DecisionSupportSummary = {
              critical: actions.filter((action) => action.priority === 'critical').length,
              high: actions.filter((action) => action.priority === 'high').length,
              medium: actions.filter((action) => action.priority === 'medium').length,
              low: actions.filter((action) => action.priority === 'low').length,
              blockedProjects: actions.filter((action) => action.status === 'blocked').length,
              averageProgress: Math.round(
                actions.reduce((sum, action) => sum + Number(action.progress ?? 0), 0) / actions.length
              ),
            };

            return {
              summary,
              actions: sortedActions,
            } as DecisionSupportData;
          })
        );
      })
    );
  }

  getDecisionJournalData(limit = 120): Observable<DecisionJournalData> {
    return combineLatest([
      this.listProjects(),
      this.afs
        .collection<ProjectDecision>(this.decisionCollection, (ref) =>
          ref.orderBy('createdAt', 'desc').limit(Math.max(limit, 120))
        )
        .valueChanges({ idField: 'id' }),
      this.afs
        .collection<ProjectDocument>(this.documentCollection, (ref) =>
          ref.orderBy('createdAt', 'desc').limit(Math.max(limit, 120))
        )
        .valueChanges({ idField: 'id' }),
      this.afs
        .collection<AuditLog>(this.auditCollection, (ref) =>
          ref.orderBy('createdAt', 'desc').limit(Math.max(limit, 180))
        )
        .valueChanges({ idField: 'id' }),
    ]).pipe(
      map(([projects, decisions, documents, logs]) => {
        const projectById = new Map(projects.map((project) => [project.id, project]));
        const now = Date.now();
        const recentThreshold = now - 7 * 24 * 60 * 60 * 1000;

        const decisionEntries: DecisionJournalEntry[] = decisions.map((decision) => {
          const project = projectById.get(decision.projectId);
          return {
            id: `decision-${decision.id}`,
            projectId: decision.projectId,
            projectCode: project?.code ?? '-',
            projectName: project?.name ?? 'Projet',
            type: 'validation_request',
            status: (decision.status ?? 'pending') as DecisionJournalStatus,
            title: `Validation niveau ${decision.level}`,
            detail: decision.comment || 'Validation projet en cours de traitement.',
            actorUid: decision.requestedByUid,
            targetUid: decision.validatorUid,
            level: Number(decision.level ?? 1),
            createdAt: Number(decision.createdAt ?? 0),
            decidedAt: decision.decidedAt,
            actionUrl: `/project-tracking/projects/${decision.projectId}`,
          };
        });

        const documentEntries: DecisionJournalEntry[] = documents
          .filter((document) => {
            const status = document.validationStatus ?? 'draft';
            return status === 'submitted' || status === 'approved' || status === 'rejected';
          })
          .map((document) => {
            const status = this.toDecisionJournalStatusFromDocument(document.validationStatus ?? 'draft');
            const project = projectById.get(document.projectId);

            return {
              id: `doc-${document.id}`,
              projectId: document.projectId,
              projectCode: project?.code ?? '-',
              projectName: project?.name ?? 'Projet',
              type: 'document_validation',
              status,
              title: document.fileName,
              detail:
                document.decisionComment?.trim() ||
                (status === 'pending'
                  ? 'Document soumis, en attente de validation.'
                  : status === 'approved'
                    ? 'Document approuve.'
                    : 'Document rejete.'),
              actorUid: document.submittedByUid ?? document.uploadedByUid,
              targetUid: document.decidedByUid,
              createdAt: Number(document.submittedAt ?? document.createdAt ?? 0),
              decidedAt: document.decidedAt,
              actionUrl: `/project-tracking/projects/${document.projectId}`,
            };
          });

        const governanceActionSet = new Set([
          'validation_requested',
          'validation_approved',
          'validation_rejected',
          'document_submitted',
          'document_approved',
          'document_rejected',
          'blockage_resolved',
          'decision_action_created',
          'decision_action_started',
          'decision_action_blocked',
          'decision_action_completed',
          'decision_action_reopened',
          'decision_action_escalated',
          'decision_action_acknowledged',
          'decision_action_reminder_sent',
        ]);
        const governanceEntries: DecisionJournalEntry[] = logs
          .filter((log) => governanceActionSet.has(log.action))
          .map((log) => {
            const project = projectById.get(log.projectId);
            return {
              id: `audit-${log.id}`,
              projectId: log.projectId,
              projectCode: project?.code ?? '-',
              projectName: project?.name ?? 'Projet',
              type: 'governance_action',
              status: this.toDecisionJournalStatusFromAuditAction(log.action),
              title: this.prettyAuditAction(log.action),
              detail: log.message,
              actorUid: log.actorUid,
              createdAt: Number(log.createdAt ?? 0),
              actionUrl: `/project-tracking/projects/${log.projectId}`,
            };
          });

        const entries = [...decisionEntries, ...documentEntries, ...governanceEntries]
          .sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt))
          .slice(0, limit);

        const summary: DecisionJournalSummary = {
          total: entries.length,
          pending: entries.filter((entry) => entry.status === 'pending').length,
          approved: entries.filter((entry) => entry.status === 'approved').length,
          rejected: entries.filter((entry) => entry.status === 'rejected').length,
          recent7d: entries.filter((entry) => (entry.decidedAt ?? entry.createdAt) >= recentThreshold).length,
        };

        return {
          summary,
          entries,
        } as DecisionJournalData;
      })
    );
  }

  getDecisionActionPlanData(limit = 180): Observable<DecisionActionPlanData> {
    const normalizedLimit = Math.max(limit, 120);

    return combineLatest([
      this.listProjects(),
      this.afs
        .collection<ProjectDecisionAction>(this.decisionActionCollection, (ref) =>
          ref.orderBy('updatedAt', 'desc').limit(normalizedLimit)
        )
        .valueChanges({ idField: 'id' }),
    ]).pipe(
      map(([projects, actions]) => {
        const projectById = new Map(projects.map((project) => [project.id, project]));
        const now = Date.now();

        const items: DecisionActionPlanItem[] = actions.map((action) => {
          const normalizedStatus = (action.status ?? 'todo') as DecisionActionStatus;
          const normalizedPriority = (action.priority ?? 'medium') as DecisionActionPriority;
          const dueAt = this.parseDate(action.dueDate);
          const project = projectById.get(action.projectId);
          const overdue = normalizedStatus !== 'done' && dueAt < now;

          return {
            id: action.id,
            projectId: action.projectId,
            projectCode: project?.code ?? '-',
            projectName: project?.name ?? 'Projet',
            projectStatus: project?.status ?? 'planned',
            title: action.title,
            description: action.description,
            ownerUid: action.ownerUid,
            dueDate: action.dueDate,
            priority: normalizedPriority,
            status: normalizedStatus,
            resolutionNote: action.resolutionNote ?? '',
            createdAt: Number(action.createdAt ?? 0),
            updatedAt: Number(action.updatedAt ?? 0),
            completedAt: action.completedAt ? Number(action.completedAt) : undefined,
            escalatedAt: action.escalatedAt ? Number(action.escalatedAt) : undefined,
            escalationLevel: Number(action.escalationLevel ?? 0),
            reminderCount: Number(action.reminderCount ?? 0),
            escalationAcknowledgedAt: action.escalationAcknowledgedAt
              ? Number(action.escalationAcknowledgedAt)
              : undefined,
            escalationAcknowledgedByUid: action.escalationAcknowledgedByUid || undefined,
            escalationAckComment: action.escalationAckComment || '',
            overdue,
            actionUrl: `/project-tracking/projects/${action.projectId}`,
          };
        });

        const sortedItems = items
          .sort(
            (a, b) =>
              Number(b.overdue) - Number(a.overdue) ||
              this.decisionActionPriorityRank(b.priority) - this.decisionActionPriorityRank(a.priority) ||
              this.parseDate(a.dueDate) - this.parseDate(b.dueDate) ||
              b.updatedAt - a.updatedAt
          )
          .slice(0, limit);

        return {
          summary: {
            total: items.length,
            open: items.filter((item) => item.status === 'todo').length,
            inProgress: items.filter((item) => item.status === 'in_progress').length,
            blocked: items.filter((item) => item.status === 'blocked').length,
            done: items.filter((item) => item.status === 'done').length,
            overdue: items.filter((item) => item.overdue).length,
            criticalOrHigh: items.filter((item) => item.priority === 'critical' || item.priority === 'high').length,
          },
          items: sortedItems,
        } as DecisionActionPlanData;
      })
    );
  }

  getEscalationPerformanceData(limit = 260): Observable<EscalationPerformanceData> {
    return this.getDecisionActionPlanData(limit).pipe(
      map((data) => {
        const now = Date.now();
        const escalatedItems = data.items
          .filter((item) => item.escalationLevel > 0)
          .map((item) => {
            const slaTargetHours = this.getEscalationSlaTargetHours(item.escalationLevel);
            const referenceAt = Number(item.escalatedAt ?? item.updatedAt ?? item.createdAt ?? now);
            const effectiveEndAt = Number(item.escalationAcknowledgedAt ?? now);
            const elapsedHoursRaw = Math.max(0, (effectiveEndAt - referenceAt) / 3_600_000);
            const slaElapsedHours = Math.round(elapsedHoursRaw * 10) / 10;
            const slaStatus = this.getEscalationSlaStatus(
              slaElapsedHours,
              slaTargetHours,
              Boolean(item.escalationAcknowledgedAt)
            );

            return {
              ...item,
              slaTargetHours,
              slaElapsedHours,
              slaStatus,
            };
          })
          .sort(
            (a, b) =>
              this.escalationSlaStatusRank(b.slaStatus ?? 'pending') -
                this.escalationSlaStatusRank(a.slaStatus ?? 'pending') ||
              b.escalationLevel - a.escalationLevel ||
              this.parseDate(a.dueDate) - this.parseDate(b.dueDate) ||
              b.updatedAt - a.updatedAt
          );

        const acknowledgedItems = escalatedItems.filter((item) => Boolean(item.escalationAcknowledgedAt));
        const averageAckHours = acknowledgedItems.length
          ? Math.round(
              (acknowledgedItems.reduce((sum, item) => sum + Number(item.slaElapsedHours ?? 0), 0) /
                acknowledgedItems.length) *
                10
            ) / 10
          : 0;

        return {
          summary: {
            escalated: escalatedItems.length,
            unacknowledged: escalatedItems.filter((item) => !item.escalationAcknowledgedAt).length,
            acknowledged: acknowledgedItems.length,
            withinSla: escalatedItems.filter((item) => item.slaStatus === 'within_sla').length,
            atRisk: escalatedItems.filter((item) => item.slaStatus === 'at_risk').length,
            breached: escalatedItems.filter((item) => item.slaStatus === 'breached').length,
            averageAckHours,
          },
          items: escalatedItems,
        } as EscalationPerformanceData;
      })
    );
  }

  getDashboardMetrics(): Observable<ProjectDashboardMetrics> {
    return this.listProjects().pipe(
      map((projects) => {
        const metrics: ProjectDashboardMetrics = {
          total: projects.length,
          inProgress: projects.filter((project) => project.status === 'in_progress').length,
          blocked: projects.filter((project) => project.status === 'blocked').length,
          completed: projects.filter((project) => project.status === 'validated' || project.status === 'closed').length,
        };

        return metrics;
      })
    );
  }

  getMyWorkspaceData(limit = 30): Observable<ProjectWorkspaceData> {
    return this.afAuth.authState.pipe(
      switchMap((user) => {
        if (!user?.uid) {
          return of({
            summary: {
              myActivities: 0,
              overdueActivities: 0,
              pendingValidations: 0,
              myOpenBlockages: 0,
              documentsToReview: 0,
            },
            items: [],
          } as ProjectWorkspaceData);
        }

        const activities$ = this.afs
          .collection<ProjectActivity>(this.activityCollection, (ref) => ref.where('responsibleUid', '==', user.uid))
          .valueChanges({ idField: 'id' })
          .pipe(
            map((activities) =>
              activities.map((activity) => ({
                ...activity,
                progress: Number(activity.progress ?? 0),
                createdAt: Number(activity.createdAt ?? 0),
                updatedAt: Number(activity.updatedAt ?? 0),
              }))
            )
          );

        const decisions$ = this.afs
          .collection<ProjectDecision>(this.decisionCollection, (ref) => ref.where('validatorUid', '==', user.uid))
          .valueChanges({ idField: 'id' })
          .pipe(
            map((decisions) =>
              decisions.map((decision) => ({
                ...decision,
                level: Number(decision.level ?? 1),
                createdAt: Number(decision.createdAt ?? 0),
              }))
            )
          );

        const myBlockages$ = this.afs
          .collection<ProjectBlockage>(this.blockageCollection, (ref) => ref.where('ownerUid', '==', user.uid))
          .valueChanges({ idField: 'id' })
          .pipe(
            map((blockages) =>
              blockages.map((blockage) => ({
                ...blockage,
                isResolved: Boolean(blockage.isResolved),
                createdAt: Number(blockage.createdAt ?? 0),
              }))
            )
          );

        const documents$ = this.afs
          .collection<ProjectDocument>(this.documentCollection, (ref) => ref.where('uploadedByUid', '==', user.uid))
          .valueChanges({ idField: 'id' })
          .pipe(
            map((documents) =>
              documents.map((document) => ({
                ...document,
                createdAt: Number(document.createdAt ?? 0),
                validationStatus: (document.validationStatus ?? 'draft') as DocumentValidationStatus,
                isArchived: Boolean(document.isArchived),
              }))
            )
          );

        return combineLatest([this.listProjects(), activities$, decisions$, myBlockages$, documents$]).pipe(
          map(([projects, activities, decisions, blockages, documents]) => {
            const projectById = new Map(projects.map((project) => [project.id, project]));
            const now = Date.now();

            const summary: WorkspaceSummary = {
              myActivities: 0,
              overdueActivities: 0,
              pendingValidations: 0,
              myOpenBlockages: 0,
              documentsToReview: 0,
            };
            const items: WorkspaceItem[] = [];

            for (const activity of activities) {
              if (activity.status === 'done') {
                continue;
              }

              const dueAt = this.parseDate(activity.dueDate);
              const overdue = dueAt < now;
              summary.myActivities += 1;
              if (overdue) {
                summary.overdueActivities += 1;
              }

              const project = projectById.get(activity.projectId);
              const priority: WorkspacePriority =
                overdue || activity.status === 'blocked'
                  ? 'high'
                  : activity.status === 'in_progress'
                    ? 'medium'
                    : 'low';

              items.push({
                id: `activity-${activity.id}`,
                projectId: activity.projectId,
                projectCode: project?.code ?? '-',
                projectName: project?.name ?? 'Projet',
                type: 'activity',
                title: activity.title,
                detail: activity.description,
                status: overdue ? 'Activite en retard' : `Activite ${activity.status}`,
                dueAt,
                createdAt: Number(activity.updatedAt ?? activity.createdAt ?? now),
                priority,
                actionUrl: `/project-tracking/projects/${activity.projectId}`,
              });
            }

            for (const decision of decisions) {
              if (decision.status !== 'pending') {
                continue;
              }

              summary.pendingValidations += 1;
              const project = projectById.get(decision.projectId);
              items.push({
                id: `validation-${decision.id}`,
                projectId: decision.projectId,
                projectCode: project?.code ?? '-',
                projectName: project?.name ?? 'Projet',
                type: 'validation',
                title: `Validation niveau ${decision.level}`,
                detail: decision.comment || 'Decision en attente de votre part.',
                status: 'Validation en attente',
                createdAt: Number(decision.createdAt ?? now),
                priority: 'high',
                actionUrl: `/project-tracking/projects/${decision.projectId}`,
              });
            }

            for (const blockage of blockages) {
              if (blockage.isResolved) {
                continue;
              }

              summary.myOpenBlockages += 1;
              const project = projectById.get(blockage.projectId);
              items.push({
                id: `blockage-${blockage.id}`,
                projectId: blockage.projectId,
                projectCode: project?.code ?? '-',
                projectName: project?.name ?? 'Projet',
                type: 'blockage',
                title: blockage.title,
                detail: blockage.cause,
                status: `Blocage ouvert (${blockage.severity})`,
                createdAt: Number(blockage.createdAt ?? now),
                priority: blockage.severity === 'critical' || blockage.severity === 'high' ? 'high' : 'medium',
                actionUrl: `/project-tracking/projects/${blockage.projectId}`,
              });
            }

            for (const document of documents) {
              if (document.isArchived) {
                continue;
              }

              const validationStatus = document.validationStatus ?? 'draft';
              if (validationStatus !== 'rejected' && validationStatus !== 'submitted') {
                continue;
              }

              if (validationStatus === 'rejected') {
                summary.documentsToReview += 1;
              }

              const project = projectById.get(document.projectId);
              items.push({
                id: `document-${document.id}`,
                projectId: document.projectId,
                projectCode: project?.code ?? '-',
                projectName: project?.name ?? 'Projet',
                type: 'document',
                title: document.fileName,
                detail:
                  validationStatus === 'rejected'
                    ? 'Document rejete, une nouvelle version est attendue.'
                    : 'Document soumis, en attente de validation.',
                status: validationStatus === 'rejected' ? 'Document rejete' : 'Document soumis',
                createdAt: Number(document.createdAt ?? now),
                priority: validationStatus === 'rejected' ? 'high' : 'low',
                actionUrl: `/project-tracking/projects/${document.projectId}`,
              });
            }

            const sortedItems = items
              .sort(
                (a, b) =>
                  this.workspacePriorityRank(b.priority) - this.workspacePriorityRank(a.priority) ||
                  (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) ||
                  b.createdAt - a.createdAt
              )
              .slice(0, limit);

            return {
              summary,
              items: sortedItems,
            } as ProjectWorkspaceData;
          })
        );
      })
    );
  }

  listMyNotifications(limit = 20): Observable<ProjectNotification[]> {
    return this.afAuth.authState.pipe(
      switchMap((user) => {
        if (!user?.uid) {
          return of([]);
        }

        return this.afs
          .collection<ProjectNotification>(this.notificationCollection, (ref) =>
            ref.where('recipientUid', '==', user.uid).orderBy('createdAt', 'desc').limit(limit)
          )
          .valueChanges({ idField: 'id' })
          .pipe(
            map((notifications) =>
              notifications.map((notification) => ({
                ...notification,
                channels: (notification.channels ?? ['in_app']) as NotificationChannel[],
                isRead: Boolean(notification.isRead),
                createdAt: Number(notification.createdAt ?? 0),
              }))
            ),
            catchError(() => of([]))
          );
      })
    );
  }

  getUnreadNotificationsCount(): Observable<number> {
    return this.afAuth.authState.pipe(
      switchMap((user) => {
        if (!user?.uid) {
          return of(0);
        }

        return this.afs
          .collection<ProjectNotification>(this.notificationCollection, (ref) =>
            ref.where('recipientUid', '==', user.uid).where('isRead', '==', false)
          )
          .valueChanges({ idField: 'id' })
          .pipe(
            map((notifications) => notifications.length),
            catchError(() => of(0))
          );
      })
    );
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    const context = await this.getAuthenticatedContext();
    const notificationRef = this.afs.doc<ProjectNotification>(`${this.notificationCollection}/${notificationId}`).ref;
    const notificationSnapshot = await notificationRef.get();

    if (!notificationSnapshot.exists) {
      throw new Error('Notification introuvable.');
    }

    const notification = notificationSnapshot.data();
    if (!notification || notification.recipientUid !== context.uid) {
      throw new Error('Notification non accessible.');
    }

    if (notification.isRead) {
      return;
    }

    await this.afs.doc<ProjectNotification>(`${this.notificationCollection}/${notificationId}`).update({
      isRead: true,
      readAt: Date.now(),
    });
  }

  private async createAuditLog(projectId: string, payload: AuditLogCreatePayload): Promise<void> {
    const currentUser = await this.afAuth.currentUser;
    const demoSession = this.authService.getDemoSession();
    const now = Date.now();
    const id = this.afs.createId();

    const log: AuditLog = {
      id,
      projectId,
      actorUid: currentUser?.uid ?? demoSession?.uid ?? 'system',
      action: payload.action,
      targetType: payload.targetType,
      targetId: payload.targetId,
      message: payload.message,
      createdAt: now,
    };

    await this.afs.doc<AuditLog>(`${this.auditCollection}/${id}`).set(log);
  }

  private async requireProjectWriter(message: string): Promise<AuthContext> {
    const context = await this.getAuthenticatedContext();
    this.assertRole(context.role, this.projectWriteRoles, message);
    return context;
  }

  private async getAuthenticatedContext(): Promise<AuthContext> {
    const user = await this.afAuth.currentUser;
    if (user?.uid) {
      const role = await this.roleService.getRoleForUser(user.uid);
      return {
        uid: user.uid,
        role,
      };
    }

    const demoSession = this.authService.getDemoSession();
    if (demoSession) {
      return {
        uid: demoSession.uid,
        role: demoSession.role,
      };
    }

    throw new Error('Utilisateur non authentifie.');
  }

  private async dispatchProjectNotifications(projectId: string, input: NotificationDispatchInput): Promise<void> {
    const context = await this.getAuthenticatedContext();
    const channels: NotificationChannel[] = input.channels?.length ? input.channels : ['in_app'];
    const recipients = await this.resolveNotificationRecipients(
      input.recipientRoles ?? [],
      input.recipientUids ?? [],
      [...(input.excludeUids ?? []), context.uid]
    );

    if (!recipients.length) {
      return;
    }

    const now = Date.now();
    const batch = this.afs.firestore.batch();

    for (const recipient of recipients) {
      const notificationId = this.afs.createId();
      const notification: ProjectNotification = {
        id: notificationId,
        projectId,
        recipientUid: recipient.uid,
        actorUid: context.uid,
        type: input.type,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
        relatedId: input.relatedId,
        channels,
        isRead: false,
        createdAt: now,
      };

      const notificationRef = this.afs.firestore.collection(this.notificationCollection).doc(notificationId);
      batch.set(notificationRef, notification as ProjectNotification);

      if (channels.includes('email') && recipient.email) {
        const outboxId = this.afs.createId();
        const outbox: NotificationOutboxItem = {
          id: outboxId,
          projectId,
          notificationId,
          recipientUid: recipient.uid,
          recipientEmail: recipient.email,
          subject: input.title,
          message: input.message,
          actionUrl: input.actionUrl,
          status: 'pending',
          requestedByUid: context.uid,
          createdAt: now,
        };

        const outboxRef = this.afs.firestore.collection(this.notificationOutboxCollection).doc(outboxId);
        batch.set(outboxRef, outbox as NotificationOutboxItem);
      }
    }

    await batch.commit();
  }

  private async resolveNotificationRecipients(
    roles: UserRole[],
    directUids: string[],
    excludeUids: string[]
  ): Promise<UserProfile[]> {
    const byUid = new Map<string, UserProfile>();

    if (roles.length > 0) {
      const roleSnapshot = await this.afs
        .collection<UserProfile>(this.usersCollection, (ref) => ref.where('role', 'in', roles))
        .ref.get();

      roleSnapshot.forEach((doc) => {
        const user = doc.data();
        if (user?.uid) {
          byUid.set(user.uid, user);
        }
      });
    }

    if (directUids.length > 0) {
      const uniqueDirectUids = Array.from(new Set(directUids.filter((uid) => uid.trim().length > 0)));

      for (const chunk of this.chunkArray(uniqueDirectUids, 10)) {
        const uidSnapshot = await this.afs
          .collection<UserProfile>(this.usersCollection, (ref) => ref.where('uid', 'in', chunk))
          .ref.get();

        uidSnapshot.forEach((doc) => {
          const user = doc.data();
          if (user?.uid) {
            byUid.set(user.uid, user);
          }
        });
      }
    }

    const excluded = new Set(excludeUids);
    return Array.from(byUid.values()).filter((user) => !excluded.has(user.uid));
  }

  private chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
  }

  private assertRole(role: UserRole, allowedRoles: UserRole[], message: string): void {
    if (!allowedRoles.includes(role)) {
      throw new Error(message);
    }
  }

  private assertDocumentIsAllowed(file: File | null): void {
    if (!file) {
      throw new Error('Aucun fichier selectionne.');
    }

    if (file.size <= 0) {
      throw new Error('Le fichier selectionne est vide.');
    }

    if (file.size > this.maxDocumentSizeBytes) {
      throw new Error('Taille maximale depassee (10 MB).');
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!this.allowedDocumentMimeTypes.has(mimeType)) {
      throw new Error('Type de fichier non autorise.');
    }
  }

  private sanitizeFileName(fileName: string): string {
    const sanitized = fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    return sanitized.length ? sanitized.slice(0, 120) : 'document';
  }

  private normalizeBlockageCause(cause: string): string {
    const normalized = cause
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    if (!normalized) {
      return 'Non precise';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private workspacePriorityRank(priority: WorkspacePriority): number {
    switch (priority) {
      case 'high':
        return 3;
      case 'medium':
        return 2;
      default:
        return 1;
    }
  }

  private toDecisionPriority(riskScore: number): DecisionPriority {
    if (riskScore >= 16) {
      return 'critical';
    }
    if (riskScore >= 10) {
      return 'high';
    }
    if (riskScore >= 5) {
      return 'medium';
    }
    return 'low';
  }

  private decisionPriorityRank(priority: DecisionPriority): number {
    switch (priority) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      default:
        return 1;
    }
  }

  private decisionActionPriorityRank(priority: DecisionActionPriority): number {
    switch (priority) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      default:
        return 1;
    }
  }

  private escalationSlaStatusRank(status: EscalationSlaStatus): number {
    switch (status) {
      case 'breached':
        return 4;
      case 'at_risk':
        return 3;
      case 'pending':
        return 2;
      default:
        return 1;
    }
  }

  private getEscalationSlaTargetHours(level: number): number {
    if (level >= 3) {
      return 8;
    }
    if (level === 2) {
      return 24;
    }
    return 48;
  }

  private getEscalationSlaStatus(
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

  private alertSeverityFromDecisionActionPriority(priority: DecisionActionPriority): ProjectAlertSeverity {
    switch (priority) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      default:
        return 'low';
    }
  }

  private getDecisionMainIssue(
    openBlockages: number,
    criticalBlockages: number,
    delayedActivities: number,
    pendingValidations: number,
    overdueDecisionActions: number,
    openDecisionActions: number
  ): string {
    if (criticalBlockages > 0) {
      return 'Blocages critiques';
    }
    if (openBlockages > 0) {
      return 'Blocages ouverts';
    }
    if (overdueDecisionActions > 0) {
      return 'Actions decisionnelles en retard';
    }
    if (openDecisionActions > 0) {
      return 'Actions decisionnelles ouvertes';
    }
    if (delayedActivities > 0) {
      return 'Retards d execution';
    }
    if (pendingValidations > 0) {
      return 'Validations en attente';
    }
    return 'Suivi nominal';
  }

  private getDecisionRecommendation(
    mainIssue: string,
    delayedActivities: number,
    openBlockages: number,
    pendingValidations: number,
    overdueDecisionActions: number
  ): string {
    switch (mainIssue) {
      case 'Blocages critiques':
        return 'Declencher un arbitrage interinstitutionnel sous 48h.';
      case 'Blocages ouverts':
        return 'Affecter un pilote de resolution et fixer un jalon hebdomadaire.';
      case 'Actions decisionnelles en retard':
        return overdueDecisionActions > 2
          ? 'Lancer une revue de rattrapage immediate avec responsabilisation des owners.'
          : 'Relancer les responsables et fixer des echeances fermes sous 72h.';
      case 'Actions decisionnelles ouvertes':
        return 'Suivre l execution des actions et valider les preuves de cloture en comite.';
      case 'Retards d execution':
        return delayedActivities > 3
          ? 'Lancer un plan de rattrapage avec revues quotidiennes.'
          : 'Reprioriser les activites dependantes et ajuster le planning.';
      case 'Validations en attente':
        return pendingValidations > 2
          ? 'Programmer un comite de validation exceptionnel.'
          : 'Relancer les validateurs et verrouiller une date de decision.';
      default:
        if (openBlockages > 0 || delayedActivities > 0 || pendingValidations > 0) {
          return 'Maintenir un suivi hebdomadaire des indicateurs de risque.';
        }
        return 'Maintenir la trajectoire et preparer les prochains jalons.';
    }
  }

  private toDecisionJournalStatusFromDocument(status: DocumentValidationStatus): DecisionJournalStatus {
    switch (status) {
      case 'submitted':
        return 'pending';
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      default:
        return 'info';
    }
  }

  private toDecisionJournalStatusFromAuditAction(action: string): DecisionJournalStatus {
    if (action.includes('rejected')) {
      return 'rejected';
    }
    if (
      action.includes('approved') ||
      action.includes('resolved') ||
      action.includes('completed') ||
      action.includes('acknowledged')
    ) {
      return 'approved';
    }
    if (
      action.includes('requested') ||
      action.includes('submitted') ||
      action.includes('started') ||
      action.includes('blocked') ||
      action.includes('reopened') ||
      action.includes('escalated') ||
      action.includes('reminder')
    ) {
      return 'pending';
    }
    return 'info';
  }

  private prettyAuditAction(action: string): string {
    return action
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\w/, (char) => char.toUpperCase());
  }

  private normalizeManualReportRun(run: Partial<ReportManualRun> & { id?: string }): ReportManualRun {
    const status = run.status;
    const normalizedStatus: ReportManualRun['status'] =
      status === 'requested' || status === 'running' || status === 'completed' || status === 'failed'
        ? status
        : 'requested';

    return {
      id: run.id || '',
      type: run.type || this.manualReportRunType,
      requestedByUid: run.requestedByUid || '',
      requestedAt: Number(run.requestedAt ?? 0),
      status: normalizedStatus,
      source: run.source || undefined,
      runId: run.runId || undefined,
      startedAt: run.startedAt != null ? Number(run.startedAt) : undefined,
      completedAt: run.completedAt != null ? Number(run.completedAt) : undefined,
      failedAt: run.failedAt != null ? Number(run.failedAt) : undefined,
      lastError: run.lastError || undefined,
      updatedAt: run.updatedAt != null ? Number(run.updatedAt) : undefined,
    };
  }

  private async findActiveManualReportRunOnce(): Promise<ReportManualRun | null> {
    const [requestedSnapshot, runningSnapshot] = await Promise.all([
      this.afs
        .collection<ReportManualRun>(this.reportManualRunCollection, (ref) =>
          ref.where('status', '==', 'requested').limit(10)
        )
        .ref.get(),
      this.afs
        .collection<ReportManualRun>(this.reportManualRunCollection, (ref) =>
          ref.where('status', '==', 'running').limit(10)
        )
        .ref.get(),
    ]);

    const runs: ReportManualRun[] = [];
    requestedSnapshot.forEach((doc) => {
      const runData = doc.data() as ReportManualRun;
      const { id: _ignoredId, ...raw } = runData;
      runs.push(this.normalizeManualReportRun({ ...raw, id: doc.id }));
    });
    runningSnapshot.forEach((doc) => {
      const runData = doc.data() as ReportManualRun;
      const { id: _ignoredId, ...raw } = runData;
      runs.push(this.normalizeManualReportRun({ ...raw, id: doc.id }));
    });

    const activeRuns = runs.filter(
      (run) => run.type === this.manualReportRunType && this.isManualReportRunActive(run)
    );
    if (!activeRuns.length) {
      return null;
    }

    const statusRank = (status: ReportManualRun['status']): number => (status === 'running' ? 2 : 1);
    activeRuns.sort((a, b) => {
      const byRequestedAt = Number(b.requestedAt ?? 0) - Number(a.requestedAt ?? 0);
      if (byRequestedAt !== 0) {
        return byRequestedAt;
      }
      return statusRank(b.status) - statusRank(a.status);
    });

    return activeRuns[0];
  }

  private isManualReportRunActive(run: ReportManualRun): boolean {
    return run.status === 'requested' || run.status === 'running';
  }

  private parseDate(dateText: string): number {
    const timestamp = Date.parse(dateText);
    return Number.isNaN(timestamp) ? Date.now() : timestamp;
  }

  private alertSeverityRank(severity: ProjectAlertSeverity): number {
    switch (severity) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      default:
        return 1;
    }
  }
}
