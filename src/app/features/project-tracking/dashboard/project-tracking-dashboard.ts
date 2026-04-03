import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PROJECT_STATUS_OPTIONS } from '../../../core/constants/project-status.constants';
import { ProjectNotification } from '../../../core/models/project-notification.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';

@Component({
  selector: 'app-project-tracking-dashboard',
  imports: [AsyncPipe, DatePipe, RouterModule],
  templateUrl: './project-tracking-dashboard.html',
  styleUrl: './project-tracking-dashboard.scss',
})
export class ProjectTrackingDashboard {
  private projectService = inject(ProjectTrackingService);

  readonly metrics$ = this.projectService.getDashboardMetrics();
  readonly statusLegend = PROJECT_STATUS_OPTIONS;
  readonly notifications$ = this.projectService.listMyNotifications(12);
  readonly unreadNotificationsCount$ = this.projectService.getUnreadNotificationsCount();

  async markAsRead(notification: ProjectNotification): Promise<void> {
    if (notification.isRead) {
      return;
    }

    try {
      await this.projectService.markNotificationAsRead(notification.id);
    } catch (_error) {
      // Silent fail to avoid UI interruption.
    }
  }

  notificationTypeClass(notification: ProjectNotification): string {
    switch (notification.type) {
      case 'document_approved':
        return 'bg-success-transparent text-success';
      case 'document_rejected':
        return 'bg-danger-transparent text-danger';
      case 'document_submitted':
        return 'bg-warning-transparent text-warning';
      case 'decision_action_assigned':
        return 'bg-primary-transparent text-primary';
      case 'decision_action_status':
        return 'bg-info-transparent text-info';
      case 'decision_action_escalated':
        return 'bg-danger-transparent text-danger';
      case 'decision_action_reminder':
        return 'bg-warning-transparent text-warning';
      case 'decision_action_acknowledged':
        return 'bg-success-transparent text-success';
      case 'report_digest':
        return 'bg-info-transparent text-info';
      case 'report_dispatch_alert':
        return 'bg-danger-transparent text-danger';
      default:
        return 'bg-light text-dark';
    }
  }

  notificationTypeLabel(notification: ProjectNotification): string {
    switch (notification.type) {
      case 'document_approved':
        return 'Approuve';
      case 'document_rejected':
        return 'Rejete';
      case 'document_submitted':
        return 'Soumis';
      case 'decision_action_assigned':
        return 'Affectation';
      case 'decision_action_status':
        return 'Suivi action';
      case 'decision_action_escalated':
        return 'Escalade';
      case 'decision_action_reminder':
        return 'Relance';
      case 'decision_action_acknowledged':
        return 'Prise en charge';
      case 'report_digest':
        return 'Reporting';
      case 'report_dispatch_alert':
        return 'Alerte reporting';
      default:
        return 'Info';
    }
  }

  trackByNotification(index: number, notification: ProjectNotification): string {
    return notification.id || index.toString();
  }
}
