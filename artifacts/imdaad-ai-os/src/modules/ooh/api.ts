import { fallbackOOHBootstrap } from './seedData';
import type {
  OOHAsset,
  OOHBootstrap,
  OOHClientEvidencePage,
  OOHClientPagePayload,
  OOHSubmission,
  OOHSurveyAssignment,
} from './types';

interface StoreEnvelope<T> {
  ok: boolean;
  store: OOHBootstrap;
  asset?: OOHAsset;
  assignment?: OOHSurveyAssignment;
  submission?: OOHSubmission;
  page?: OOHClientEvidencePage;
  error?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('The OOH API returned a non-JSON response.');
  }
  const payload = await response.json() as T;
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload ? String((payload as { error?: unknown }).error) : 'The OOH API request failed.';
    throw new Error(message);
  }
  return payload;
}

function readLocalClientPage(token: string): OOHClientPagePayload | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`ooh-client-page:${token}`);
    if (!raw) return null;
    return JSON.parse(raw) as OOHClientPagePayload;
  } catch {
    return null;
  }
}

export async function fetchOOHBootstrap(): Promise<OOHBootstrap> {
  try {
    const response = await fetch('/api/ooh/bootstrap');
    return await readJson<OOHBootstrap>(response);
  } catch {
    return fallbackOOHBootstrap;
  }
}

export async function createOOHAsset(asset: Partial<OOHAsset>): Promise<OOHBootstrap> {
  const response = await fetch('/api/ooh/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(asset),
  });
  return (await readJson<StoreEnvelope<OOHAsset>>(response)).store;
}

export async function updateOOHAsset(assetId: string, asset: Partial<OOHAsset>): Promise<OOHBootstrap> {
  const response = await fetch(`/api/ooh/assets/${encodeURIComponent(assetId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(asset),
  });
  return (await readJson<StoreEnvelope<OOHAsset>>(response)).store;
}

export async function createOOHAssignment(assignment: Partial<OOHSurveyAssignment>): Promise<OOHBootstrap> {
  const response = await fetch('/api/ooh/survey-assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(assignment),
  });
  return (await readJson<StoreEnvelope<OOHSurveyAssignment>>(response)).store;
}

export async function submitOOHSurvey(assignmentId: string, submission: Partial<OOHSubmission>): Promise<OOHBootstrap> {
  const response = await fetch(`/api/ooh/survey-assignments/${encodeURIComponent(assignmentId)}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submission),
  });
  return (await readJson<StoreEnvelope<OOHSubmission>>(response)).store;
}

export async function reviewOOHSubmission(submissionId: string, review: Partial<OOHSubmission>): Promise<OOHBootstrap> {
  const response = await fetch(`/api/ooh/submissions/${encodeURIComponent(submissionId)}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(review),
  });
  return (await readJson<StoreEnvelope<OOHSubmission>>(response)).store;
}

export async function createOOHClientPage(page: Partial<OOHClientEvidencePage>): Promise<OOHBootstrap> {
  const response = await fetch('/api/ooh/client-pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(page),
  });
  return (await readJson<StoreEnvelope<OOHClientEvidencePage>>(response)).store;
}

export async function fetchOOHClientPage(token: string): Promise<OOHClientPagePayload> {
  try {
    const response = await fetch(`/api/ooh/client-pages/${encodeURIComponent(token)}`);
    return await readJson<OOHClientPagePayload>(response);
  } catch {
    const localPage = readLocalClientPage(token);
    if (localPage) return localPage;
    const page = fallbackOOHBootstrap.clientPages.find(item => item.token === token) ?? fallbackOOHBootstrap.clientPages[0];
    return {
      page,
      assets: fallbackOOHBootstrap.assets.filter(asset => page.assetIds.includes(asset.id)),
      submissions: fallbackOOHBootstrap.submissions.filter(submission => page.assetIds.includes(submission.assetId)),
    };
  }
}
