import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { map } from 'rxjs/operators';
import { PROJECT_STATUS_OPTIONS } from '../../../core/constants/project-status.constants';
import { Project, ProjectStatus } from '../../../core/models/project.model';
import { UserRole } from '../../../core/models/user-role.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';
import { RoleService } from '../../../core/services/role.service';

interface StatusFilterOption {
  value: ProjectStatus | 'all';
  label: string;
}

@Component({
  selector: 'app-projects-list',
  imports: [AsyncPipe, DatePipe, FormsModule, RouterModule],
  templateUrl: './projects-list.html',
  styleUrl: './projects-list.scss',
})
export class ProjectsList {
  private projectService = inject(ProjectTrackingService);
  private roleService = inject(RoleService);

  readonly projects$ = this.projectService.listProjects();
  readonly canCreateProject$ = this.roleService.currentUserRole$().pipe(
    map((role) => this.hasAnyRole(role, ['admin', 'pmo', 'project_manager']))
  );
  selectedStatus: ProjectStatus | 'all' = 'all';
  readonly statusFilters: StatusFilterOption[] = [
    { value: 'all', label: 'Tous les statuts' },
    ...PROJECT_STATUS_OPTIONS,
  ];

  filterProjects(projects: Project[]): Project[] {
    if (this.selectedStatus === 'all') {
      return projects;
    }

    return projects.filter((project) => project.status === this.selectedStatus);
  }

  trackByProjectId(index: number, project: Project): string {
    return project.id || index.toString();
  }

  private hasAnyRole(currentRole: UserRole | null, allowed: UserRole[]): boolean {
    return currentRole ? allowed.includes(currentRole) : false;
  }
}
