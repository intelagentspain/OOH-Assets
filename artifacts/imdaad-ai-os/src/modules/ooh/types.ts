export type OOHAssetStatus = 'Live' | 'Booked' | 'Install Due' | 'Survey Due' | 'Issue' | 'Inactive';
export type OOHEvidenceStatus = 'Ready' | 'Pending' | 'Rejected' | 'Missing';
export type OOHReviewStatus = 'Pending Review' | 'Approved' | 'Rejected';

export interface OOHEvidenceItem {
  id: string;
  type: 'photo' | 'gps' | 'qr' | 'signature' | 'document';
  label: string;
  url?: string;
  capturedAt: string;
  capturedBy: string;
  gps: { lat: number; lng: number };
  notes?: string;
  photoCategory?: 'Wide' | 'Close-up' | 'Angle' | 'Player' | 'Permit' | 'Exception';
  qrVerified?: boolean;
  gpsAccuracyMeters?: number;
  offlineCaptured?: boolean;
  syncStatus?: 'Synced' | 'Queued' | 'Offline';
  clientPublishStatus?: 'Published' | 'Internal Only' | 'Blocked';
  status: OOHEvidenceStatus | OOHReviewStatus;
}

export interface OOHAsset {
  id: string;
  name: string;
  format: string;
  dimensions: string;
  market: string;
  route: string;
  address: string;
  lat: number;
  lng: number;
  owner: string;
  status: OOHAssetStatus;
  permitStatus: 'Valid' | 'Expiring' | 'Expired' | 'Pending';
  permitExpiry: string;
  illumination: 'Static' | 'Front-lit' | 'Back-lit' | 'Digital' | 'Non-illuminated';
  powerStatus: 'Online' | 'Offline' | 'Not Required';
  playerStatus: 'Online' | 'Offline' | 'Not Installed';
  client: string;
  campaign: string;
  buyerContact?: string;
  bookedFrom?: string;
  bookedTo?: string;
  installSla?: string;
  proofSla?: string;
  playerUptime?: number;
  audienceReference?: string;
  lastClientView?: string;
  installStatus: 'Installed' | 'Scheduled' | 'In Progress' | 'Needs Visit';
  evidenceStatus: OOHEvidenceStatus;
  healthScore: number;
  lastSurveyAt: string;
  nextSurveyDue: string;
  attributes: string[];
  evidence: OOHEvidenceItem[];
  surveyHistory: Array<{ id: string; date: string; score: number; status: OOHReviewStatus; issues: string[] }>;
}

export interface OOHSurveyQuestion {
  id: string;
  label: string;
  type: 'pass_fail' | 'yes_no' | 'text' | 'photo' | 'gps' | 'signature' | 'single_choice';
  required: boolean;
  evidenceRequired?: boolean;
  options?: string[];
}

export interface OOHSurveyAssignment {
  id: string;
  name: string;
  assetIds: string[];
  scope?: string[];
  team: string;
  vendor: string;
  recurrence: 'One-time' | 'Weekly' | 'Monthly' | 'Quarterly';
  dueDate: string;
  reviewer: string;
  status: 'Active' | 'In Progress' | 'Submitted' | 'Approved' | 'Rejected' | 'Overdue';
  progress: number;
  accessRules: {
    qrScan: boolean;
    gpsRequired: boolean;
    photoRequired: boolean;
    signatureRequired: boolean;
  };
  questions: OOHSurveyQuestion[];
}

export interface OOHSubmission {
  id: string;
  assignmentId: string;
  assetId: string;
  submittedBy: string;
  submittedAt: string;
  gps: { lat: number; lng: number; label: string };
  score: number;
  status: OOHReviewStatus;
  issues: string[];
  answers: Array<{ questionId: string; question: string; answer: string }>;
  evidence: OOHEvidenceItem[];
  reviewer: string;
  qrVerified?: boolean;
  gpsAccuracyMeters?: number;
  photoCategories?: string[];
  offlineCaptured?: boolean;
  syncStatus?: 'Synced' | 'Queued' | 'Offline';
  reviewerNotes?: string;
  clientPublishStatus?: 'Published' | 'Internal Only' | 'Blocked';
}

export interface OOHClientEvidencePage {
  token: string;
  client: string;
  campaign: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  assetIds: string[];
  status: 'Draft' | 'Live' | 'Expired';
  proofReady: number;
  surveyScore: number;
  openItems: number;
  watermarkLabel?: string;
  viewerCount?: number;
  lastViewedAt?: string;
  accessState?: 'Active' | 'Expiring' | 'Locked';
  exportHistory?: Array<{ label: string; at: string; by: string }>;
  timeline: Array<{ label: string; at: string; status: 'complete' | 'attention' | 'scheduled' }>;
}

export interface OOHBootstrap {
  assets: OOHAsset[];
  assignments: OOHSurveyAssignment[];
  submissions: OOHSubmission[];
  clientPages: OOHClientEvidencePage[];
}

export interface OOHClientPagePayload {
  page: OOHClientEvidencePage;
  assets: OOHAsset[];
  submissions: OOHSubmission[];
}
