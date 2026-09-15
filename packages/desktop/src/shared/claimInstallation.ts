import type { LocalClaimOptions } from '@michaelborck/cite-sight-core';
export type ClaimRequest = Omit<LocalClaimOptions, 'runnerPath' | 'modelPath'> & { restart?: boolean };
export interface ClaimInstallationStatus {
  runtimeVersion?: string;
  runtimeReady: boolean;
  modelId?: string;
  ready: boolean;
  sampleMsPerClaim?: number;
  ramGB: number;
  freeDiskBytes?: number;
  phase: 'idle' | 'downloading' | 'verifying' | 'calibrating' | 'failed';
  received: number;
  total: number;
  error?: string;
}
