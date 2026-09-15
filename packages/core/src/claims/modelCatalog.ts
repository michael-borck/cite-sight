export interface ModelArtifact {
  id: string;
  name: string;
  fileName: string;
  url: string;
  sha256: string;
  bytes: number;
  revision: string;
  license: string;
  licenseUrl: string;
  suggestedRamGB: number;
  assessmentStatus: 'experimental';
  inferenceProfile?: { reasoning: 'off'; chatTemplate: 'chatml' };
  cpuBenchmark?: { medianSeconds: number; p90Seconds: number; hardware: string };
  smokeResult?: { promptVersion: string; correct: number; total: number; falseSupport: number; falseContradiction: number };
}

// Publisher-hosted files pinned to immutable revisions and LFS SHA-256 values.
// Inclusion means approved for download, not validated for grading.
export const CLAIM_MODELS: readonly ModelArtifact[] = [
  {
    id: 'qwen3.5-2b-q4km', name: 'Qwen 3.5 2B · faster CPU option', fileName: 'Qwen3.5-2B-Q4_K_M.gguf',
    revision: 'f6d5376be1edb4d416d56da11e5397a961aca8ae',
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf',
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223', bytes: 1280835840,
    license: 'Apache-2.0', licenseUrl: 'https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE',
    suggestedRamGB: 8, assessmentStatus: 'experimental', inferenceProfile: { reasoning: 'off', chatTemplate: 'chatml' },
    smokeResult: { promptVersion: 'claim-evidence-v2', correct: 17, total: 20, falseSupport: 0, falseContradiction: 3 },
    cpuBenchmark: { medianSeconds: 9.271, p90Seconds: 9.92, hardware: 'Apple M1, 16 GB RAM, CPU only' },
  },
  {
    id: 'qwen3.5-4b-q4km', name: 'Qwen 3.5 4B · stronger pilot candidate', fileName: 'Qwen3.5-4B-Q4_K_M.gguf',
    revision: 'e87f176479d0855a907a41277aca2f8ee7a09523',
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf',
    sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4', bytes: 2740937888,
    license: 'Apache-2.0', licenseUrl: 'https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE',
    suggestedRamGB: 16, assessmentStatus: 'experimental', inferenceProfile: { reasoning: 'off', chatTemplate: 'chatml' },
    smokeResult: { promptVersion: 'claim-evidence-v2', correct: 19, total: 20, falseSupport: 0, falseContradiction: 1 },
    cpuBenchmark: { medianSeconds: 23.623, p90Seconds: 26.642, hardware: 'Apple M1, 16 GB RAM, CPU only' },
  },
  {
    id: 'qwen2.5-1.5b-q4km', name: 'Qwen 2.5 1.5B Instruct', fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    revision: '91cad51170dc346986eccefdc2dd33a9da36ead9',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e', bytes: 1117320736,
    license: 'Apache-2.0', licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/blob/91cad51170dc346986eccefdc2dd33a9da36ead9/LICENSE',
    suggestedRamGB: 8, assessmentStatus: 'experimental',
    smokeResult: { promptVersion: 'claim-evidence-v2', correct: 11, total: 20, falseSupport: 6, falseContradiction: 3 },
  },
  {
    id: 'smollm2-1.7b-q4km', name: 'SmolLM2 1.7B Instruct', fileName: 'smollm2-1.7b-instruct-q4_k_m.gguf',
    revision: '2d4a76a30b4af41ecd395c35725ac11688d4cfe4',
    url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/2d4a76a30b4af41ecd395c35725ac11688d4cfe4/smollm2-1.7b-instruct-q4_k_m.gguf',
    sha256: 'decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33', bytes: 1055609536,
    license: 'Apache-2.0', licenseUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/blob/main/LICENSE',
    suggestedRamGB: 8, assessmentStatus: 'experimental',
    smokeResult: { promptVersion: 'claim-evidence-v2', correct: 9, total: 20, falseSupport: 10, falseContradiction: 0 },
  },
];

export const CLAIM_RUNTIME_VERSION = 'b8680';
export const CLAIM_PROMPT_VERSION = 'claim-evidence-v2';
export const CLAIM_INFERENCE = { temperature: 0, seed: 0, contextSize: 8192, maxTokens: 1024, device: 'cpu' } as const;
