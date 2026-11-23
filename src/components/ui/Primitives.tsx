import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  Search,
  Sparkles,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import type { ToastItem } from '../../context/DataContext';

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, eyebrow, actions, className = '' }) => (
  <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
    <div className="min-w-0">
      {eyebrow && (
        <p className="text-xs font-medium tracking-wide text-[#22D3EE] mb-1">{eyebrow}</p>
      )}
      <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#F8FAFC]">
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-sm text-[#94A3B8] max-w-2xl">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  style?: React.CSSProperties;
}> = ({ children, className = '', padding = 'md', interactive = false, style }) => {
  const padMap = {
    none: '',
    sm: 'p-3.5',
    md: 'p-5',
    lg: 'p-6',
  };
  return (
    <div
      style={style}
      className={`rounded-xl border border-white/[0.08] bg-[#111B2E] shadow-[0_4px_16px_rgba(2,6,23,0.32)] ${
        interactive
          ? 'transition-all duration-150 hover:border-[#3B82F6]/45 hover:-translate-y-0.5'
          : ''
      } ${padMap[padding]} ${className}`}
    >
      {children}
    </div>
  );
};

export const GlassPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}> = ({ children, className = '', padding = 'none', style }) => {
  const padMap = {
    none: '',
    sm: 'p-3.5',
    md: 'p-5',
    lg: 'p-6',
  };
  return (
    <div
      style={style}
      className={`glass-panel rounded-2xl ${padMap[padding]} ${className}`}
    >
      {children}
    </div>
  );
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
  }
> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) => {
  const variants = {
    primary:
      'bg-[#3B82F6] hover:bg-[#2563EB] text-white border border-[#60A5FA]/20 shadow-[0_4px_14px_rgba(59,130,246,0.28)]',
    secondary:
      'bg-[#17243A] hover:bg-[#1E2F4C] text-[#F8FAFC] border border-white/[0.12]',
    outline:
      'bg-transparent hover:bg-white/[0.06] text-[#F8FAFC] border border-white/[0.16]',
    ghost:
      'bg-transparent hover:bg-white/[0.06] text-[#94A3B8] hover:text-[#F8FAFC] border border-transparent',
    danger:
      'bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#FCA5A5] border border-[#EF4444]/35',
    success:
      'bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#6EE7B7] border border-[#10B981]/35',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-sm gap-2',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
      {children}
    </button>
  );
};

export const Input: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    error?: string;
    hint?: string;
  }
> = ({ label, error, hint, className = '', id, ...rest }) => {
  const inputId = id || label?.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[#94A3B8]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-lg border bg-[#0B1220] px-3 py-2 text-sm text-[#F8FAFC] placeholder:text-[#64748B] transition-colors focus:border-[#3B82F6] focus:outline-none ${
          error ? 'border-[#EF4444]' : 'border-white/[0.1] hover:border-white/[0.2]'
        } ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}
      {!error && hint && <p className="text-xs text-[#64748B]">{hint}</p>}
    </div>
  );
};

export const Select: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
    error?: string;
  }
> = ({ label, error, className = '', id, children, ...rest }) => {
  const selectId = id || label?.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-[#94A3B8]">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full rounded-lg border bg-[#0B1220] px-3 py-2 text-sm text-[#F8FAFC] transition-colors focus:border-[#3B82F6] focus:outline-none ${
          error ? 'border-[#EF4444]' : 'border-white/[0.1] hover:border-white/[0.2]'
        } ${className}`}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}
    </div>
  );
};

export const Textarea: React.FC<
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label?: string;
    error?: string;
  }
> = ({ label, error, className = '', id, ...rest }) => {
  const taId = id || label?.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={taId} className="block text-xs font-medium text-[#94A3B8]">
          {label}
        </label>
      )}
      <textarea
        id={taId}
        className={`w-full rounded-lg border bg-[#0B1220] px-3 py-2 text-sm text-[#F8FAFC] placeholder:text-[#64748B] transition-colors focus:border-[#3B82F6] focus:outline-none ${
          error ? 'border-[#EF4444]' : 'border-white/[0.1] hover:border-white/[0.2]'
        } ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}
    </div>
  );
};

export const StatusBadge: React.FC<{
  status: string;
  label?: string;
}> = ({ status, label }) => {
  const norm = status.toLowerCase();
  const display =
    label ??
    status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  let tone = 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  let Icon = Info;

  if (
    ['approved', 'operational', 'available', 'active', 'completed', 'checked_in', 'eligible', 'connected'].includes(
      norm
    )
  ) {
    tone = 'bg-[#10B981]/15 text-[#6EE7B7] border-[#10B981]/35';
    Icon = CheckCircle2;
  } else if (
    ['pending_approval', 'submitted', 'scheduled', 'waitlisted', 'waiting', 'notified', 'pending', 'in_use', 'busy'].includes(
      norm
    )
  ) {
    tone = 'bg-[#F59E0B]/15 text-[#FCD34D] border-[#F59E0B]/35';
    Icon = Clock;
  } else if (['ai_recommended', 'modified'].includes(norm)) {
    tone = 'bg-[#22D3EE]/15 text-[#67E8F9] border-[#22D3EE]/35';
    Icon = Sparkles;
  } else if (['under_maintenance', 'maintenance', 'needs_service'].includes(norm)) {
    tone = 'bg-[#F59E0B]/15 text-[#FDBA74] border-[#F59E0B]/35';
    Icon = Wrench;
  } else if (['rejected', 'cancelled', 'ineligible', 'inactive', 'suspended', 'offline', 'conflict'].includes(norm)) {
    tone = 'bg-[#EF4444]/15 text-[#FCA5A5] border-[#EF4444]/35';
    Icon = XCircle;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${tone}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {display}
    </span>
  );
};

export const ScoreRing: React.FC<{
  score: number;
  size?: number;
  strokeWidth?: number;
}> = ({ score, size = 56, strokeWidth = 5 }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const color = clamped >= 75 ? '#22D3EE' : clamped >= 50 ? '#3B82F6' : '#F59E0B';

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums text-[#F8FAFC]">
        {clamped.toFixed(1)}
      </span>
    </div>
  );
};

export const ProgressBar: React.FC<{
  value: number;
  max?: number;
  color?: string;
  label?: string;
  showValue?: boolean;
  className?: string;
}> = ({ value, max = 100, color = '#3B82F6', label, showValue = false, className = '' }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs text-[#94A3B8]">
          {label && <span>{label}</span>}
          {showValue && <span className="tabular-nums font-medium text-[#F8FAFC]">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#0B1220] border border-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

export const StatCard: React.FC<{
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
  accent?: 'blue' | 'cyan' | 'violet' | 'emerald' | 'amber';
}> = ({ label, value, sublabel, icon, accent = 'blue' }) => {
  const [displayNum, setDisplayNum] = useState<number | null>(null);

  useEffect(() => {
    if (typeof value !== 'number') {
      setDisplayNum(null);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplayNum(value);
      return;
    }
    const start = performance.now();
    const duration = 380;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayNum(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const accentMap = {
    blue: 'text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/25',
    cyan: 'text-[#22D3EE] bg-[#22D3EE]/10 border-[#22D3EE]/25',
    violet: 'text-[#8B5CF6] bg-[#8B5CF6]/10 border-[#8B5CF6]/25',
    emerald: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/25',
    amber: 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/25',
  };

  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#94A3B8]">{label}</p>
        <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight tabular-nums text-[#F8FAFC]">
          {typeof value === 'number' ? displayNum ?? value : value}
        </p>
        {sublabel && <p className="mt-1 text-xs text-[#64748B] truncate">{sublabel}</p>}
      </div>
      {icon && (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${accentMap[accent]}`}
        >
          {icon}
        </div>
      )}
    </Card>
  );
};

export const Tooltip: React.FC<{
  content: string;
  children: React.ReactNode;
}> = ({ content, children }) => (
  <span className="group relative inline-flex items-center" title={content}>
    {children}
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-white/15 bg-[#070B14] px-2.5 py-1.5 text-[11px] text-[#F8FAFC] shadow-xl group-hover:block group-focus-within:block"
    >
      {content}
    </span>
  </span>
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <Card className="flex flex-col items-center justify-center py-12 text-center">
    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#17243A] text-[#94A3B8]">
      {icon ?? <Info className="h-5 w-5" />}
    </div>
    <h3 className="text-base font-semibold text-[#F8FAFC]">{title}</h3>
    <p className="mt-1 max-w-md text-sm text-[#94A3B8]">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </Card>
);

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = 'Unable to load records', message, onRetry }) => (
  <Card className="border-[#EF4444]/35 bg-[#EF4444]/5">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#EF4444]" />
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-[#FCA5A5]">{title}</h3>
        <p className="mt-1 text-xs text-[#94A3B8]">{message}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  </Card>
);

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = 'h-24 w-full' }) => (
  <div className={`animate-pulse rounded-xl bg-white/[0.05] ${className}`} aria-hidden="true" />
);

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6" aria-label="Loading workspace">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
    </div>
    <div className="grid gap-6 lg:grid-cols-3">
      <SkeletonBlock className="h-64 lg:col-span-2" />
      <SkeletonBlock className="h-64" />
    </div>
  </div>
);

export const Tabs: React.FC<{
  items: Array<{ id: string; label: string; count?: number }>;
  activeId: string;
  onChange: (id: string) => void;
}> = ({ items, activeId, onChange }) => (
  <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.08] bg-[#0B1220] p-1">
    {items.map((item) => {
      const active = item.id === activeId;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
            active
              ? 'bg-[#17243A] text-[#F8FAFC] shadow-sm border border-white/[0.08]'
              : 'text-[#94A3B8] hover:text-[#F8FAFC] border border-transparent'
          }`}
        >
          <span>{item.label}</span>
          {typeof item.count === 'number' && (
            <span className="tabular-nums text-[11px] text-[#64748B]">({item.count})</span>
          )}
        </button>
      );
    })}
  </div>
);

export const Stepper: React.FC<{
  steps: Array<{ label: string; detail?: string }>;
  activeIndex: number;
}> = ({ steps, activeIndex }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
    {steps.map((s, idx) => {
      const done = idx < activeIndex;
      const current = idx === activeIndex;
      return (
        <div
          key={s.label}
          className={`rounded-lg border px-3 py-2 transition-colors ${
            done
              ? 'border-[#10B981]/30 bg-[#10B981]/10'
              : current
              ? 'border-[#22D3EE]/50 bg-[#22D3EE]/10'
              : 'border-white/[0.06] bg-[#0B1220]'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
                done
                  ? 'bg-[#10B981] text-[#070B14]'
                  : current
                  ? 'bg-[#22D3EE] text-[#070B14]'
                  : 'bg-white/10 text-[#94A3B8]'
              }`}
            >
              {done ? <Check className="h-2.5 w-2.5" /> : idx + 1}
            </span>
            <span className="truncate text-[#F8FAFC]">{s.label}</span>
          </div>
          {s.detail && <p className="mt-1 truncate text-[11px] text-[#94A3B8]">{s.detail}</p>}
        </div>
      );
    })}
  </div>
);

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ open, onClose, title, subtitle, children, maxWidth = 'lg' }) => {
  if (!open) return null;
  const maxMap = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/[0.12] bg-[#111B2E] p-6 shadow-2xl ${maxMap[maxWidth]}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F8FAFC]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#94A3B8]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-white/10 hover:text-[#F8FAFC] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  side?: 'right' | 'bottom';
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, side = 'right', children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        className={
          side === 'bottom'
            ? 'fixed inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-white/[0.12] bg-[#111B2E] p-5 shadow-2xl'
            : 'relative h-full w-full max-w-md overflow-y-auto border-l border-white/[0.12] bg-[#111B2E] p-6 shadow-2xl'
        }
      >
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-white/[0.08] pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#F8FAFC] truncate">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#94A3B8]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-white/10 hover:text-[#F8FAFC] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} maxWidth="sm">
    <p className="text-sm text-[#94A3B8]">{message}</p>
    <div className="mt-6 flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel} disabled={loading}>
        Cancel
      </Button>
      <Button variant={variant} onClick={onConfirm} loading={loading}>
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchPlaceholder = 'Filter records...',
  searchText,
  pageSize = 8,
  emptyTitle = 'No matching records',
  emptyDescription = 'Try adjusting your search or filter criteria.',
  loading = false,
  error = null,
  onRetry,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  searchText?: (row: T) => string;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q && searchText) {
      list = rows.filter((r) => searchText(r).toLowerCase().includes(q));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        const getVal = col.sortValue;
        list = [...list].sort((a, b) => {
          const av = getVal(a);
          const bv = getVal(b);
          const cmp =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv));
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [rows, query, searchText, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (error) {
    return <ErrorState title="Unable to load table records" message={error} onRetry={onRetry} />;
  }

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-3" aria-label="Loading records">
        <div className="hidden rounded-xl border border-white/[0.08] bg-[#111B2E] p-4 md:block space-y-3">
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
        </div>
        <div className="space-y-2.5 md:hidden">
          <SkeletonBlock className="h-28 w-full" />
          <SkeletonBlock className="h-28 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {searchText && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-white/10 bg-[#0B1220] py-1.5 pl-9 pr-8 text-sm text-[#F8FAFC] placeholder:text-[#64748B] transition-colors focus:border-[#3B82F6] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setPage(1);
                }}
                aria-label="Clear filter"
                className="absolute right-2.5 top-2 text-[#64748B] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs tabular-nums text-[#94A3B8]">{filtered.length} records</span>
        </div>
      )}

      {paged.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={
            query ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setPage(1);
                }}
              >
                Clear Filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-white/[0.08] bg-[#111B2E] md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#0B1220]/80 text-xs font-medium text-[#94A3B8]">
                  {columns.map((c) => (
                    <th key={c.key} className={`px-4 py-3 whitespace-nowrap ${c.className ?? ''}`}>
                      {c.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                        >
                          {c.header}
                          {sortKey === c.key &&
                            (sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-[#22D3EE]" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-[#22D3EE]" />
                            ))}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {paged.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-white/[0.025]">
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {paged.map((row) => (
              <Card key={row.id} padding="sm" className="space-y-2.5">
                {columns.map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 text-xs">
                    <span className="shrink-0 font-medium text-[#64748B]">{c.header}</span>
                    <div className="min-w-0 break-words text-right text-[#F8FAFC]">
                      {c.render(row)}
                    </div>
                  </div>
                ))}
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
              <span className="tabular-nums">
                Page {safePage} of {totalPages}
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  const toneStyles = {
    info: 'border-[#3B82F6]/40 bg-[#111B2E]',
    success: 'border-[#10B981]/40 bg-[#111B2E]',
    warning: 'border-[#F59E0B]/40 bg-[#111B2E]',
    error: 'border-[#EF4444]/40 bg-[#111B2E]',
  };
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl ${toneStyles[t.tone]}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#F8FAFC]">{t.title}</p>
            {t.message && <p className="mt-0.5 text-xs text-[#94A3B8]">{t.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-[#64748B] hover:text-[#F8FAFC] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
