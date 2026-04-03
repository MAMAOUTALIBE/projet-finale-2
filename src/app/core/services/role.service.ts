import { Injectable, inject } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Observable, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { UserProfile, UserRole } from '../models/user-role.model';
import { AuthService } from '../../shared/services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class RoleService {
  private afs = inject(AngularFirestore);
  private afAuth = inject(AngularFireAuth);
  private authService = inject(AuthService);

  private readonly usersCollection = 'users';
  private readonly defaultRole: UserRole = 'stakeholder';
  private readonly adminEmails = new Set(['spruko@admin.com']);

  currentUserRole$(): Observable<UserRole | null> {
    return this.afAuth.authState.pipe(
      switchMap((user) => {
        if (!user?.uid) {
          return of(this.authService.getDemoRole());
        }

        return this.afs
          .doc<UserProfile>(`${this.usersCollection}/${user.uid}`)
          .valueChanges()
          .pipe(map((profile) => profile?.role ?? this.defaultRole));
      })
    );
  }

  async getRoleForUser(uid: string): Promise<UserRole> {
    const snapshot = await this.afs.doc<UserProfile>(`${this.usersCollection}/${uid}`).ref.get();
    if (!snapshot.exists) {
      return this.defaultRole;
    }

    const data = snapshot.data();
    return data?.role ?? this.defaultRole;
  }

  async ensureCurrentUserProfile(): Promise<void> {
    const user = await this.afAuth.currentUser;
    if (!user) {
      return;
    }

    const userRef = this.afs.doc<UserProfile>(`${this.usersCollection}/${user.uid}`).ref;
    const currentSnapshot = await userRef.get();
    const now = Date.now();

    if (!currentSnapshot.exists) {
      const email = (user.email ?? '').toLowerCase();
      const role: UserRole = this.adminEmails.has(email) ? 'admin' : this.defaultRole;
      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName ?? user.email ?? 'Utilisateur',
        role,
        createdAt: now,
        updatedAt: now,
      };
      await userRef.set(newProfile);
      return;
    }

    await userRef.set({ updatedAt: now }, { merge: true });
  }

  getCurrentUserProfile(): Observable<UserProfile | null> {
    return this.afAuth.authState.pipe(
      take(1),
      switchMap((user) => {
        if (!user?.uid) {
          const demoSession = this.authService.getDemoSession();
          if (!demoSession) {
            return of(null);
          }

          return of({
            uid: demoSession.uid,
            email: demoSession.email,
            displayName: demoSession.email,
            role: demoSession.role,
            updatedAt: Date.now(),
          } as UserProfile);
        }

        return this.afs.doc<UserProfile>(`${this.usersCollection}/${user.uid}`).valueChanges().pipe(
          map((profile) => (profile ? profile : null))
        );
      })
    );
  }
}
