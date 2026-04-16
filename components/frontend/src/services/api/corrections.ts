/**
 * Corrections API service
 * Submits structured corrections on agent messages
 */

import { apiClient } from './client';

/** Correction types matching runner's CORRECTION_TYPES */
export type CorrectionType = 'incomplete' | 'incorrect' | 'out_of_scope' | 'style';

/** Request payload for submitting a correction */
export type SubmitCorrectionRequest = {
  correction_type: CorrectionType;
  user_correction: string;
  session_name: string;
  message_id: string;
  message_content?: string;
  source: 'user';
};

/** Response from the corrections endpoint */
export type SubmitCorrectionResponse = {
  message: string;
  status: string;
};

/**
 * Submit a structured correction for an agent message
 */
export async function submitCorrection(
  projectName: string,
  data: SubmitCorrectionRequest
): Promise<SubmitCorrectionResponse> {
  return apiClient.post<SubmitCorrectionResponse, SubmitCorrectionRequest>(
    `/projects/${projectName}/corrections`,
    data
  );
}
