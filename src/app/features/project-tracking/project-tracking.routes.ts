import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { roleGuard } from '../../core/guards/role.guard';

export const projectTrackingRoutingModule: Routes = [
  {
    path: 'project-tracking',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard/project-tracking-dashboard').then((m) => m.ProjectTrackingDashboard),
        title: 'Nowa - Suivi Projets',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: '',
          childTitle: 'Tableau de bord',
        },
      },
      {
        path: 'workspace',
        loadComponent: () =>
          import('./workspace/project-workspace').then((m) => m.ProjectWorkspace),
        title: 'Nowa - Mon Espace',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: '',
          childTitle: 'Mon espace',
        },
      },
      {
        path: 'projects',
        loadComponent: () => import('./projects/projects-list').then((m) => m.ProjectsList),
        title: 'Nowa - Projets',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: '',
          childTitle: 'Projets',
        },
      },
      {
        path: 'projects/new',
        canActivate: [roleGuard(['admin', 'pmo', 'project_manager'])],
        loadComponent: () => import('./projects/project-create').then((m) => m.ProjectCreate),
        title: 'Nowa - Nouveau Projet',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: 'Projets',
          childTitle: 'Nouveau projet',
        },
      },
      {
        path: 'projects/:projectId',
        loadComponent: () => import('./projects/project-details').then((m) => m.ProjectDetails),
        title: 'Nowa - Detail Projet',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: 'Projets',
          childTitle: 'Detail projet',
        },
      },
      {
        path: 'reports',
        canActivate: [roleGuard(['admin', 'pmo', 'project_manager', 'decision_maker'])],
        loadComponent: () => import('./reports/project-reports').then((m) => m.ProjectReports),
        title: 'Nowa - Reporting Projets',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: '',
          childTitle: 'Reporting',
        },
      },
      {
        path: 'decision-support',
        canActivate: [roleGuard(['admin', 'pmo', 'project_manager', 'decision_maker'])],
        loadComponent: () => import('./decision-support/decision-support').then((m) => m.DecisionSupport),
        title: 'Nowa - Aide Decision',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: '',
          childTitle: 'Aide decision',
        },
      },
      {
        path: 'decision-actions',
        canActivate: [roleGuard(['admin', 'pmo', 'project_manager', 'decision_maker'])],
        loadComponent: () => import('./decision-actions/decision-actions').then((m) => m.DecisionActions),
        title: 'Nowa - Plan Actions',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: '',
          childTitle: 'Plan actions',
        },
      },
      {
        path: 'escalation-control',
        canActivate: [roleGuard(['admin', 'pmo', 'project_manager', 'decision_maker'])],
        loadComponent: () => import('./escalation-control/escalation-control').then((m) => m.EscalationControl),
        title: 'Nowa - Centre Escalades',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: '',
          childTitle: 'Centre escalades',
        },
      },
      {
        path: 'decision-journal',
        canActivate: [roleGuard(['admin', 'pmo', 'project_manager', 'decision_maker', 'validator'])],
        loadComponent: () => import('./decision-journal/decision-journal').then((m) => m.DecisionJournal),
        title: 'Nowa - Journal Decisions',
        data: {
          parentTitle: 'Suivi Projets',
          subParentTitle: '',
          childTitle: 'Journal decisions',
        },
      },
    ],
  },
];
