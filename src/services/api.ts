import axios, { type AxiosError } from 'axios';
import type { AnalysisResults, ProcessingOptions } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 seconds
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth tokens or additional headers here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      // Server responded with error status
      const message = (error.response.data as { detail?: string })?.detail || error.message;
      throw new Error(message);
    } else if (error.request) {
      // Request made but no response
      throw new Error('No response from server. Please check your connection.');
    } else {
      // Something else happened
      throw new Error(error.message);
    }
  }
);

export interface AnalysisRequest {
  files: File[];
  options: ProcessingOptions;
}

export interface HealthCheckResponse {
  status: string;
  version: string;
  timestamp: string;
}

class ApiService {
  async checkHealth(): Promise<HealthCheckResponse> {
    const response = await api.get<HealthCheckResponse>('/health');
    return response.data;
  }

  async analyzeDocuments(
    files: File[],
    options: ProcessingOptions,
    onProgress?: (progress: number, message: string) => void
  ): Promise<AnalysisResults> {
    const formData = new FormData();
    
    // Add files
    files.forEach((file) => {
      formData.append('files', file);
    });

    // Add options
    formData.append('citation_style', options.citationStyle);
    formData.append('check_urls', String(options.checkUrls));
    formData.append('check_doi', String(options.checkDoi));
    formData.append('check_wayback', String(options.checkWayback));
    formData.append('check_plagiarism', String(options.checkPlagiarism));
    formData.append('check_in_text', String(options.checkInText));
    formData.append('processing_mode', options.processingMode);

    // Track upload progress
    const response = await api.post<AnalysisResults>('/analyze', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 50) / progressEvent.total);
          onProgress?.(progress, 'Uploading documents...');
        }
      },
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = 50 + Math.round((progressEvent.loaded * 50) / progressEvent.total);
          onProgress?.(progress, 'Processing results...');
        }
      },
    });

    return response.data;
  }
}

export const apiService = new ApiService();