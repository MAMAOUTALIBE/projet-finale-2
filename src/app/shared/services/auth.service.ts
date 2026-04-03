import { Injectable, NgZone, inject } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { UserRole } from '../../core/models/user-role.model';
import { environment } from '../../../environments/environment';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  emailVerified: boolean;
  role?: string;
}

export interface DemoSession {
  uid: string;
  email: string;
  role: UserRole;
  createdAt: number;
  expiresAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private afAuth = inject(AngularFireAuth);
  private afs = inject(AngularFirestore);
  private router = inject(Router);
  private ngZone = inject(NgZone);

  authState: any = null;
  public showLoader = false;
  private readonly adminEmails = new Set(['spruko@admin.com']);
  private readonly demoSessionKey = 'project_tracking_demo_session';
  private readonly demoSessionDurationMs = 12 * 60 * 60 * 1000;

  constructor() {
    this.afAuth.authState.subscribe((auth) => {
      this.authState = auth;
    });
  }

  get isUserAnonymousLoggedIn(): boolean {
    return this.authState !== null ? this.authState.isAnonymous : false;
  }

  get currentUserId(): string {
    return this.authState?.uid ?? this.getDemoSession()?.uid ?? '';
  }

  get currentUserName(): string {
    return this.authState?.email ?? this.getDemoSession()?.email ?? '';
  }

  get currentUser(): any {
    return this.authState !== null ? this.authState : this.getDemoSession();
  }

  get isUserEmailLoggedIn(): boolean {
    return (this.authState !== null && !this.isUserAnonymousLoggedIn) || this.isDemoSessionActive();
  }

  registerWithEmail(email: string, password: string): Promise<void> {
    return this.afAuth
      .createUserWithEmailAndPassword(email, password)
      .then(() => {
        return;
      })
      .catch((error) => {
        throw error;
      });
  }

  loginWithEmail(email: string, password: string): Promise<void> {
    return this.afAuth
      .signInWithEmailAndPassword(email, password)
      .then(() => {
        this.clearDemoSession();
        return;
      })
      .catch((error) => {
        throw error;
      });
  }

  singout(): void {
    this.clearDemoSession();
    void this.afAuth.signOut().catch(() => undefined);
    this.router.navigate(['/auth/login']);
  }

  SignUp(email: string, password: string): Promise<void> {
    return this.afAuth
      .createUserWithEmailAndPassword(email, password)
      .then(async (result) => {
        if (result.user) {
          await this.SetUserData(result.user);
          await this.SendVerificationMail();
        }
      })
      .catch((error) => {
        window.alert(error.message);
      });
  }

  SendVerificationMail(): Promise<void> {
    return this.afAuth.currentUser.then(async (user) => {
      if (user) {
        await user.sendEmailVerification();
      }
      await this.router.navigate(['/project-tracking/dashboard']);
    });
  }

  SetUserData(user: any): Promise<void> {
    const userRef: AngularFirestoreDocument<User> = this.afs.doc(`users/${user.uid}`);
    const email = (user.email ?? '').toLowerCase();

    const userData: User = {
      email: user.email ?? '',
      displayName: user.displayName ?? user.email ?? 'Utilisateur',
      uid: user.uid,
      photoURL: user.photoURL || 'src/favicon.ico',
      emailVerified: user.emailVerified,
      role: this.adminEmails.has(email) ? 'admin' : 'stakeholder',
    };

    return userRef.set(userData, {
      merge: true,
    });
  }

  SignIn(email: string, password: string): Promise<void> {
    return this.afAuth
      .signInWithEmailAndPassword(email, password)
      .then(async (result) => {
        if (!result.user) {
          return;
        }

        if (result.user.emailVerified !== true) {
          await this.SetUserData(result.user);
          await this.SendVerificationMail();
          this.showLoader = true;
        } else {
          this.showLoader = false;
          this.clearDemoSession();
          this.ngZone.run(() => {
            this.router.navigate(['/project-tracking/dashboard']);
          });
        }
      })
      .catch((error) => {
        throw error;
      });
  }

  ForgotPassword(passwordResetEmail: string): Promise<void> {
    return this.afAuth
      .sendPasswordResetEmail(passwordResetEmail)
      .then(() => {
        window.alert('Password reset email sent, check your inbox.');
      })
      .catch((error) => {
        window.alert(error);
      });
  }

  startLocalDemoSession(email: string): DemoSession {
    if (!environment.enableLocalDemo) {
      throw new Error('Local demo mode is disabled for this environment.');
    }

    const normalizedEmail = (email || '').trim().toLowerCase() || 'demo@local.test';
    const role: UserRole = this.adminEmails.has(normalizedEmail) ? 'admin' : 'stakeholder';
    const now = Date.now();

    const session: DemoSession = {
      uid: `demo-${normalizedEmail.replace(/[^a-z0-9]/g, '-')}`,
      email: normalizedEmail,
      role,
      createdAt: now,
      expiresAt: now + this.demoSessionDurationMs,
    };

    this.persistDemoSession(session);
    return session;
  }

  isDemoSessionActive(): boolean {
    return Boolean(this.getDemoSession());
  }

  getDemoRole(): UserRole | null {
    return this.getDemoSession()?.role ?? null;
  }

  getDemoSession(): DemoSession | null {
    if (!environment.enableLocalDemo) {
      this.clearDemoSession();
      return null;
    }

    if (typeof localStorage === 'undefined') {
      return null;
    }

    const raw = localStorage.getItem(this.demoSessionKey);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as DemoSession;
      if (!parsed?.uid || !parsed?.role || !parsed?.expiresAt) {
        this.clearDemoSession();
        return null;
      }

      if (parsed.expiresAt <= Date.now()) {
        this.clearDemoSession();
        return null;
      }

      return parsed;
    } catch {
      this.clearDemoSession();
      return null;
    }
  }

  clearDemoSession(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem(this.demoSessionKey);
  }

  private persistDemoSession(session: DemoSession): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.demoSessionKey, JSON.stringify(session));
  }
}
