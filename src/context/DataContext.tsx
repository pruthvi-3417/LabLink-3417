import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { repo, resetLocalDataset, type RepoMode } from '../data/repo';
import { createSeedDataset, type LabLinkDataset } from '../data/seed';
import { isFirebaseConfigured, testFirestoreConnection } from '../lib/firebase';
import { useAuth } from './AuthContext';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface DataContextValue {
  data: LabLinkDataset;
  loading: boolean;
  error: string | null;
  mode: RepoMode;
  firebaseStatus: 'connected' | 'offline' | 'unconfigured';
  geminiStatus: 'configured' | 'fallback' | 'checking';
  refresh: () => Promise<void>;
  setMode: (mode: RepoMode) => void;
  resetDemoData: () => void;
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshProfile } = useAuth();
  const [data, setData] = useState<LabLinkDataset>(() => createSeedDataset());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setModeState] = useState<RepoMode>(() => repo.getMode());
  const [firebaseStatus, setFirebaseStatus] = useState<'connected' | 'offline' | 'unconfigured'>(
    isFirebaseConfigured ? 'offline' : 'unconfigured'
  );
  const [geminiStatus, setGeminiStatus] = useState<'configured' | 'fallback' | 'checking'>('checking');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        dismissToast(id);
      }, 4800);
    },
    [dismissToast]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await repo.fetchAll(user);
      setData(snapshot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load campus dataset.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh, mode]);

  useEffect(() => {
    const unsub = repo.subscribe(() => {
      setModeState(repo.getMode());
      refresh();
      refreshProfile();
    });
    return () => {
      unsub();
    };
  }, [refresh, refreshProfile]);

  useEffect(() => {
    if (user) {
      repo.ensureUpcomingReminders(user.uid).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    testFirestoreConnection().then((status) => {
      if (active) setFirebaseStatus(status);
    });
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json) {
          setGeminiStatus(json.geminiConfigured ? 'configured' : 'fallback');
        } else if (active) {
          setGeminiStatus('fallback');
        }
      })
      .catch(() => {
        if (active) setGeminiStatus('fallback');
      });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: RepoMode) => {
    repo.setMode(next);
    setModeState(next);
  }, []);

  const resetDemoData = useCallback(() => {
    const fresh = resetLocalDataset();
    setData(fresh);
    pushToast({ title: 'Demo Dataset Reset', message: 'Restored reproducible campus scenario.', tone: 'success' });
  }, [pushToast]);

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      loading,
      error,
      mode,
      firebaseStatus,
      geminiStatus,
      refresh,
      setMode,
      resetDemoData,
      toasts,
      pushToast,
      dismissToast,
    }),
    [data, loading, error, mode, firebaseStatus, geminiStatus, refresh, setMode, resetDemoData, toasts, pushToast, dismissToast]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
