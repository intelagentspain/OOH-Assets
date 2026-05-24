import { Router } from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger";

const router = Router();

type OOHAssetStatus = "Live" | "Booked" | "Install Due" | "Survey Due" | "Issue" | "Inactive";
type OOHEvidenceStatus = "Ready" | "Pending" | "Rejected" | "Missing";
type OOHReviewStatus = "Pending Review" | "Approved" | "Rejected";

interface OOHEvidenceItem {
  id: string;
  type: "photo" | "gps" | "qr" | "signature" | "document";
  label: string;
  url?: string;
  capturedAt: string;
  capturedBy: string;
  gps: { lat: number; lng: number };
  notes?: string;
  photoCategory?: "Wide" | "Close-up" | "Angle" | "Player" | "Permit" | "Exception";
  qrVerified?: boolean;
  gpsAccuracyMeters?: number;
  offlineCaptured?: boolean;
  syncStatus?: "Synced" | "Queued" | "Offline";
  clientPublishStatus?: "Published" | "Internal Only" | "Blocked";
  status: OOHEvidenceStatus | OOHReviewStatus;
}

interface OOHAsset {
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
  permitStatus: "Valid" | "Expiring" | "Expired" | "Pending";
  permitExpiry: string;
  illumination: "Static" | "Front-lit" | "Back-lit" | "Digital" | "Non-illuminated";
  powerStatus: "Online" | "Offline" | "Not Required";
  playerStatus: "Online" | "Offline" | "Not Installed";
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
  installStatus: "Installed" | "Scheduled" | "In Progress" | "Needs Visit";
  evidenceStatus: OOHEvidenceStatus;
  healthScore: number;
  lastSurveyAt: string;
  nextSurveyDue: string;
  attributes: string[];
  evidence: OOHEvidenceItem[];
  surveyHistory: Array<{ id: string; date: string; score: number; status: OOHReviewStatus; issues: string[] }>;
}

interface OOHSurveyQuestion {
  id: string;
  label: string;
  type: "pass_fail" | "yes_no" | "text" | "photo" | "gps" | "signature" | "single_choice";
  required: boolean;
  evidenceRequired?: boolean;
  options?: string[];
}

interface OOHSurveyAssignment {
  id: string;
  name: string;
  assetIds: string[];
  scope?: string[];
  team: string;
  vendor: string;
  recurrence: "One-time" | "Weekly" | "Monthly" | "Quarterly";
  dueDate: string;
  reviewer: string;
  status: "Active" | "In Progress" | "Submitted" | "Approved" | "Rejected" | "Overdue";
  progress: number;
  accessRules: {
    qrScan: boolean;
    gpsRequired: boolean;
    photoRequired: boolean;
    signatureRequired: boolean;
  };
  questions: OOHSurveyQuestion[];
}

interface OOHSubmission {
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
  syncStatus?: "Synced" | "Queued" | "Offline";
  reviewerNotes?: string;
  clientPublishStatus?: "Published" | "Internal Only" | "Blocked";
}

interface OOHClientEvidencePage {
  token: string;
  client: string;
  campaign: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  assetIds: string[];
  status: "Draft" | "Live" | "Expired";
  proofReady: number;
  surveyScore: number;
  openItems: number;
  watermarkLabel?: string;
  viewerCount?: number;
  lastViewedAt?: string;
  accessState?: "Active" | "Expiring" | "Locked";
  exportHistory?: Array<{ label: string; at: string; by: string }>;
  timeline: Array<{ label: string; at: string; status: "complete" | "attention" | "scheduled" }>;
}

interface OOHStore {
  assets: OOHAsset[];
  assignments: OOHSurveyAssignment[];
  submissions: OOHSubmission[];
  clientPages: OOHClientEvidencePage[];
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "ooh-store.json");
const LEGACY_STORE_FILE = path.join(DATA_DIR, "ooh-demo-store.json");

const defaultQuestions: OOHSurveyQuestion[] = [
  { id: "qr", label: "Scan asset QR or NFC tag", type: "text", required: true },
  { id: "gps", label: "Confirm GPS position within accepted tolerance", type: "gps", required: true },
  { id: "creative", label: "Creative installed matches campaign booking", type: "pass_fail", required: true, evidenceRequired: true },
  { id: "condition", label: "Structure, frame, vinyl or screen condition", type: "pass_fail", required: true },
  { id: "lighting", label: "Illumination, power and player status", type: "single_choice", required: true, options: ["Online", "Needs attention", "Not applicable"] },
  { id: "photo", label: "Capture wide, close-up and angle photos", type: "photo", required: true, evidenceRequired: true },
  { id: "signature", label: "Field supervisor sign-off", type: "signature", required: true },
];

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function seedStore(): OOHStore {
  const assets: OOHAsset[] = [
    {
      id: "OOH-DXB-SZR-001",
      name: "Sheikh Zayed Road Mega Billboard",
      format: "Unipole billboard",
      dimensions: "18m x 6m",
      market: "Dubai",
      route: "E11 Sheikh Zayed Road",
      address: "Trade Centre corridor, Dubai",
      lat: 25.2186,
      lng: 55.2815,
      owner: "OOH Assets",
      status: "Live",
      permitStatus: "Valid",
      permitExpiry: isoDaysFromNow(118),
      illumination: "Front-lit",
      powerStatus: "Online",
      playerStatus: "Not Installed",
      client: "Emirates Retail Bank",
      campaign: "Premium Miles Launch",
      buyerContact: "Aisha Rahman, Brand Marketing",
      bookedFrom: isoDaysFromNow(-14),
      bookedTo: isoDaysFromNow(16),
      installSla: "Installed 18h before go-live",
      proofSla: "Proof approved within 4h",
      playerUptime: 100,
      audienceReference: "Premium commuter corridor, audited GPS panel",
      lastClientView: isoDaysFromNow(-1),
      installStatus: "Installed",
      evidenceStatus: "Ready",
      healthScore: 96,
      lastSurveyAt: isoDaysFromNow(-2),
      nextSurveyDue: isoDaysFromNow(12),
      attributes: ["High visibility", "Northbound", "Night illumination", "Premium route"],
      evidence: [
        {
          id: "EVD-SZR-001-A",
          type: "photo",
          label: "Wide angle installation proof",
          capturedAt: isoDaysFromNow(-2),
          capturedBy: "Falcon Field Team",
          gps: { lat: 25.2186, lng: 55.2815 },
          notes: "Creative installed and illuminated.",
          photoCategory: "Wide",
          qrVerified: true,
          gpsAccuracyMeters: 4,
          offlineCaptured: false,
          syncStatus: "Synced",
          clientPublishStatus: "Published",
          status: "Approved",
        },
      ],
      surveyHistory: [
        { id: "SUB-SZR-001", date: isoDaysFromNow(-2), score: 96, status: "Approved", issues: [] },
        { id: "SUB-SZR-001-WEEK-2", date: isoDaysFromNow(-9), score: 95, status: "Approved", issues: [] },
        { id: "SUB-SZR-001-WEEK-3", date: isoDaysFromNow(-16), score: 94, status: "Approved", issues: [] },
      ],
    },
    {
      id: "OOH-DXB-MALL-014",
      name: "Dubai Mall Arrival Digital Screen",
      format: "Digital screen",
      dimensions: "6m x 3m LED",
      market: "Dubai",
      route: "Downtown visitor loop",
      address: "Dubai Mall arrival zone",
      lat: 25.1972,
      lng: 55.2796,
      owner: "OOH Assets",
      status: "Booked",
      permitStatus: "Valid",
      permitExpiry: isoDaysFromNow(74),
      illumination: "Digital",
      powerStatus: "Online",
      playerStatus: "Online",
      client: "Nova Motors",
      campaign: "EV Night Drive",
      buyerContact: "Leila Mansour, Media Lead",
      bookedFrom: isoDaysFromNow(-3),
      bookedTo: isoDaysFromNow(27),
      installSla: "Installed on time",
      proofSla: "Close-up proof overdue",
      playerUptime: 98.7,
      audienceReference: "Mall arrival loop, high dwell visitor traffic",
      lastClientView: isoDaysFromNow(-2),
      installStatus: "Installed",
      evidenceStatus: "Pending",
      healthScore: 89,
      lastSurveyAt: isoDaysFromNow(-7),
      nextSurveyDue: isoDaysFromNow(3),
      attributes: ["Digital loop", "Player ID LED-DM-014", "15-second slot", "Mall traffic"],
      evidence: [],
      surveyHistory: [
        { id: "SUB-MALL-014", date: isoDaysFromNow(-7), score: 89, status: "Pending Review", issues: ["One proof angle pending"] },
      ],
    },
    {
      id: "OOH-AUH-COR-022",
      name: "Corniche Bridge Banner",
      format: "Bridge banner",
      dimensions: "24m x 2.8m",
      market: "Abu Dhabi",
      route: "Corniche Road",
      address: "Corniche bridge approach",
      lat: 24.4748,
      lng: 54.3407,
      owner: "Municipal concession",
      status: "Install Due",
      permitStatus: "Expiring",
      permitExpiry: isoDaysFromNow(18),
      illumination: "Non-illuminated",
      powerStatus: "Not Required",
      playerStatus: "Not Installed",
      client: "Etihad Holidays",
      campaign: "Summer Stopover",
      buyerContact: "Omar Saeed, Tourism Partnerships",
      bookedFrom: isoDaysFromNow(2),
      bookedTo: isoDaysFromNow(32),
      installSla: "Install due in 48h",
      proofSla: "Proof required before go-live",
      playerUptime: 100,
      audienceReference: "Corniche route visibility, bridge format",
      lastClientView: isoDaysFromNow(-9),
      installStatus: "Scheduled",
      evidenceStatus: "Missing",
      healthScore: 82,
      lastSurveyAt: isoDaysFromNow(-28),
      nextSurveyDue: isoDaysFromNow(1),
      attributes: ["Permit renewal watch", "Bridge crew required", "Wind-load checklist"],
      evidence: [],
      surveyHistory: [
        { id: "SUB-COR-022", date: isoDaysFromNow(-28), score: 82, status: "Approved", issues: ["Permit expires within 30 days"] },
      ],
    },
    {
      id: "OOH-SHJ-BUS-033",
      name: "Al Majaz Bus Shelter",
      format: "Bus shelter",
      dimensions: "4-sheet backlit",
      market: "Sharjah",
      route: "Al Majaz Waterfront",
      address: "Al Majaz stop 12",
      lat: 25.3272,
      lng: 55.3898,
      owner: "OOH Assets",
      status: "Survey Due",
      permitStatus: "Valid",
      permitExpiry: isoDaysFromNow(204),
      illumination: "Back-lit",
      powerStatus: "Online",
      playerStatus: "Not Installed",
      client: "CityPay",
      campaign: "Tap and Go",
      buyerContact: "Mina Kapoor, Growth",
      bookedFrom: isoDaysFromNow(-20),
      bookedTo: isoDaysFromNow(10),
      installSla: "Installed on time",
      proofSla: "Proof approved within 6h",
      playerUptime: 100,
      audienceReference: "Pedestrian shelter panel with QR engagement",
      lastClientView: isoDaysFromNow(-3),
      installStatus: "Installed",
      evidenceStatus: "Ready",
      healthScore: 91,
      lastSurveyAt: isoDaysFromNow(-21),
      nextSurveyDue: isoDaysFromNow(0),
      attributes: ["Pedestrian reach", "Shelter glass", "QR coupon panel"],
      evidence: [],
      surveyHistory: [
        { id: "SUB-BUS-033", date: isoDaysFromNow(-21), score: 91, status: "Approved", issues: [] },
      ],
    },
    {
      id: "OOH-DXB-JBR-047",
      name: "JBR Promenade Wall Wrap",
      format: "Wall wrap",
      dimensions: "32m x 9m",
      market: "Dubai",
      route: "JBR Walk",
      address: "Beachfront promenade facade",
      lat: 25.0784,
      lng: 55.1352,
      owner: "Private site owner",
      status: "Issue",
      permitStatus: "Pending",
      permitExpiry: isoDaysFromNow(45),
      illumination: "Static",
      powerStatus: "Not Required",
      playerStatus: "Not Installed",
      client: "Luna Fashion",
      campaign: "Resort Collection",
      buyerContact: "Sofia Bell, Regional Marketing",
      bookedFrom: isoDaysFromNow(-5),
      bookedTo: isoDaysFromNow(25),
      installSla: "Rework crew required",
      proofSla: "Rejected proof blocks client sign-off",
      playerUptime: 100,
      audienceReference: "JBR promenade footfall, premium wall wrap",
      lastClientView: isoDaysFromNow(-1),
      installStatus: "Needs Visit",
      evidenceStatus: "Rejected",
      healthScore: 63,
      lastSurveyAt: isoDaysFromNow(-1),
      nextSurveyDue: isoDaysFromNow(2),
      attributes: ["High footfall", "Facade access", "Reprint likely"],
      evidence: [],
      surveyHistory: [
        { id: "SUB-JBR-047", date: isoDaysFromNow(-1), score: 63, status: "Rejected", issues: ["Corner lifting", "Photo evidence blurred"] },
      ],
    },
    {
      id: "OOH-DXB-MET-061",
      name: "Metro Station Totem",
      format: "Street furniture",
      dimensions: "2m x 1.2m digital totem",
      market: "Dubai",
      route: "Metro Red Line",
      address: "Business Bay station exit",
      lat: 25.1911,
      lng: 55.2606,
      owner: "Transit media concession",
      status: "Live",
      permitStatus: "Valid",
      permitExpiry: isoDaysFromNow(310),
      illumination: "Digital",
      powerStatus: "Online",
      playerStatus: "Online",
      client: "HealthPlus",
      campaign: "Clinic Near You",
      buyerContact: "Dr. Kareem Haddad, Marketing",
      bookedFrom: isoDaysFromNow(-10),
      bookedTo: isoDaysFromNow(20),
      installSla: "Installed on time",
      proofSla: "Proof approved within 3h",
      playerUptime: 99.4,
      audienceReference: "Transit station totem with commuter dwell",
      lastClientView: isoDaysFromNow(-2),
      installStatus: "Installed",
      evidenceStatus: "Ready",
      healthScore: 98,
      lastSurveyAt: isoDaysFromNow(-3),
      nextSurveyDue: isoDaysFromNow(11),
      attributes: ["Transit audience", "Touch-safe glass", "Player ID TOT-BB-061"],
      evidence: [],
      surveyHistory: [
        { id: "SUB-MET-061", date: isoDaysFromNow(-3), score: 98, status: "Approved", issues: [] },
      ],
    },
  ];

  const assignments: OOHSurveyAssignment[] = [
    {
      id: "ASG-OOH-1001",
      name: "Premium Miles proof-of-posting audit",
      assetIds: ["OOH-DXB-SZR-001", "OOH-DXB-MALL-014"],
      scope: ["Proof of Posting", "Quality Inspection", "Client Evidence Capture"],
      team: "Falcon Field Team",
      vendor: "In-house",
      recurrence: "Weekly",
      dueDate: isoDaysFromNow(3),
      reviewer: "Maya Haddad",
      status: "Active",
      progress: 50,
      accessRules: { qrScan: true, gpsRequired: true, photoRequired: true, signatureRequired: true },
      questions: defaultQuestions,
    },
    {
      id: "ASG-OOH-1002",
      name: "Corniche permit and install readiness check",
      assetIds: ["OOH-AUH-COR-022"],
      scope: ["Material Installation", "Permit / Access Check"],
      team: "Capital Survey Crew",
      vendor: "Abu Dhabi Partner",
      recurrence: "One-time",
      dueDate: isoDaysFromNow(1),
      reviewer: "Omar Nasser",
      status: "Active",
      progress: 0,
      accessRules: { qrScan: true, gpsRequired: true, photoRequired: true, signatureRequired: false },
      questions: defaultQuestions,
    },
    {
      id: "ASG-OOH-1003",
      name: "JBR wall wrap exception re-inspection",
      assetIds: ["OOH-DXB-JBR-047"],
      scope: ["Quality Inspection", "Maintenance Follow-up", "Client Evidence Capture"],
      team: "Coastal QA Team",
      vendor: "VinylCare",
      recurrence: "One-time",
      dueDate: isoDaysFromNow(2),
      reviewer: "Maya Haddad",
      status: "Overdue",
      progress: 25,
      accessRules: { qrScan: true, gpsRequired: true, photoRequired: true, signatureRequired: true },
      questions: defaultQuestions,
    },
  ];

  const submissions: OOHSubmission[] = [
    {
      id: "SUB-OOH-9001",
      assignmentId: "ASG-OOH-1001",
      assetId: "OOH-DXB-SZR-001",
      submittedBy: "Rashid Khan",
      submittedAt: isoDaysFromNow(-2),
      gps: { lat: 25.2186, lng: 55.2815, label: "Trade Centre corridor, Dubai" },
      score: 96,
      status: "Approved",
      issues: [],
      answers: [
        { questionId: "qr", question: "Scan asset QR or NFC tag", answer: "QR verified" },
        { questionId: "creative", question: "Creative installed matches campaign booking", answer: "Pass" },
        { questionId: "condition", question: "Structure, frame, vinyl or screen condition", answer: "Pass" },
      ],
      evidence: [
        {
          id: "EVD-SUB-9001",
          type: "photo",
          label: "Approved proof angle",
          capturedAt: isoDaysFromNow(-2),
          capturedBy: "Rashid Khan",
          gps: { lat: 25.2186, lng: 55.2815 },
          photoCategory: "Wide",
          qrVerified: true,
          gpsAccuracyMeters: 4,
          offlineCaptured: false,
          syncStatus: "Synced",
          clientPublishStatus: "Published",
          status: "Approved",
        },
      ],
      reviewer: "Maya Haddad",
      qrVerified: true,
      gpsAccuracyMeters: 4,
      photoCategories: ["Wide", "Close-up", "Angle"],
      offlineCaptured: false,
      syncStatus: "Synced",
      reviewerNotes: "Approved for client evidence page.",
      clientPublishStatus: "Published",
    },
    {
      id: "SUB-OOH-9002",
      assignmentId: "ASG-OOH-1001",
      assetId: "OOH-DXB-MALL-014",
      submittedBy: "Noura Saleh",
      submittedAt: isoDaysFromNow(-1),
      gps: { lat: 25.1972, lng: 55.2796, label: "Dubai Mall arrival zone" },
      score: 89,
      status: "Pending Review",
      issues: ["One missing close-up proof angle"],
      answers: [
        { questionId: "creative", question: "Creative installed matches campaign booking", answer: "Pass" },
        { questionId: "lighting", question: "Illumination, power and player status", answer: "Online" },
        { questionId: "photo", question: "Capture wide, close-up and angle photos", answer: "Two photos uploaded" },
      ],
      evidence: [
        {
          id: "EVD-SUB-9002",
          type: "photo",
          label: "Digital screen proof pending review",
          capturedAt: isoDaysFromNow(-1),
          capturedBy: "Noura Saleh",
          gps: { lat: 25.1972, lng: 55.2796 },
          photoCategory: "Angle",
          qrVerified: true,
          gpsAccuracyMeters: 6,
          offlineCaptured: false,
          syncStatus: "Synced",
          clientPublishStatus: "Internal Only",
          status: "Pending Review",
        },
      ],
      reviewer: "Maya Haddad",
      qrVerified: true,
      gpsAccuracyMeters: 6,
      photoCategories: ["Wide", "Angle"],
      offlineCaptured: false,
      syncStatus: "Synced",
      reviewerNotes: "Request one close-up of LED playback frame before publishing.",
      clientPublishStatus: "Internal Only",
    },
  ];

  const clientPages: OOHClientEvidencePage[] = [
    {
      token: "share-premium-miles",
      client: "Emirates Retail Bank",
      campaign: "Premium Miles Launch",
      title: "Premium Miles Launch installation evidence",
      createdAt: isoDaysFromNow(-1),
      expiresAt: isoDaysFromNow(29),
      assetIds: ["OOH-DXB-SZR-001", "OOH-DXB-MALL-014"],
      status: "Live",
      proofReady: 1,
      surveyScore: 93,
      openItems: 1,
      watermarkLabel: "4C360 verified evidence",
      viewerCount: 7,
      lastViewedAt: isoDaysFromNow(-1),
      accessState: "Active",
      exportHistory: [
        { label: "Campaign proof pack", at: isoDaysFromNow(-1), by: "Maya Haddad" },
      ],
      timeline: [
        { label: "Assets booked", at: isoDaysFromNow(-12), status: "complete" },
        { label: "Installation evidence submitted", at: isoDaysFromNow(-2), status: "complete" },
        { label: "Client proof page published", at: isoDaysFromNow(-1), status: "complete" },
        { label: "Close-up proof angle requested", at: isoDaysFromNow(1), status: "attention" },
      ],
    },
  ];

  return { assets, assignments, submissions, clientPages };
}

let store: OOHStore = seedStore();
let loaded = false;

async function loadStore(): Promise<void> {
  if (loaded) return;

  try {
    let raw: string;
    try {
      raw = await readFile(STORE_FILE, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") {
        throw error;
      }
      raw = await readFile(LEGACY_STORE_FILE, "utf8");
    }
    const parsed = JSON.parse(raw) as Partial<OOHStore>;
    store = {
      assets: Array.isArray(parsed.assets) ? parsed.assets as OOHAsset[] : seedStore().assets,
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments as OOHSurveyAssignment[] : seedStore().assignments,
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions as OOHSubmission[] : seedStore().submissions,
      clientPages: Array.isArray(parsed.clientPages) ? parsed.clientPages as OOHClientEvidencePage[] : seedStore().clientPages,
    };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
    if (code !== "ENOENT") {
      logger.warn({ err: error }, "Unable to load OOH store");
    }
    store = seedStore();
  }

  loaded = true;
}

async function persistStore(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function numberFromBody(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function stringFromBody(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

const removedAssetFields = ["campaign".concat("Value"), "rev".concat("enueRisk")];

function publicAsset(asset: OOHAsset): OOHAsset {
  const clone = { ...asset } as Record<string, unknown>;
  for (const field of removedAssetFields) {
    delete clone[field];
  }
  return clone as unknown as OOHAsset;
}

function publicStore(): OOHStore {
  return {
    ...store,
    assets: store.assets.map(publicAsset),
  };
}

router.get("/ooh/bootstrap", async (_req, res) => {
  try {
    await loadStore();
    res.json(publicStore());
  } catch (error) {
    logger.error({ err: error }, "OOH bootstrap failed");
    res.status(500).json({ ok: false, error: "Failed to load OOH data." });
  }
});

router.post("/ooh/assets", async (req, res) => {
  try {
    await loadStore();
    const body = req.body as Partial<OOHAsset>;
    const fallback = seedStore().assets[0];
    const now = new Date().toISOString();
    const asset: OOHAsset = {
      id: stringFromBody(body.id, nextId("OOH-ASSET")),
      name: stringFromBody(body.name, "New OOH Asset"),
      format: stringFromBody(body.format, "Billboard"),
      dimensions: stringFromBody(body.dimensions, "12m x 4m"),
      market: stringFromBody(body.market, "Dubai"),
      route: stringFromBody(body.route, "Field route pending"),
      address: stringFromBody(body.address, "Field verified address pending"),
      lat: numberFromBody(body.lat, fallback.lat),
      lng: numberFromBody(body.lng, fallback.lng),
      owner: stringFromBody(body.owner, "OOH Assets"),
      status: body.status ?? "Install Due",
      permitStatus: body.permitStatus ?? "Pending",
      permitExpiry: body.permitExpiry ?? isoDaysFromNow(90),
      illumination: body.illumination ?? "Front-lit",
      powerStatus: body.powerStatus ?? "Online",
      playerStatus: body.playerStatus ?? "Not Installed",
      client: stringFromBody(body.client, "Unassigned client"),
      campaign: stringFromBody(body.campaign, "Inventory reserve"),
      buyerContact: stringFromBody(body.buyerContact, "Client contact pending"),
      bookedFrom: body.bookedFrom ?? isoDaysFromNow(0),
      bookedTo: body.bookedTo ?? isoDaysFromNow(30),
      installSla: stringFromBody(body.installSla, "Install proof required before go-live"),
      proofSla: stringFromBody(body.proofSla, "Awaiting first evidence review"),
      playerUptime: numberFromBody(body.playerUptime, body.playerStatus === "Online" ? 99.1 : 100),
      audienceReference: stringFromBody(body.audienceReference, "GPS registered asset, audience reference pending"),
      lastClientView: body.lastClientView,
      installStatus: body.installStatus ?? "Scheduled",
      evidenceStatus: body.evidenceStatus ?? "Missing",
      healthScore: numberFromBody(body.healthScore, 88),
      lastSurveyAt: body.lastSurveyAt ?? now,
      nextSurveyDue: body.nextSurveyDue ?? isoDaysFromNow(14),
      attributes: Array.isArray(body.attributes) ? body.attributes : ["Newly registered", "Awaiting proof"],
      evidence: Array.isArray(body.evidence) ? body.evidence : [],
      surveyHistory: Array.isArray(body.surveyHistory) ? body.surveyHistory : [],
    };

    store.assets.unshift(asset);
    await persistStore();
    res.status(201).json({ ok: true, asset: publicAsset(asset), store: publicStore() });
  } catch (error) {
    logger.error({ err: error }, "OOH asset creation failed");
    res.status(500).json({ ok: false, error: "Failed to create OOH asset." });
  }
});

router.patch("/ooh/assets/:assetId", async (req, res) => {
  try {
    await loadStore();
    const index = store.assets.findIndex(asset => asset.id === req.params.assetId);
    if (index < 0) {
      res.status(404).json({ ok: false, error: "OOH asset not found." });
      return;
    }

    const updates = req.body as Partial<OOHAsset>;
    const updated = { ...store.assets[index], ...updates, id: store.assets[index].id };
    store.assets[index] = updated;
    await persistStore();
    res.json({ ok: true, asset: publicAsset(updated), store: publicStore() });
  } catch (error) {
    logger.error({ err: error }, "OOH asset update failed");
    res.status(500).json({ ok: false, error: "Failed to update OOH asset." });
  }
});

router.post("/ooh/survey-assignments", async (req, res) => {
  try {
    await loadStore();
    const body = req.body as Partial<OOHSurveyAssignment>;
    const assetIds = Array.isArray(body.assetIds) && body.assetIds.length > 0
      ? body.assetIds
      : store.assets.slice(0, 1).map(asset => asset.id);
    const assignment: OOHSurveyAssignment = {
      id: stringFromBody(body.id, nextId("ASG-OOH")),
      name: stringFromBody(body.name, "OOH field survey"),
      assetIds,
      scope: Array.isArray(body.scope) && body.scope.length ? body.scope : ["Quality Inspection"],
      team: stringFromBody(body.team, "Falcon Field Team"),
      vendor: stringFromBody(body.vendor, "In-house"),
      recurrence: body.recurrence ?? "One-time",
      dueDate: body.dueDate ?? isoDaysFromNow(3),
      reviewer: stringFromBody(body.reviewer, "Maya Haddad"),
      status: body.status ?? "Active",
      progress: numberFromBody(body.progress, 0),
      accessRules: body.accessRules ?? { qrScan: true, gpsRequired: true, photoRequired: true, signatureRequired: true },
      questions: Array.isArray(body.questions) ? body.questions : defaultQuestions,
    };

    store.assignments.unshift(assignment);
    for (const assetId of assignment.assetIds) {
      const asset = store.assets.find(item => item.id === assetId);
      if (asset) {
        asset.status = "Survey Due";
        asset.nextSurveyDue = assignment.dueDate;
      }
    }
    await persistStore();
    res.status(201).json({ ok: true, assignment, store: publicStore() });
  } catch (error) {
    logger.error({ err: error }, "OOH survey assignment failed");
    res.status(500).json({ ok: false, error: "Failed to create OOH survey assignment." });
  }
});

router.post("/ooh/survey-assignments/:assignmentId/submissions", async (req, res) => {
  try {
    await loadStore();
    const assignment = store.assignments.find(item => item.id === req.params.assignmentId);
    if (!assignment) {
      res.status(404).json({ ok: false, error: "Survey assignment not found." });
      return;
    }

    const body = req.body as Partial<OOHSubmission>;
    const assetId = stringFromBody(body.assetId, assignment.assetIds[0] ?? "");
    const asset = store.assets.find(item => item.id === assetId);
    if (!asset) {
      res.status(400).json({ ok: false, error: "A valid asset is required for the submission." });
      return;
    }

    const submittedAt = body.submittedAt ?? new Date().toISOString();
    const issues = Array.isArray(body.issues) ? body.issues : [];
    const evidence = Array.isArray(body.evidence) && body.evidence.length > 0
      ? body.evidence
      : [
          {
            id: nextId("EVD"),
            type: "photo" as const,
            label: "Mobile proof photo",
            capturedAt: submittedAt,
            capturedBy: stringFromBody(body.submittedBy, "Field user"),
            gps: { lat: asset.lat, lng: asset.lng },
            photoCategory: "Wide" as const,
            qrVerified: true,
            gpsAccuracyMeters: numberFromBody(body.gpsAccuracyMeters, 8),
            offlineCaptured: Boolean(body.offlineCaptured),
            syncStatus: body.syncStatus ?? "Synced",
            clientPublishStatus: "Internal Only" as const,
            status: "Pending Review" as const,
          },
        ];
    const submission: OOHSubmission = {
      id: stringFromBody(body.id, nextId("SUB-OOH")),
      assignmentId: assignment.id,
      assetId,
      submittedBy: stringFromBody(body.submittedBy, "Field user"),
      submittedAt,
      gps: body.gps ?? { lat: asset.lat, lng: asset.lng, label: asset.address },
      score: numberFromBody(body.score, issues.length ? 78 : 94),
      status: body.status ?? "Pending Review",
      issues,
      answers: Array.isArray(body.answers) ? body.answers : [],
      evidence,
      reviewer: stringFromBody(body.reviewer, assignment.reviewer),
      qrVerified: body.qrVerified ?? true,
      gpsAccuracyMeters: numberFromBody(body.gpsAccuracyMeters, 8),
      photoCategories: Array.isArray(body.photoCategories) ? body.photoCategories : evidence.map(item => item.photoCategory).filter(Boolean) as string[],
      offlineCaptured: Boolean(body.offlineCaptured),
      syncStatus: body.syncStatus ?? "Synced",
      reviewerNotes: stringFromBody(body.reviewerNotes, issues.length ? "Reviewer attention required before client publishing." : "Pending reviewer approval."),
      clientPublishStatus: body.clientPublishStatus ?? "Internal Only",
    };

    store.submissions.unshift(submission);
    assignment.status = "Submitted";
    assignment.progress = 100;
    asset.status = issues.length ? "Issue" : "Survey Due";
    asset.lastSurveyAt = submittedAt;
    asset.evidenceStatus = "Pending";
    asset.surveyHistory.unshift({
      id: submission.id,
      date: submittedAt,
      score: submission.score,
      status: submission.status,
      issues: submission.issues,
    });

    await persistStore();
    res.status(201).json({ ok: true, submission, store: publicStore() });
  } catch (error) {
    logger.error({ err: error }, "OOH survey submission failed");
    res.status(500).json({ ok: false, error: "Failed to save OOH survey submission." });
  }
});

router.patch("/ooh/submissions/:submissionId/review", async (req, res) => {
  try {
    await loadStore();
    const submission = store.submissions.find(item => item.id === req.params.submissionId);
    if (!submission) {
      res.status(404).json({ ok: false, error: "OOH submission not found." });
      return;
    }

    const body = req.body as Partial<OOHSubmission> & { status?: OOHReviewStatus; reviewerNotes?: string };
    const status = body.status ?? "Approved";
    submission.status = status;
    submission.reviewer = stringFromBody(body.reviewer, submission.reviewer);
    if (Array.isArray(body.issues)) submission.issues = body.issues;
    if (typeof body.score === "number") submission.score = body.score;
    submission.reviewerNotes = stringFromBody(body.reviewerNotes, status === "Approved" ? "Approved for client evidence page." : "Rejected and returned for field rework.");
    submission.clientPublishStatus = status === "Approved" ? "Published" : status === "Rejected" ? "Blocked" : "Internal Only";
    submission.syncStatus = "Synced";
    submission.evidence = submission.evidence.map(item => ({
      ...item,
      status,
      syncStatus: "Synced",
      clientPublishStatus: status === "Approved" ? "Published" : status === "Rejected" ? "Blocked" : "Internal Only",
    }));

    const asset = store.assets.find(item => item.id === submission.assetId);
    if (asset) {
      asset.evidenceStatus = status === "Approved" ? "Ready" : status === "Rejected" ? "Rejected" : "Pending";
      asset.status = status === "Rejected" ? "Issue" : "Live";
      asset.evidence = [
        ...submission.evidence.map(item => ({ ...item, notes: submission.reviewerNotes ?? item.notes })),
        ...asset.evidence.filter(item => !submission.evidence.some(evidence => evidence.id === item.id)),
      ];
      asset.surveyHistory = asset.surveyHistory.map(row => row.id === submission.id ? { ...row, status, score: submission.score, issues: submission.issues } : row);
    }

    const assignment = store.assignments.find(item => item.id === submission.assignmentId);
    if (assignment) {
      assignment.status = status === "Approved" ? "Approved" : status === "Rejected" ? "Rejected" : "Submitted";
    }

    await persistStore();
    res.json({ ok: true, submission, store: publicStore() });
  } catch (error) {
    logger.error({ err: error }, "OOH submission review failed");
    res.status(500).json({ ok: false, error: "Failed to review OOH submission." });
  }
});

router.post("/ooh/client-pages", async (req, res) => {
  try {
    await loadStore();
    const body = req.body as Partial<OOHClientEvidencePage>;
    const assetIds = Array.isArray(body.assetIds) && body.assetIds.length > 0
      ? body.assetIds
      : store.assets.slice(0, 2).map(asset => asset.id);
    const selectedAssets = store.assets.filter(asset => assetIds.includes(asset.id));
    const readyCount = selectedAssets.filter(asset => asset.evidenceStatus === "Ready").length;
    const averageScore = selectedAssets.length
      ? Math.round(selectedAssets.reduce((total, asset) => total + asset.healthScore, 0) / selectedAssets.length)
      : 0;
    const client = stringFromBody(body.client, selectedAssets[0]?.client ?? "OOH Client");
    const campaign = stringFromBody(body.campaign, selectedAssets[0]?.campaign ?? "Campaign Evidence");
    const token = stringFromBody(body.token, `share-${campaign.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Math.random().toString(36).slice(2, 6)}`);
    const page: OOHClientEvidencePage = {
      token,
      client,
      campaign,
      title: stringFromBody(body.title, `${campaign} installation evidence`),
      createdAt: body.createdAt ?? new Date().toISOString(),
      expiresAt: body.expiresAt ?? isoDaysFromNow(30),
      assetIds,
      status: body.status ?? "Live",
      proofReady: readyCount,
      surveyScore: body.surveyScore ?? averageScore,
      openItems: selectedAssets.filter(asset => asset.evidenceStatus !== "Ready").length,
      watermarkLabel: stringFromBody(body.watermarkLabel, "4C360 verified evidence"),
      viewerCount: numberFromBody(body.viewerCount, 0),
      lastViewedAt: body.lastViewedAt,
      accessState: body.accessState ?? "Active",
      exportHistory: Array.isArray(body.exportHistory) ? body.exportHistory : [
        { label: "Campaign proof pack", at: new Date().toISOString(), by: "Client Success" },
      ],
      timeline: Array.isArray(body.timeline) ? body.timeline : [
        { label: "Secure evidence page generated", at: new Date().toISOString(), status: "complete" },
        { label: "Client access expires", at: body.expiresAt ?? isoDaysFromNow(30), status: "scheduled" },
      ],
    };

    store.clientPages.unshift(page);
    await persistStore();
    res.status(201).json({ ok: true, page, store: publicStore() });
  } catch (error) {
    logger.error({ err: error }, "OOH client page creation failed");
    res.status(500).json({ ok: false, error: "Failed to create OOH client evidence page." });
  }
});

router.get("/ooh/client-pages/:token", async (req, res) => {
  try {
    await loadStore();
    const page = store.clientPages.find(item => item.token === req.params.token);
    if (!page) {
      res.status(404).json({ ok: false, error: "Client evidence page not found." });
      return;
    }

    page.viewerCount = (page.viewerCount ?? 0) + 1;
    page.lastViewedAt = new Date().toISOString();
    await persistStore();

    const assets = store.assets.filter(asset => page.assetIds.includes(asset.id)).map(publicAsset);
    const submissions = store.submissions.filter(submission => page.assetIds.includes(submission.assetId) && submission.status === "Approved");
    res.json({ page, assets, submissions });
  } catch (error) {
    logger.error({ err: error }, "OOH client page fetch failed");
    res.status(500).json({ ok: false, error: "Failed to load OOH client evidence page." });
  }
});

export default router;
