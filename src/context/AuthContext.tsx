import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { formatLocalIso } from '../engine/constants';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import { loadLocalDataset, repo } from '../data/repo';
import type { UserProfile, UserRole } from '../types/models';

const LOCAL_SESSION_KEY = 'lablink_local_demo_uid_v1';

export interface AuthState {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  authError: string | null;
  firebaseAuthConfigHint: string | null;
  clearErrors: () => void;
  loginWithEmail: (email: string, password: string) => Promise<UserProfile>;
  loginWithGoogle: () => Promise<UserProfile>;
  registerWithEmail: (input: {
    displayName: string;
    email: string;
    password: string;
    departmentId: string;
    studentIdCode?: string;
    requestElevatedRole?: boolean;
    requestedRole?: 'faculty' | 'admin';
    justification?: string;
  }) => Promise<UserProfile>;
  loginDemoAccount: (demoUserId: string) => Promise<UserProfile>;
  sendResetEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchToLocalDemo: (demoUserId?: string) => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthState | null>(null);

function mapFirebaseAuthError(err: unknown): { message: string; configHint: string | null } {
  const code = (err as { code?: string })?.code ?? '';
  const rawMsg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/operation-not-allowed') {
    return {
      message: 'Email/Password sign-in is not yet enabled in Firebase Authentication.',
      configHint:
        'Enable Email/Password in Firebase Console -> Authentication -> Sign-in method, or use Local Demo Mode below.',
    };
  }
  if (code === 'auth/unauthorized-domain') {
    return {
      message: 'This preview domain is not authorized in Firebase Authentication.',
      configHint:
        'Add this host to Firebase Console -> Authentication -> Settings -> Authorized domains, or switch to Local Demo Mode.',
    };
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      message: 'Google sign-in window was closed before completing.',
      configHint: null,
    };
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return {
      message: 'Invalid email or password.',
      configHint: null,
    };
  }
  if (code === 'auth/email-already-in-use') {
    return {
      message: 'An account with this email already exists.',
      configHint: null,
    };
  }
  return {
    message: rawMsg.replace(/^Firebase:\s*/i, ''),
    configHint: null,
  };
}

export function getHomeRouteForRole(role: UserRole): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'faculty') return '/faculty/dashboard';
  return '/student/dashboard';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [firebaseAuthConfigHint, setFirebaseAuthConfigHint] = useState<string | null>(null);

  const clearErrors = useCallback(() => {
    setAuthError(null);
    setFirebaseAuthConfigHint(null);
  }, []);

  const hydrateFromFirebaseUser = useCallback(async (fbUser: FirebaseUser): Promise<UserProfile> => {
    const email = fbUser.email ?? 'student@campus.edu';
    const seed = loadLocalDataset();
    const matchedSeed = seed.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    const now = formatLocalIso(Date.now());

    const fallbackProfile: UserProfile = {
      id: fbUser.uid,
      uid: fbUser.uid,
      email,
      displayName: fbUser.displayName || matchedSeed?.displayName || email.split('@')[0],
      role: matchedSeed?.role ?? 'student',
      departmentId: matchedSeed?.departmentId ?? 'dept-cse',
      departmentApproved: true,
      certifications: matchedSeed?.certifications ?? ['lab_safety_l1'],
      studentIdCode: matchedSeed?.studentIdCode,
      status: 'active',
      isDemo: email.endsWith('@lablink.demo'),
      createdAt: now,
      updatedAt: now,
    };

    try {
      const saved = await repo.ensureUserProfile(fallbackProfile);
      setUser(saved);
      return saved;
    } catch (err) {
      // e.g., Firestore rules rejected write because settings/demo wasn't seeded yet
      console.warn('Could not persist user doc in Firestore, falling back:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    if (repo.getMode() === 'local-demo' || !isFirebaseConfigured || !auth) {
      const savedUid = localStorage.getItem(LOCAL_SESSION_KEY);
      if (savedUid) {
        const ds = loadLocalDataset();
        const found = ds.users.find((u) => u.id === savedUid || u.uid === savedUid) ?? null;
        setUser(found);
      } else {
        setUser(null);
      }
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        const localUid = localStorage.getItem(LOCAL_SESSION_KEY);
        if (repo.getMode() === 'local-demo' && localUid) {
          const ds = loadLocalDataset();
          setUser(ds.users.find((u) => u.id === localUid || u.uid === localUid) ?? null);
        } else {
          setUser(null);
        }
        setLoading(false);
        return;
      }

      try {
        await hydrateFromFirebaseUser(fbUser);
      } catch {
        // Keep session recoverable in local-demo if Firestore rules prevent initial profile write
        const seed = loadLocalDataset();
        const match = seed.users.find((u) => u.email.toLowerCase() === (fbUser.email ?? '').toLowerCase());
        if (match) {
          setUser(match);
        } else {
          setUser({
            id: fbUser.uid,
            uid: fbUser.uid,
            email: fbUser.email ?? '',
            displayName: fbUser.displayName ?? 'Campus User',
            role: 'student',
            departmentId: 'dept-cse',
            departmentApproved: true,
            certifications: ['lab_safety_l1'],
            status: 'active',
            isDemo: false,
            createdAt: formatLocalIso(Date.now()),
            updatedAt: formatLocalIso(Date.now()),
          });
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [hydrateFromFirebaseUser]);

  const switchToLocalDemo = useCallback(async (demoUserId?: string): Promise<UserProfile | null> => {
    repo.setMode('local-demo');
    clearErrors();
    const ds = loadLocalDataset();
    if (demoUserId) {
      const found = ds.users.find((u) => u.id === demoUserId || u.uid === demoUserId) ?? ds.users[3];
      localStorage.setItem(LOCAL_SESSION_KEY, found.id);
      setUser(found);
      return found;
    }
    const existingUid = localStorage.getItem(LOCAL_SESSION_KEY);
    const found = existingUid ? ds.users.find((u) => u.id === existingUid) ?? null : null;
    setUser(found);
    return found;
  }, [clearErrors]);

  const loginWithEmail = useCallback(
    async (email: string, password: string): Promise<UserProfile> => {
      clearErrors();
      if (repo.getMode() === 'local-demo' || !auth) {
        const ds = loadLocalDataset();
        const found = ds.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
        if (!found) {
          const msg = 'No matching demo/local profile found for that email. Try a demo account below or register.';
          setAuthError(msg);
          throw new Error(msg);
        }
        localStorage.setItem(LOCAL_SESSION_KEY, found.id);
        setUser(found);
        return found;
      }

      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        return await hydrateFromFirebaseUser(cred.user);
      } catch (err) {
        const mapped = mapFirebaseAuthError(err);
        setAuthError(mapped.message);
        setFirebaseAuthConfigHint(mapped.configHint);
        throw new Error(mapped.message);
      }
    },
    [clearErrors, hydrateFromFirebaseUser]
  );

  const loginWithGoogle = useCallback(async (): Promise<UserProfile> => {
    clearErrors();
    if (repo.getMode() === 'local-demo' || !auth) {
      const ds = loadLocalDataset();
      const student = ds.users.find((u) => u.id === 'user-student-a') ?? ds.users[0];
      localStorage.setItem(LOCAL_SESSION_KEY, student.id);
      setUser(student);
      return student;
    }

    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      return await hydrateFromFirebaseUser(cred.user);
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      setAuthError(mapped.message);
      setFirebaseAuthConfigHint(mapped.configHint);
      throw new Error(mapped.message);
    }
  }, [clearErrors, hydrateFromFirebaseUser]);

  const registerWithEmail = useCallback(
    async (input: {
      displayName: string;
      email: string;
      password: string;
      departmentId: string;
      studentIdCode?: string;
      requestElevatedRole?: boolean;
      requestedRole?: 'faculty' | 'admin';
      justification?: string;
    }): Promise<UserProfile> => {
      clearErrors();
      const now = formatLocalIso(Date.now());

      if (repo.getMode() === 'local-demo' || !auth) {
        const ds = loadLocalDataset();
        if (ds.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
          const msg = 'An account with this email already exists.';
          setAuthError(msg);
          throw new Error(msg);
        }
        const uidVal = `user-${Date.now().toString(36)}`;
        const newProfile: UserProfile = {
          id: uidVal,
          uid: uidVal,
          email: input.email.trim(),
          displayName: input.displayName.trim(),
          role: 'student',
          departmentId: input.departmentId,
          departmentApproved: true,
          certifications: ['lab_safety_l1'],
          studentIdCode: input.studentIdCode?.trim() || undefined,
          status: 'active',
          isDemo: true,
          createdAt: now,
          updatedAt: now,
        };
        const saved = await repo.ensureUserProfile(newProfile);
        if (input.requestElevatedRole && input.requestedRole && input.justification) {
          await repo.createRoleRequest({
            userId: saved.uid,
            email: saved.email,
            displayName: saved.displayName,
            requestedRole: input.requestedRole,
            departmentId: input.departmentId,
            justification: input.justification,
            isDemo: true,
          });
        }
        localStorage.setItem(LOCAL_SESSION_KEY, saved.id);
        setUser(saved);
        return saved;
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
        await updateProfile(cred.user, { displayName: input.displayName.trim() });
        const profile: UserProfile = {
          id: cred.user.uid,
          uid: cred.user.uid,
          email: input.email.trim(),
          displayName: input.displayName.trim(),
          role: 'student',
          departmentId: input.departmentId,
          departmentApproved: true,
          certifications: ['lab_safety_l1'],
          studentIdCode: input.studentIdCode?.trim() || undefined,
          status: 'active',
          isDemo: false,
          createdAt: now,
          updatedAt: now,
        };
        const saved = await repo.ensureUserProfile(profile);
        if (input.requestElevatedRole && input.requestedRole && input.justification) {
          await repo.createRoleRequest({
            userId: saved.uid,
            email: saved.email,
            displayName: saved.displayName,
            requestedRole: input.requestedRole,
            departmentId: input.departmentId,
            justification: input.justification,
            isDemo: false,
          });
        }
        setUser(saved);
        return saved;
      } catch (err) {
        const mapped = mapFirebaseAuthError(err);
        setAuthError(mapped.message);
        setFirebaseAuthConfigHint(mapped.configHint);
        throw new Error(mapped.message);
      }
    },
    [clearErrors]
  );

  const loginDemoAccount = useCallback(
    async (demoUserId: string): Promise<UserProfile> => {
      clearErrors();
      const seed = loadLocalDataset();
      const demoUser = seed.users.find((u) => u.id === demoUserId);
      if (!demoUser) throw new Error('Demo account not found.');

      if (repo.getMode() === 'local-demo' || !auth) {
        localStorage.setItem(LOCAL_SESSION_KEY, demoUser.id);
        setUser(demoUser);
        return demoUser;
      }

      const demoPassword = 'LabLinkDemo!2026';
      try {
        const cred = await signInWithEmailAndPassword(auth, demoUser.email, demoPassword);
        return await hydrateFromFirebaseUser(cred.user);
      } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
          try {
            const cred = await createUserWithEmailAndPassword(auth, demoUser.email, demoPassword);
            await updateProfile(cred.user, { displayName: demoUser.displayName });
            return await hydrateFromFirebaseUser(cred.user);
          } catch (createErr) {
            const mapped = mapFirebaseAuthError(createErr);
            setAuthError(mapped.message);
            setFirebaseAuthConfigHint(mapped.configHint);
            throw new Error(mapped.message);
          }
        }
        const mapped = mapFirebaseAuthError(err);
        setAuthError(mapped.message);
        setFirebaseAuthConfigHint(mapped.configHint);
        throw new Error(mapped.message);
      }
    },
    [clearErrors, hydrateFromFirebaseUser]
  );

  const sendResetEmail = useCallback(
    async (email: string): Promise<void> => {
      clearErrors();
      if (repo.getMode() === 'local-demo' || !auth) {
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email.trim());
      } catch (err) {
        const mapped = mapFirebaseAuthError(err);
        setAuthError(mapped.message);
        throw new Error(mapped.message);
      }
    },
    [clearErrors]
  );

  const logout = useCallback(async (): Promise<void> => {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    if (auth && auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
    setUser(null);
    setFirebaseUser(null);
    clearErrors();
  }, [clearErrors]);

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!user) return;
    if (repo.getMode() === 'local-demo') {
      const ds = loadLocalDataset();
      const latest = ds.users.find((u) => u.id === user.id || u.uid === user.uid);
      if (latest) setUser(latest);
      return;
    }
    if (auth?.currentUser) {
      await hydrateFromFirebaseUser(auth.currentUser);
    }
  }, [user, hydrateFromFirebaseUser]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      firebaseUser,
      loading,
      authError,
      firebaseAuthConfigHint,
      clearErrors,
      loginWithEmail,
      loginWithGoogle,
      registerWithEmail,
      loginDemoAccount,
      sendResetEmail,
      logout,
      refreshProfile,
      switchToLocalDemo,
    }),
    [
      user,
      firebaseUser,
      loading,
      authError,
      firebaseAuthConfigHint,
      clearErrors,
      loginWithEmail,
      loginWithGoogle,
      registerWithEmail,
      loginDemoAccount,
      sendResetEmail,
      logout,
      refreshProfile,
      switchToLocalDemo,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
