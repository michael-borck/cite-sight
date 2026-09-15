import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AnalysisResult, BatchPlan, ProcessingOptions, ProgressUpdate, ReferenceVerification } from '@michaelborck/cite-sight-core';
import type { BatchItem } from '../batch';
import type { ReviewSession } from '@michaelborck/cite-sight-core/session';
import type { ClaimInstallationStatus } from '../../shared/claimInstallation';

interface AppState {
  plan?: BatchPlan;
  setPlan: (plan: BatchPlan | undefined) => void;
  phase: 'references' | 'claims';
  setPhase: (phase: 'references' | 'claims') => void;
  queueClaims: (paths: string[]) => void;
  claimInstallation?: ClaimInstallationStatus;
  setClaimInstallation: (value: ClaimInstallationStatus) => void;
  claimSources: Record<string, string>;
  setClaimSource: (reference: string, path?: string) => void;
  filePaths: string[];
  batch: BatchItem[];
  selectedPath: string;
  activePath: string;
  hasStarted: boolean;
  sessionId: number;
  options: ProcessingOptions;
  isProcessing: boolean;
  cancelRequested: boolean;
  progress: ProgressUpdate | null;
  streamingRefs: ReferenceVerification[];
  streamingTotal: number;
  error: string | null;
  addFiles: (paths: string[]) => void;
  removeFile: (path: string) => void;
  clearFiles: () => void;
  updateOptions: (options: Partial<ProcessingOptions>) => void;
  setProcessing: (value: boolean) => void;
  requestCancel: () => void;
  selectFile: (path: string) => void;
  startFile: (path: string, options: ProcessingOptions, phase?: 'references' | 'claims') => void;
  completeFile: (path: string, result: AnalysisResult) => void;
  failFile: (path: string, error: string) => void;
  updateResult: (path: string, result: AnalysisResult) => void;
  saveClaimProgress: (path: string, result: AnalysisResult) => void;
  setProgress: (progress: ProgressUpdate) => void;
  addStreamingRef: (verification: ReferenceVerification, total: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  restoreSession: (session: ReviewSession) => void;
}

export const defaultOptions: ProcessingOptions = {
  offline: true,
  documentType: 'assignment', citationStyle: 'auto', checkUrls: true, checkDoi: true,
  checkInText: true, screenshotUrls: false,
};
const empty = {
  plan: undefined as BatchPlan | undefined, phase: 'references' as const,
  claimSources: {} as Record<string, string>,
  filePaths: [] as string[], batch: [] as BatchItem[], selectedPath: '', activePath: '', hasStarted: false,
  isProcessing: false, cancelRequested: false, progress: null, streamingRefs: [] as ReferenceVerification[],
  streamingTotal: 0, error: null,
};

export const useStore = create<AppState>()(persist((set, get) => ({
  setPlan: (plan) => set({ plan }), setPhase: (phase) => set({ phase }),
  queueClaims: (paths) => set((state) => ({ batch: state.batch.map((item) => paths.includes(item.path) ? {
    ...item, phase: 'claims', status: 'waiting', claimSources: item.result?.references.references.flatMap((ref, index) => state.claimSources[ref.raw]
      ? [{ reference: index + 1, path: state.claimSources[ref.raw], referenceText: ref.raw }] : []),
  } : item) })),
  setClaimInstallation: (claimInstallation) => set({ claimInstallation }),
  setClaimSource: (reference, path) => set((state) => {
    const claimSources = { ...state.claimSources };
    if (path) claimSources[reference] = path; else delete claimSources[reference];
    return { claimSources };
  }),
  ...empty, sessionId: 0, options: defaultOptions,
  addFiles: (paths) => set((state) => {
    const unique = [...new Set(paths)].filter((path) => !state.filePaths.includes(path));
    return { filePaths: [...state.filePaths, ...unique], batch: [...state.batch, ...unique.map((path) => ({ path, status: 'waiting' as const }))], error: null };
  }),
  removeFile: (path) => set((state) => ({ filePaths: state.filePaths.filter((p) => p !== path), batch: state.batch.filter((item) => item.path !== path) })),
  clearFiles: () => get().reset(),
  updateOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),
  setProcessing: (isProcessing) => set({ isProcessing, cancelRequested: false, ...(isProcessing ? { error: null } : { activePath: '' }) }),
  requestCancel: () => set({ cancelRequested: true }),
  selectFile: (selectedPath) => set({ selectedPath }),
  startFile: (path, options, phase = 'references') => set((state) => ({
    hasStarted: true, activePath: path,
    selectedPath: !state.selectedPath || state.selectedPath === state.activePath ? path : state.selectedPath,
    progress: null, streamingRefs: [], streamingTotal: 0,
    batch: state.batch.map((item) => item.path === path ? { ...item, status: 'processing', phase, options, error: undefined,
      claimSources: phase === 'claims' ? item.result?.references.references.flatMap((ref, index) => state.claimSources[ref.raw] ? [{ reference: index + 1, path: state.claimSources[ref.raw], referenceText: ref.raw }] : []) : undefined,
    } : item),
  })),
  completeFile: (path, result) => set((state) => ({ batch: state.batch.map((item) => item.path === path ? { ...item, status: 'complete', result, error: undefined } : item) })),
  failFile: (path, error) => set((state) => ({ batch: state.batch.map((item) => item.path === path ? { ...item, status: 'failed', error } : item) })),
  updateResult: (path, result) => set((state) => ({ batch: state.batch.map((item) => item.path === path ? { ...item, result } : item) })),
  saveClaimProgress: (path, result) => set((state) => ({ batch: state.batch.map((item) => item.path === path ? { ...item,
    phase: 'claims', claimLimit: result.claims?.progress?.total || item.claimLimit || 50,
    status: item.status === 'processing' ? 'processing' : result.claims?.progress?.state === 'complete' ? 'complete' : 'waiting',
    result: { ...result, reviews: item.result?.reviews },
  } : item) })),
  setProgress: (progress) => set({ progress }),
  addStreamingRef: (verification, total) => set((state) => ({ streamingRefs: [...state.streamingRefs, verification], streamingTotal: total })),
  setError: (error) => set({ error }),
  reset: () => { if (!get().isProcessing) set((state) => ({ ...empty, sessionId: state.sessionId + 1 })); },
  restoreSession: (session) => { if (!get().isProcessing) set((state) => ({
    ...empty, sessionId: state.sessionId + 1, hasStarted: true,
    batch: session.files, filePaths: session.files.map((file) => file.path),
    claimSources: Object.fromEntries(session.files.flatMap((file) => (file.claimSources ?? []).flatMap((binding) => {
      const raw = binding.referenceText ?? file.result?.references.references[binding.reference - 1]?.raw;
      return raw ? [[raw, binding.path]] : [];
    }))),
    selectedPath: session.files.some((file) => file.path === session.selectedPath) ? session.selectedPath! : session.files[0]?.path ?? '',
    options: { ...state.options, ...session.options, offline: state.options.offline !== false || session.options.offline === true },
  })); },
}), {
  name: 'cite-sight-options', storage: createJSONStorage(() => window.localStorage),
  partialize: (state) => ({ options: state.options }),
  merge: (persisted, current) => {
    const saved = (persisted as { options?: Partial<ProcessingOptions> } | undefined)?.options;
    return { ...current, options: { ...defaultOptions, ...saved,
      documentType: saved?.documentType ?? (saved?.checkInText === false ? 'reference-list' : 'assignment'),
    } };
  },
}));
