import { inject } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthService } from '../../shared/services/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const afAuth = inject(AngularFireAuth);
  const router = inject(Router);
  const authService = inject(AuthService);

  const user = await firstValueFrom(afAuth.authState.pipe(take(1)));

  if (user || authService.isDemoSessionActive()) {
    return true;
  }

  return router.createUrlTree(['/auth/login'], {
    queryParams: {
      returnUrl: state.url,
    },
  });
};
