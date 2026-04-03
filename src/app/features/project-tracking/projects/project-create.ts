import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { PROJECT_STATUS_OPTIONS } from '../../../core/constants/project-status.constants';
import { ProjectCreatePayload, ProjectStatus } from '../../../core/models/project.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';

@Component({
  selector: 'app-project-create',
  imports: [ReactiveFormsModule, RouterModule],
  templateUrl: './project-create.html',
  styleUrl: './project-create.scss',
})
export class ProjectCreate {
  private formBuilder = inject(FormBuilder);
  private projectService = inject(ProjectTrackingService);
  private router = inject(Router);

  readonly statusOptions = PROJECT_STATUS_OPTIONS;
  isSubmitting = false;
  submitError = '';

  readonly form = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(2)]],
    name: ['', [Validators.required, Validators.minLength(3)]],
    sponsor: ['', [Validators.required]],
    ownerOrganization: ['', [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    startDate: ['', [Validators.required]],
    endDate: ['', [Validators.required]],
    budget: [0, [Validators.required, Validators.min(0)]],
    status: ['planned' as ProjectStatus, [Validators.required]],
  });

  async save(): Promise<void> {
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: ProjectCreatePayload = {
      code: value.code.trim(),
      name: value.name.trim(),
      sponsor: value.sponsor.trim(),
      ownerOrganization: value.ownerOrganization.trim(),
      description: value.description.trim(),
      startDate: value.startDate,
      endDate: value.endDate,
      budget: Number(value.budget),
      status: value.status,
    };

    this.isSubmitting = true;

    try {
      const id = await this.projectService.createProject(payload);
      await this.router.navigate(['/project-tracking/projects', id]);
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Erreur lors de la creation du projet.';
    } finally {
      this.isSubmitting = false;
    }
  }
}
