import { inject } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { UserRole } from '../models/user-role.model';
import { RoleService } from '../services/role.service';
import { AuthService } from '../../shared/services/auth.service';

export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return async (_route, state) => {
    const afAuth = inject(AngularFireAuth);
    const router = inject(Router);
    const roleService = inject(RoleService);
    const authService = inject(AuthService);

    const user = await firstValueFrom(afAuth.authState.pipe(take(1)));

    if (!user?.uid) {
      const demoRole = authService.getDemoRole();
      if (demoRole) {
        return allowedRoles.includes(demoRole)
          ? true
          : router.createUrlTree(['/project-tracking/dashboard']);
      }

      return router.createUrlTree(['/auth/login'], {
        queryParams: {
          returnUrl: state.url,
        },
      });
    }

    const role = await roleService.getRoleForUser(user.uid);

    if (allowedRoles.includes(role)) {
      return true;
    }

    return router.createUrlTree(['/project-tracking/dashboard']);
  };
};
