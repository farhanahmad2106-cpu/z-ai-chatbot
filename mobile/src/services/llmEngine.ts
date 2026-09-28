import { InferenceRequest, InferenceResponse } from '../api/types';

export interface InferenceCapabilities {
  text: boolean;
  vision: boolean;
  maxContextTokens?: number;
  estimatedMemoryMb?: number;
}

export interface LocalInferenceEngine {
  isAvailable(): Promise<boolean>;
  getCapabilities(): Promise<InferenceCapabilities>;
  generate(request: InferenceRequest): Promise<InferenceResponse>;
}

export type InferenceMode = "local" | "remote" | "hybrid";
