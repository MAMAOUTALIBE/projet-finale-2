import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { WorkspaceItem, WorkspaceItemType, WorkspacePriority } from '../../../core/models/project-workspace.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';

@Component({
  selector: 'app-project-workspace',
  imports: [AsyncPipe, DatePipe, RouterModule],
  templateUrl: './project-workspace.html',
  styleUrl: './project-workspace.scss',
})
export class ProjectWorkspace {
  private projectService = inject(ProjectTrackingService);

  readonly workspace$ = this.projectService.getMyWorkspaceData(40);

  trackByItem(index: number, item: WorkspaceItem): string {
    return item.id || index.toString();
  }

  itemTypeLabel(type: WorkspaceItemType): string {
    switch (type) {
      case 'activity':
        return 'Activite';
      case 'validation':
        return 'Validation';
      case 'blockage':
        return 'Blocage';
      default:
        return 'Document';
    }
  }

  itemTypeBadgeClass(type: WorkspaceItemType): string {
    switch (type) {
      case 'activity':
        return 'bg-primary-transparent text-primary';
      case 'validation':
        return 'bg-warning-transparent text-warning';
      case 'blockage':
        return 'bg-danger-transparent text-danger';
      default:
        return 'bg-info-transparent text-info';
    }
  }

  priorityBadgeClass(priority: WorkspacePriority): string {
    switch (priority) {
      case 'high':
        return 'bg-danger-transparent text-danger';
      case 'medium':
        return 'bg-warning-transparent text-warning';
      default:
        return 'bg-light text-dark';
    }
  }
}
