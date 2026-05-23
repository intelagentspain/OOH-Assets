import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FileText,
  Filter,
  Globe2,
  Image,
  Layers3,
  Link2,
  MapPin,
  MonitorUp,
  Plus,
  QrCode,
  Search,
  Settings2,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  createOOHAsset,
  createOOHAssignment,
  createOOHClientPage,
  fetchOOHBootstrap,
  reviewOOHSubmission,
  updateOOHAsset,
} from './api';
import { fallbackOOHBootstrap, oohSurveyQuestions } from './seedData';
import { assetPreviewPhotoAlt, assetPreviewPhotoSrc, evidencePhotoAlt, evidencePhotoObjectPosition, evidencePhotoSrc } from './evidenceVisual';
import type { OOHEvidenceItem, OOHAsset, OOHBootstrap, OOHReviewStatus, OOHSubmission } from './types';

type OOHTab = 'Command' | 'Assets' | 'GIS' | 'Surveys' | 'Evidence' | 'Clients' | 'Work Orders' | 'Obligations' | 'Vendors' | 'Settings' | 'Reports';

interface AssetForm {
  name: string;
  format: string;
  dimensions: string;
  market: string;
  route: string;
  address: string;
  lat: string;
  lng: string;
  frequency: string;
  network: string;
}

type AssetIntakeMode = 'choice' | 'single' | 'bulk';

interface BulkAssetPreview extends AssetForm {
  rowNumber: number;
}

type CampaignWizardStep = 1 | 2 | 3;
type CampaignAssignmentMode = 'Create installation work order' | 'Create proof survey only' | 'Campaign booking only';

interface CampaignForm {
  assetId: string;
  campaign: string;
  client: string;
  buyerContact: string;
  bookedFrom: string;
  bookedTo: string;
  artworkTitle: string;
  artworkFile: string;
  artworkSpec: string;
  installOwner: string;
  installationDueDate: string;
  workOrderAssignment: CampaignAssignmentMode;
  installSla: string;
  proofSla: string;
}

interface CampaignArtworkUpload {
  name: string;
  type: string;
  sizeLabel: string;
  uploadedAt: string;
}

interface AssignmentForm {
  assetId: string;
  name: string;
  team: string;
  vendor: string;
  recurrence: 'One-time' | 'Weekly' | 'Monthly' | 'Quarterly';
  dueDate: string;
  reviewer: string;
}

type OOHReportId = 'campaign-evidence-pack' | 'permit-watchlist' | 'survey-scorecard' | 'network-inventory' | 'installation-sla' | 'client-access-log';

interface OOHReportCard {
  id: OOHReportId;
  title: string;
  text: string;
  icon: LucideIcon;
}

interface OOHGeneratedReport {
  id: OOHReportId;
  title: string;
  subtitle: string;
  generatedAt: string;
  summary: Array<{ label: string; value: string; helper: string }>;
  columns: string[];
  rows: string[][];
  narrative: string[];
  nextActions: string[];
}

interface OOHClientBookingRow {
  key: string;
  client: string;
  campaign: string;
  assets: OOHAsset[];
  primaryAsset: OOHAsset;
  bookedFrom: string;
  bookedTo: string;
  installState: string;
  proofState: string;
  openItems: number;
  page?: OOHBootstrap['clientPages'][number];
}

const tabs: Array<{ id: OOHTab; label: string; icon: typeof BarChart3 }> = [
  { id: 'Command', label: 'Command', icon: BarChart3 },
  { id: 'Assets', label: 'Assets', icon: Building2 },
  { id: 'GIS', label: 'GIS', icon: MapPin },
  { id: 'Surveys', label: 'Surveys', icon: ClipboardCheck },
  { id: 'Evidence', label: 'Evidence', icon: Camera },
  { id: 'Clients', label: 'Clients', icon: Globe2 },
  { id: 'Work Orders', label: 'Work Orders', icon: FileSearch },
  { id: 'Obligations', label: 'Obligations', icon: FileText },
  { id: 'Vendors', label: 'Vendor IQ', icon: ShieldCheck },
  { id: 'Settings', label: 'Settings', icon: Settings2 },
  { id: 'Reports', label: 'Reports', icon: FileCheck2 },
];

const oohTabPaths: Record<OOHTab, string> = {
  Command: '/ooh',
  Assets: '/ooh/assets',
  GIS: '/ooh/gis',
  Surveys: '/ooh/surveys',
  Evidence: '/ooh/evidence',
  Clients: '/ooh/clients',
  'Work Orders': '/ooh/workorders',
  Obligations: '/ooh/obligations',
  Vendors: '/ooh/vendorintelligence',
  Settings: '/ooh/settings',
  Reports: '/ooh/reports',
};

const assetFormatOptions = ['Unipole billboard', 'Digital screen', 'Bridge banner', 'Bus shelter', 'Wall wrap', 'Street furniture'];
const assetFrequencyOptions = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Other'];
const assetNetworkOptions = ['Dubai', 'Sharjah', 'Abu Dhabi', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];
const marketOptions = ['All markets', 'Dubai', 'Abu Dhabi', 'Sharjah'];
const recurrenceOptions: AssignmentForm['recurrence'][] = ['One-time', 'Weekly', 'Monthly', 'Quarterly'];
const defaultInstallationTeams = ['Falcon Field Team', 'Capital Survey Crew', 'Coastal QA Team', 'In-house Install Team', 'Certified Print Vendor'];
const reportCards: OOHReportCard[] = [
  { id: 'campaign-evidence-pack', title: 'Campaign Evidence Pack', text: 'Client-ready proof, maps, survey scores and exception notes.', icon: FileCheck2 },
  { id: 'permit-watchlist', title: 'Permit Watchlist', text: 'Expiry windows, municipal owner, route and access requirements.', icon: ShieldCheck },
  { id: 'survey-scorecard', title: 'Survey Scorecard', text: 'Recurring field survey trend, findings and reviewer status.', icon: BarChart3 },
  { id: 'network-inventory', title: 'Network Inventory Export', text: 'OOH asset register with GIS coordinates and attributes.', icon: Layers3 },
  { id: 'installation-sla', title: 'Installation SLA Report', text: 'Booked, installed, pending proof and rejected evidence.', icon: CalendarClock },
  { id: 'client-access-log', title: 'Client Access Log', text: 'Secure page state, expiry controls and shared campaigns.', icon: Users },
];

const integrationFeeds = [
  { name: 'ERP operations', source: 'Asset master and booking state', status: 'Synced', at: '4 min ago' },
  { name: 'CRM / buyer desk', source: 'Client contacts and campaign account', status: 'Synced', at: '8 min ago' },
  { name: 'Media booking', source: 'Campaign flights, formats and assets', status: 'Synced', at: '12 min ago' },
  { name: 'Player / ad-server', source: 'DOOH uptime and playback readiness', status: 'Attention', at: '18 min ago' },
  { name: 'Document repository', source: 'Permits, NOCs and proof packs', status: 'Synced', at: '21 min ago' },
];

const modernMapTiles = {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  subdomains: 'abcd',
  maxZoom: 20,
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function assetNeedsAction(asset: OOHAsset): boolean {
  return asset.status === 'Issue'
    || asset.evidenceStatus === 'Rejected'
    || asset.evidenceStatus === 'Missing'
    || asset.installStatus === 'Needs Visit'
    || asset.permitStatus === 'Expired'
    || asset.permitStatus === 'Pending';
}

function actionState(asset: OOHAsset): string {
  if (asset.evidenceStatus === 'Rejected') return 'Proof rework';
  if (asset.evidenceStatus === 'Missing') return 'Proof missing';
  if (asset.permitStatus === 'Pending' || asset.permitStatus === 'Expired') return 'Permit action';
  if (asset.installStatus === 'Needs Visit') return 'Field visit';
  if (asset.evidenceStatus === 'Pending') return 'Review pending';
  return 'Ready';
}

function assetFlight(asset: OOHAsset): string {
  if (!asset.bookedFrom || !asset.bookedTo) return 'Flight pending';
  return `${formatDate(asset.bookedFrom)} to ${formatDate(asset.bookedTo)}`;
}

function activeClientBookingAssets(assets: OOHAsset[]): OOHAsset[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return assets.filter(asset => {
    const client = asset.client.trim();
    const campaign = asset.campaign.trim();
    const bookedFrom = Date.parse(asset.bookedFrom ?? '');
    const bookedTo = Date.parse(asset.bookedTo ?? '');
    return Boolean(client)
      && !/unassigned/i.test(client)
      && Boolean(campaign)
      && !/network$/i.test(campaign)
      && Number.isFinite(bookedFrom)
      && Number.isFinite(bookedTo)
      && bookedTo >= today.getTime()
      && asset.status !== 'Inactive';
  });
}

function assetSetKey(assetIds: string[]): string {
  return [...assetIds].sort().join('|');
}

function clientPageMatchesBooking(page: OOHBootstrap['clientPages'][number], client: string, campaign: string, assetIds: string[]): boolean {
  if (page.client !== client || page.campaign !== campaign) return false;
  const pageAssetKey = assetSetKey(page.assetIds);
  const bookingAssetKey = assetSetKey(assetIds);
  if (pageAssetKey === bookingAssetKey) return true;
  return page.assetIds.some(assetId => assetIds.includes(assetId));
}

function buildClientBookingRows(assets: OOHAsset[], clientPages: OOHBootstrap['clientPages']): OOHClientBookingRow[] {
  const grouped = new Map<string, OOHAsset[]>();

  for (const asset of activeClientBookingAssets(assets)) {
    const key = `${asset.client.trim()}|||${asset.campaign.trim()}`;
    grouped.set(key, [...(grouped.get(key) ?? []), asset]);
  }

  return Array.from(grouped.entries()).map(([key, bookingAssets]) => {
    const [client, campaign] = key.split('|||');
    const sortedAssets = [...bookingAssets].sort((a, b) => Date.parse(a.bookedFrom ?? '') - Date.parse(b.bookedFrom ?? ''));
    const assetIds = sortedAssets.map(asset => asset.id);
    const page = clientPages
      .filter(candidate => clientPageMatchesBooking(candidate, client, campaign, assetIds))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    const bookedFrom = sortedAssets.reduce((earliest, asset) => {
      const current = Date.parse(asset.bookedFrom ?? '');
      const best = Date.parse(earliest);
      return Number.isFinite(current) && current < best ? asset.bookedFrom ?? earliest : earliest;
    }, sortedAssets[0]?.bookedFrom ?? '');
    const bookedTo = sortedAssets.reduce((latest, asset) => {
      const current = Date.parse(asset.bookedTo ?? '');
      const best = Date.parse(latest);
      return Number.isFinite(current) && current > best ? asset.bookedTo ?? latest : latest;
    }, sortedAssets[0]?.bookedTo ?? '');
    const installed = sortedAssets.filter(asset => asset.installStatus === 'Installed').length;
    const proofReady = sortedAssets.filter(asset => asset.evidenceStatus === 'Ready').length;
    const openItems = sortedAssets.filter(asset => asset.installStatus !== 'Installed' || asset.evidenceStatus !== 'Ready').length;

    return {
      key,
      client,
      campaign,
      assets: sortedAssets,
      primaryAsset: sortedAssets[0],
      bookedFrom,
      bookedTo,
      installState: installed === sortedAssets.length ? 'Installed' : `${installed}/${sortedAssets.length} installed`,
      proofState: proofReady === sortedAssets.length ? 'Ready' : `${proofReady}/${sortedAssets.length} ready`,
      openItems,
      page,
    };
  }).sort((a, b) => Date.parse(a.bookedFrom) - Date.parse(b.bookedFrom));
}

function clientBookingAssetLabel(row: OOHClientBookingRow): string {
  if (row.assets.length <= 1) return row.primaryAsset.name;
  return `${row.primaryAsset.name} + ${row.assets.length - 1} more`;
}

function clientBookingDuration(row: OOHClientBookingRow): string {
  if (!row.bookedFrom || !row.bookedTo) return 'Dates pending';
  return `${formatDate(row.bookedFrom)} to ${formatDate(row.bookedTo)}`;
}

function clientBookingMarketRoute(row: OOHClientBookingRow): string {
  const markets = Array.from(new Set(row.assets.map(asset => asset.market).filter(Boolean)));
  const marketLabel = markets.length ? markets.join(', ') : row.primaryAsset.market;
  return `${marketLabel} / ${row.primaryAsset.route}`;
}

function getLastClientView(asset: OOHAsset): string {
  return asset.lastClientView ? formatDate(asset.lastClientView) : 'Not viewed';
}

function statusTone(status: string): string {
  if (['Live', 'Ready', 'Approved', 'Valid', 'Online', 'Installed'].includes(status)) return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  if (['Issue', 'Rejected', 'Expired', 'Offline', 'Needs Visit'].includes(status)) return 'border-red-400/25 bg-red-400/10 text-red-200';
  if (['Pending', 'Survey Due', 'Install Due', 'Expiring', 'Pending Review', 'Submitted', 'Booked'].includes(status)) return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
  return 'border-blue-300/20 bg-blue-300/10 text-blue-100';
}

function markerColor(asset: OOHAsset): string {
  if (asset.status === 'Issue' || asset.evidenceStatus === 'Rejected') return '#f87171';
  if (asset.evidenceStatus === 'Missing' || asset.status === 'Install Due') return '#fbbf24';
  if (asset.format.toLowerCase().includes('digital')) return '#38bdf8';
  return '#34d399';
}

function escapeMapText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function createOOHAssetMapIcon(asset: OOHAsset, selected = false) {
  const color = markerColor(asset);
  const width = selected ? 38 : 32;
  const height = selected ? 46 : 40;
  const viewBoxWidth = 38;
  const viewBoxHeight = 46;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">
    <defs>
      <filter id="assetPinShadow" x="-40%" y="-40%" width="180%" height="190%">
        <feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="#000000" flood-opacity="0.5"/>
      </filter>
    </defs>
    <circle cx="19" cy="19" r="${selected ? 17 : 14}" fill="${color}" fill-opacity="${selected ? '0.2' : '0.1'}"/>
    <path d="M19 43C14.2 35.7 8 28.9 8 19.8C8 13.4 12.9 8.2 19 8.2C25.1 8.2 30 13.4 30 19.8C30 28.9 23.8 35.7 19 43Z" fill="#081426" stroke="${color}" stroke-width="${selected ? 3 : 2.2}" filter="url(#assetPinShadow)"/>
    <circle cx="19" cy="19.8" r="7.6" fill="${color}"/>
    <circle cx="19" cy="19.8" r="3.2" fill="#F8FAFC" fill-opacity="0.92"/>
    <circle cx="19" cy="19.8" r="13.4" fill="none" stroke="#F8FAFC" stroke-width="${selected ? 1.4 : 0}" stroke-opacity="${selected ? 0.8 : 0}"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [width, height], iconAnchor: [width / 2, height - 3], popupAnchor: [0, -height + 10] });
}

function createOOHTeamMapIcon(teamName: string, status: string, selected = false) {
  const color = teamMarkerColor(status);
  const label = teamName.replace('Field Team', 'Crew').replace('Survey Crew', 'Crew').replace('QA Team', 'QA');
  const width = Math.min(174, Math.max(96, label.length * 8 + 42));
  const height = selected ? 58 : 50;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="teamShadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000000" flood-opacity="0.48"/>
      </filter>
    </defs>
    <rect x="1.5" y="1.5" width="${width - 3}" height="32" rx="10" fill="#111D36" stroke="${color}" stroke-width="${selected ? 2.6 : 1.8}" filter="url(#teamShadow)"/>
    <rect x="1.5" y="1.5" width="${width - 3}" height="32" rx="10" fill="${color}" fill-opacity="${selected ? '0.26' : '0.16'}"/>
    <text x="15" y="21" text-anchor="middle" fill="${color}" font-size="10" font-weight="900" font-family="DM Sans, Inter, sans-serif">T</text>
    <text x="${width / 2 + 7}" y="21" text-anchor="middle" fill="#EEF3FA" font-size="11" font-weight="800" font-family="DM Sans, Inter, sans-serif">${escapeMapText(label)}</text>
    <polygon points="${width / 2 - 7},34 ${width / 2 + 7},34 ${width / 2},48" fill="${color}"/>
    <circle cx="${width / 2}" cy="${selected ? 51 : 47}" r="${selected ? 12 : 9}" fill="${color}" fill-opacity="0.2" stroke="#F8FAFC" stroke-width="2"/>
    <circle cx="${width / 2}" cy="${selected ? 51 : 47}" r="4" fill="${color}"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [width, height], iconAnchor: [width / 2, height - 2], popupAnchor: [0, -height + 14] });
}

function teamInitials(teamName: string): string {
  return teamName
    .split(' ')
    .filter(word => !['Field', 'Survey', 'Team', 'Crew'].includes(word))
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'FT';
}

function createMissionCrewIcon(teamName: string, status: string, selected = false) {
  const color = teamMarkerColor(status);
  const initials = escapeMapText(teamInitials(teamName));
  const html = `
    <div class="ooh-crew-marker ${selected ? 'is-selected' : ''}" style="--crew-color:${color}">
      <div class="ooh-crew-bearing"></div>
      <div class="ooh-crew-dot"><span>${initials}</span></div>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [42, 42], iconAnchor: [18, 21], popupAnchor: [0, -30] });
}

function createMissionTargetIcon(asset: OOHAsset, selected = false) {
  const color = markerColor(asset);
  const html = `
    <div class="ooh-target-marker ${selected ? 'is-selected' : ''}" style="--target-color:${color}">
      <div class="ooh-target-ring"></div>
      <div class="ooh-target-core"></div>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18] });
}

function createMissionStartIcon(selected = false) {
  const html = `
    <div class="ooh-start-marker ${selected ? 'is-selected' : ''}">
      <div class="ooh-start-core"></div>
    </div>
  `;
  return L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16] });
}

function routeDistanceKm(points: Array<[number, number]>): number {
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    const latKm = (point[0] - previous[0]) * 111;
    const lngKm = (point[1] - previous[1]) * 111 * Math.cos(((point[0] + previous[0]) / 2) * Math.PI / 180);
    return sum + Math.sqrt(latKm * latKm + lngKm * lngKm);
  }, 0);
}

function pointAlongRoute(points: Array<[number, number]>, progress: number): [number, number] {
  if (points.length <= 1) return points[0] ?? [25.2048, 55.2708];
  const distances = points.slice(1).map((point, index) => routeDistanceKm([points[index], point]));
  const total = distances.reduce((sum, distance) => sum + distance, 0) || 1;
  let target = total * Math.max(0, Math.min(0.98, progress));
  for (let index = 0; index < distances.length; index += 1) {
    const distance = distances[index];
    if (target <= distance) {
      const start = points[index];
      const end = points[index + 1];
      const ratio = distance ? target / distance : 0;
      return [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ];
    }
    target -= distance;
  }
  return points[points.length - 1];
}

function routeMidpoint(points: Array<[number, number]>): [number, number] {
  return pointAlongRoute(points, 0.5);
}

function missionRouteFor(teamName: string, start: [number, number], target?: OOHAsset): Array<[number, number]> {
  if (!target) return [start];
  const end: [number, number] = [target.lat, target.lng];

  if (teamName.includes('Falcon')) {
    return [
      start,
      [25.204779, 55.270786],
      [25.202019, 55.27592],
      [25.201256, 55.277539],
      [25.202054, 55.278391],
      [25.203253, 55.278699],
      [25.205081, 55.278952],
      [25.209445, 55.279513],
      [25.210733, 55.280205],
      [25.211618, 55.281463],
      [25.212865, 55.283351],
      [25.214338, 55.28437],
      [25.214602, 55.284325],
      [25.215844, 55.282186],
      [25.216295, 55.281874],
      [25.216678, 55.280903],
      [25.21756, 55.280792],
      [25.218248, 55.281271],
      [25.218495, 55.281873],
      end,
    ];
  }

  if (teamName.includes('Capital')) {
    return [
      start,
      [24.454012, 54.377103],
      [24.453613, 54.376943],
      [24.451673, 54.374536],
      [24.450367, 54.372625],
      [24.45131, 54.371469],
      [24.453379, 54.369464],
      [24.455113, 54.367943],
      [24.455473, 54.367763],
      [24.455671, 54.367274],
      [24.458016, 54.364987],
      [24.461532, 54.361642],
      [24.462146, 54.361044],
      [24.465877, 54.35747],
      [24.467826, 54.355576],
      [24.469851, 54.353634],
      [24.473021, 54.350571],
      [24.474352, 54.349293],
      [24.475414, 54.348238],
      [24.476216, 54.347473],
      [24.476696, 54.347028],
      [24.478048, 54.345712],
      [24.477531, 54.345034],
      [24.475793, 54.343907],
      [24.473773, 54.341875],
      end,
    ];
  }

  if (teamName.includes('Coastal')) {
    return [
      start,
      [25.204779, 55.270786],
      [25.200227, 55.276636],
      [25.199161, 55.276432],
      [25.200063, 55.27699],
      [25.202698, 55.274903],
      [25.204888, 55.27258],
      [25.206023, 55.271245],
      [25.202971, 55.269107],
      [25.183926, 55.252773],
      [25.132883, 55.213561],
      [25.118875, 55.195852],
      [25.093647, 55.16267],
      [25.090636, 55.158791],
      [25.085981, 55.152918],
      [25.086128, 55.150733],
      [25.084479, 55.150194],
      [25.082686, 55.148833],
      [25.079532, 55.144905],
      [25.08043, 55.140222],
      [25.079712, 55.137925],
      [25.0786, 55.136619],
      end,
    ];
  }

  const midLat = (start[0] + end[0]) / 2;
  const midLng = (start[1] + end[1]) / 2;
  return [start, [midLat + 0.002, midLng], [midLat, midLng - 0.002], end];
}

function missionStreetLabel(asset?: OOHAsset): string {
  if (!asset) return 'Field route';
  if (asset.route) return asset.route;
  return asset.address.split(',')[0] || asset.market;
}

function missionEtaMinutes(distanceKm: number, progress: number, blockers: number): number {
  const remaining = distanceKm * (1 - Math.max(0, Math.min(0.95, progress)));
  return Math.max(3, Math.round(remaining * 5 + blockers * 3 + 4));
}

function MissionMapFocus({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center[0], center[1], map, zoom]);
  return null;
}

function MissionRoutePolyline({ positions, selected }: { positions: Array<[number, number]>; selected: boolean }) {
  const [layer, setLayer] = useState<L.Polyline | null>(null);

  useEffect(() => {
    const element = layer?.getElement();
    if (!element) return;
    element.classList.toggle('ooh-route-primary', selected);
    element.classList.toggle('ooh-route-muted', !selected);
  }, [layer, selected]);

  const routeColor = selected ? '#7EB8F7' : '#51657D';

  return (
    <Polyline
      ref={setLayer}
      positions={positions}
      pathOptions={{
        color: routeColor,
        opacity: selected ? 0.84 : 0.24,
        weight: selected ? 3 : 1.5,
        dashArray: selected ? undefined : '3 10',
      }}
    />
  );
}

function scoreTone(score: number): string {
  if (score >= 92) return 'text-emerald-200';
  if (score >= 80) return 'text-amber-100';
  return 'text-red-200';
}

function absolutePath(path: string): string {
  return `${window.location.origin}${path}`;
}

function buildNewAssetForm(): AssetForm {
  return {
    name: 'Airport Road Digital Gantry',
    format: 'Digital screen',
    dimensions: '10m x 3m LED',
    market: 'Dubai',
    route: 'Airport Road',
    address: 'DXB approach road, terminal corridor',
    lat: '25.2522',
    lng: '55.3657',
    frequency: 'Monthly',
    network: 'Dubai',
  };
}

function isDigitalFormat(format: string): boolean {
  return /digital|screen|led|player|totem|panel/i.test(format);
}

function assetPayloadFromForm(form: AssetForm, attributes: string[] = ['Registered through intake wizard', 'Awaiting first field survey']): Partial<OOHAsset> {
  const digital = isDigitalFormat(form.format);
  const networkCampaign = form.network.toLowerCase().includes('network') ? form.network : `${form.network} Network`;
  return {
    name: form.name,
    format: form.format,
    dimensions: form.dimensions,
    market: form.market,
    route: form.route,
    address: form.address,
    campaign: networkCampaign,
    lat: Number(form.lat),
    lng: Number(form.lng),
    client: 'Unassigned client',
    status: 'Install Due',
    permitStatus: 'Pending',
    installStatus: 'Scheduled',
    evidenceStatus: 'Missing',
    healthScore: 88,
    owner: 'OOH Assets',
    buyerContact: 'To be assigned during campaign commissioning',
    bookedFrom: new Date().toISOString(),
    bookedTo: new Date(Date.now() + 30 * 86400000).toISOString(),
    installSla: 'Install proof required before go-live',
    proofSla: 'Awaiting first evidence review',
    playerUptime: digital ? 99.1 : 100,
    audienceReference: `${form.network} network GIS point with field survey pending`,
    illumination: digital ? 'Digital' : 'Front-lit',
    powerStatus: digital ? 'Online' : 'Not Required',
    playerStatus: digital ? 'Online' : 'Not Installed',
    attributes: [
      ...attributes.filter(attribute => !attribute.startsWith('Frequency:') && !attribute.startsWith('Network:')),
      `Frequency: ${form.frequency}`,
      `Network: ${form.network}`,
    ],
  };
}

function normaliseImportKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

function valueFromImportedRow(row: Record<string, string>, aliases: string[], fallback: string): string {
  for (const alias of aliases) {
    const value = row[normaliseImportKey(alias)];
    if (value) return value;
  }
  return fallback;
}

function parseBulkAssetCsv(text: string): BulkAssetPreview[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normaliseImportKey);

  return rows.slice(1).map((cells, index): BulkAssetPreview => {
    const row = headers.reduce<Record<string, string>>((accumulator, header, headerIndex) => {
      accumulator[header] = cells[headerIndex]?.trim() ?? '';
      return accumulator;
    }, {});
    const fallbackLat = 25.2048 + (index * 0.006);
    const fallbackLng = 55.2708 + (index * 0.006);

    return {
      rowNumber: index + 2,
      name: valueFromImportedRow(row, ['asset name', 'asset', 'name'], `Imported OOH Asset ${index + 1}`),
      format: valueFromImportedRow(row, ['format', 'asset format', 'media format'], 'Digital screen'),
      dimensions: valueFromImportedRow(row, ['dimensions', 'size'], '6m x 3m LED'),
      market: valueFromImportedRow(row, ['market', 'city', 'emirate'], 'Dubai'),
      route: valueFromImportedRow(row, ['route', 'road', 'corridor'], 'Route pending'),
      address: valueFromImportedRow(row, ['address', 'location', 'site address'], 'Field verified address pending'),
      lat: valueFromImportedRow(row, ['gps lat', 'latitude', 'lat'], fallbackLat.toFixed(4)),
      lng: valueFromImportedRow(row, ['gps lng', 'longitude', 'lng', 'lon'], fallbackLng.toFixed(4)),
      frequency: valueFromImportedRow(row, ['frequency', 'inspection frequency', 'survey frequency', 'recurrence'], 'Monthly'),
      network: valueFromImportedRow(row, ['network', 'inventory network', 'market network', 'campaign'], valueFromImportedRow(row, ['market', 'city', 'emirate'], 'Dubai')),
    };
  }).filter(asset => asset.name.trim().length > 0);
}

function buildPreparedBulkAssets(): BulkAssetPreview[] {
  return [
    {
      rowNumber: 1,
      name: 'Marina Walk Digital Totem',
      format: 'Street furniture',
      dimensions: '1.8m x 1.2m digital panel',
      market: 'Dubai',
      route: 'Marina Walk',
      address: 'Marina promenade, Dubai',
      lat: '25.0807',
      lng: '55.1408',
      frequency: 'Monthly',
      network: 'Dubai',
    },
    {
      rowNumber: 2,
      name: 'Yas Island Bridge Banner',
      format: 'Bridge banner',
      dimensions: '24m x 2.8m',
      market: 'Abu Dhabi',
      route: 'Yas access road',
      address: 'Yas Island approach, Abu Dhabi',
      lat: '24.4881',
      lng: '54.6071',
      frequency: 'Quarterly',
      network: 'Abu Dhabi',
    },
    {
      rowNumber: 3,
      name: 'University City Bus Shelter',
      format: 'Bus shelter',
      dimensions: '4-sheet backlit',
      market: 'Sharjah',
      route: 'University City Road',
      address: 'University City stop 4, Sharjah',
      lat: '25.2862',
      lng: '55.4635',
      frequency: 'Weekly',
      network: 'Sharjah',
    },
  ];
}

function dateInputValue(value?: string, offsetDays = 0): string {
  const fallback = new Date(Date.now() + offsetDays * 86400000).toISOString();
  const parsed = value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
  return parsed.slice(0, 10);
}

function dateOffsetInputValue(value: string | undefined, offsetDays: number, fallbackOffsetDays = 3): string {
  const base = value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Date.now() + fallbackOffsetDays * 86400000;
  return new Date(base + offsetDays * 86400000).toISOString().slice(0, 10);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTitle(value: string): string {
  return value.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function assetAttributeValue(asset: OOHAsset, key: string): string | undefined {
  const prefix = `${key}:`;
  return asset.attributes.find(attribute => attribute.startsWith(prefix))?.slice(prefix.length).trim();
}

function mergeAssetAttributes(asset: OOHAsset, values: Record<string, string>): string[] {
  const managedPrefixes = Object.keys(values).map(key => `${key}:`);
  const preserved = asset.attributes.filter(attribute => !managedPrefixes.some(prefix => attribute.startsWith(prefix)));
  const managed = Object.entries(values)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value.trim()}`);
  return [...preserved, ...managed, 'Campaign commissioned through 4C360'];
}

function buildCampaignForm(asset?: OOHAsset): CampaignForm {
  const fallback = asset ?? fallbackOOHBootstrap.assets[0];
  if (!fallback) {
    return {
      assetId: '',
      campaign: 'New Campaign Launch',
      client: 'Client name',
      buyerContact: 'Client media buyer',
      bookedFrom: dateInputValue(undefined, 0),
      bookedTo: dateInputValue(undefined, 30),
      artworkTitle: 'Campaign creative',
      artworkFile: 'ARTWORK_FILE.pdf',
      artworkSpec: 'Asset dimensions and production spec',
      installOwner: 'Falcon Field Team',
      installationDueDate: dateInputValue(undefined, 3),
      workOrderAssignment: 'Create installation work order',
      installSla: 'Install proof required before go-live',
      proofSla: 'Evidence due within 24h of installation',
    };
  }
  const artwork = artworkForAsset(fallback);
  return {
    assetId: fallback?.id ?? '',
    campaign: fallback?.campaign ?? 'New Campaign Launch',
    client: fallback?.client ?? 'Client name',
    buyerContact: fallback?.buyerContact ?? 'Client media buyer',
    bookedFrom: dateInputValue(fallback?.bookedFrom, 0),
    bookedTo: dateInputValue(fallback?.bookedTo, 30),
    artworkTitle: assetAttributeValue(fallback, 'Artwork title') ?? artwork.title,
    artworkFile: assetAttributeValue(fallback, 'Artwork file') ?? artwork.file,
    artworkSpec: assetAttributeValue(fallback, 'Artwork spec') ?? artwork.spec,
    installOwner: assetAttributeValue(fallback, 'Install owner') ?? 'Falcon Field Team',
    installationDueDate: assetAttributeValue(fallback, 'Installation due') ?? dateOffsetInputValue(fallback.bookedFrom, -1, 3),
    workOrderAssignment: (assetAttributeValue(fallback, 'Work order assignment') as CampaignAssignmentMode | undefined) ?? 'Create installation work order',
    installSla: fallback?.installSla ?? 'Install proof required before go-live',
    proofSla: fallback?.proofSla ?? 'Evidence due within 24h of installation',
  };
}

function buildAssignmentForm(assetId: string): AssignmentForm {
  return {
    assetId,
    name: 'Installation proof and condition survey',
    team: 'Falcon Field Team',
    vendor: 'In-house',
    recurrence: 'Weekly',
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    reviewer: 'Maya Haddad',
  };
}

function getInitialOOHTab(): OOHTab {
  const path = window.location.pathname;
  if (path === '/ooh/client-pages' || path.startsWith('/ooh/client-pages/')) return 'Clients';
  const match = Object.entries(oohTabPaths).find(([, tabPath]) => tabPath !== '/ooh' && (path === tabPath || path.startsWith(`${tabPath}/`)));
  if (match) return match[0] as OOHTab;
  return 'Command';
}

type MetricTone = 'blue' | 'green' | 'amber' | 'red';

interface MetricRecord {
  id: string;
  title: string;
  detail: string;
  painPoint: string;
  solution: string;
  tab: OOHTab;
  actionLabel: string;
  urgency: 'Critical' | 'Attention' | 'Watch';
  assetId?: string;
  submissionId?: string;
}

interface MetricInsight {
  id: string;
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone: MetricTone;
  formula: string;
  deepDive: string;
  painPoint: string;
  rootCause: string;
  solutionSteps: string[];
  signals: string[];
  records: MetricRecord[];
  action: string;
  actionLabel: string;
  actionAssetId?: string;
  actionSubmissionId?: string;
  tab: OOHTab;
}

function percent(part: number, total: number): number {
  return Math.round((part / Math.max(1, total)) * 100);
}

function assetMetricRecord(
  asset: OOHAsset,
  detail: string,
  tab: OOHTab,
  actionLabel: string,
  submissionId?: string,
  options?: Partial<Pick<MetricRecord, 'painPoint' | 'solution' | 'urgency'>>,
): MetricRecord {
  return {
    id: `${asset.id}-${tab}-${submissionId ?? detail}`,
    title: asset.name,
    detail,
    painPoint: options?.painPoint ?? detail,
    solution: options?.solution ?? actionLabel,
    tab,
    actionLabel,
    urgency: options?.urgency ?? 'Attention',
    assetId: asset.id,
    submissionId,
  };
}

function MetricCard({ metric, selected, updatedAt, onOpen }: { metric: MetricInsight; selected: boolean; updatedAt: string; onOpen: (metricId: string) => void }) {
  const Icon = metric.icon;
  const toneClass = {
    blue: 'bg-blue-400/10 text-blue-200 border-blue-400/20',
    green: 'bg-emerald-400/10 text-emerald-200 border-emerald-400/20',
    amber: 'bg-amber-300/10 text-amber-100 border-amber-300/20',
    red: 'bg-red-400/10 text-red-200 border-red-400/20',
  }[metric.tone];

  return (
    <button
      type="button"
      aria-label={`Open ${metric.label} details`}
      className={`group flex min-h-[190px] flex-col rounded-lg border p-4 text-left shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:border-[#7EB8F7]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7EB8F7] ${
        selected ? 'border-[#7EB8F7] bg-[#102343]' : 'border-white/10 bg-[#0B172A]'
      }`}
      onClick={() => onOpen(metric.id)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${toneClass}`}>
          <Icon size={20} />
        </div>
        <span className="text-right text-[11px] font-bold uppercase tracking-[0.18em] text-[#7A94B4]">{metric.label}</span>
      </div>
      <div className="mt-4 text-3xl font-black text-[#EEF3FA]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{metric.value}</div>
      <p className="mt-1 min-h-[44px] text-sm leading-6 text-[#9DB4D0]">{metric.note}</p>
      <MetricTimestamp updatedAt={updatedAt} className="mt-2" />
      <span className={`mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black transition ${
        selected
          ? 'border-[#7EB8F7] bg-[#2E7FFF] text-white'
          : 'border-blue-300/20 bg-blue-400/10 text-blue-100 group-hover:bg-blue-400/15'
      }`}>
        <BrainCircuit size={14} /> Open AI Triage
      </span>
    </button>
  );
}

function urgencyTone(urgency: MetricRecord['urgency']): string {
  if (urgency === 'Critical') return 'border-red-300/25 bg-red-400/10 text-red-100';
  if (urgency === 'Attention') return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
  return 'border-blue-300/20 bg-blue-300/10 text-blue-100';
}

function MetricInsightModal({
  metric,
  updatedAt,
  onRunAction,
  onRunRecord,
  onClose,
}: {
  metric: MetricInsight | null;
  updatedAt: string;
  onRunAction: (metric: MetricInsight) => void;
  onRunRecord: (record: MetricRecord) => void;
  onClose: () => void;
}) {
  if (!metric) return null;
  const Icon = metric.icon;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`metric-modal-${metric.id}`}
        className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-lg border border-[#2E7FFF]/35 bg-[#081426] shadow-2xl shadow-black/50"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#081426]/95 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#7EB8F7]/25 bg-[#102343] text-[#7EB8F7]">
                <Icon size={21} />
              </div>
              <div>
                <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#7EB8F7]">
                  <BrainCircuit size={15} /> AI operator triage
                </p>
                <h2 id={`metric-modal-${metric.id}`} className="mt-2 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{metric.label}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9DB4D0]">AI-ranked operator work queue showing the affected records, the operational pain, and the next action to clear the blocker.</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close metric details"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#B8C7DB] hover:bg-white/10 hover:text-white"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-[#2E7FFF]/25 bg-[#07111F] p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Operator Queue</p>
                <h3 className="mt-1 text-lg font-black text-white">Pain points to resolve now</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-[#B8C7DB]">{metric.records.length} record{metric.records.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {metric.records.map((record, index) => (
                <button
                  key={record.id}
                  type="button"
                  className="rounded-lg border border-white/10 bg-[#0B172A] p-3 text-left text-sm text-[#DCE8F6] transition hover:border-[#7EB8F7]/50 hover:bg-[#102343] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7EB8F7]"
                  onClick={() => onRunRecord(record)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Item {index + 1}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${urgencyTone(record.urgency)}`}>{record.urgency}</span>
                  </div>
                  <p className="mt-2 font-black leading-6 text-white">{record.title}</p>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Signal</p>
                  <p className="mt-1 leading-5 text-[#9DB4D0]">{record.detail}</p>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-red-100">Pain point</p>
                  <p className="mt-1 leading-6 text-[#DCE8F6]">{record.painPoint}</p>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-emerald-100">Operator action</p>
                  <p className="mt-1 leading-6 text-[#B8C7DB]">{record.solution}</p>
                  <span className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[#2E7FFF]/35 bg-[#2E7FFF]/14 px-3 py-2 text-xs font-black text-[#D8E9FF]">
                    {record.actionLabel} <ExternalLink size={13} />
                  </span>
                </button>
              ))}
              {metric.records.length === 0 && <div className="rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm text-[#9DB4D0]">No records currently need attention for this signal.</div>}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.8fr_1fr_1fr]">
            <div className="rounded-lg border border-red-300/20 bg-red-400/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-red-100">Pain Pattern</p>
              <p className="mt-2 text-sm leading-6 text-white">{metric.painPoint}</p>
            </div>
            <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-100">Likely Cause</p>
              <p className="mt-2 text-sm leading-6 text-white">{metric.rootCause}</p>
            </div>
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-emerald-100">Actionable Solution</p>
              <div className="mt-2 space-y-2">
                {metric.solutionSteps.map(step => (
                  <div key={step} className="flex gap-2 text-sm leading-6 text-white">
                    <CheckCircle2 size={15} className="mt-1 shrink-0 text-emerald-200" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]"
                onClick={() => onRunAction(metric)}
              >
                {metric.actionLabel} <ExternalLink size={14} />
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.6fr_1.4fr]">
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Current Value</p>
              <p className="mt-3 text-4xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{metric.value}</p>
              <p className="mt-2 text-sm leading-6 text-[#B8C7DB]">{metric.note}</p>
              <MetricTimestamp updatedAt={updatedAt} />
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Why it matters</p>
              <p className="mt-2 text-sm leading-6 text-[#DCE8F6]">{metric.deepDive}</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Calculation</p>
              <p className="mt-2 text-sm leading-6 text-white">{metric.formula}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Signals Used</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {metric.signals.map(signal => <span key={signal} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-[#B8C7DB]">{signal}</span>)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Recommended Action</p>
              <p className="mt-2 text-sm leading-6 text-white">{metric.action}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OOHSideNav({ activeTab, onChange }: { activeTab: OOHTab; onChange: (tab: OOHTab) => void }) {
  return (
    <aside className="sticky top-0 z-[1000] flex h-screen w-[58px] shrink-0 flex-col items-center border-r border-[rgba(46,127,255,0.22)] bg-[#0A1628] py-3">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-blue-400/20 bg-[#112040] shadow-lg shadow-black/20">
        <img src="/4c-logo.png" alt="4C360 logo" className="h-8 w-8 rounded-lg object-contain" />
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1.5" aria-label="OOH platform navigation">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <div key={tab.id} className="group relative">
              <button
                type="button"
                aria-label={tab.label}
                title={tab.label}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 ${
                  active
                    ? 'bg-[#2E7FFF] text-white shadow-lg shadow-blue-500/30'
                    : 'text-[#7A94B4] hover:bg-white/5 hover:text-[#EEF3FA]'
                }`}
                onClick={() => onChange(tab.id)}
              >
                <Icon size={16} />
              </button>
              <div className="pointer-events-none absolute left-11 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded border border-[rgba(46,127,255,0.3)] bg-[#1A3260] px-2 py-1 text-[11px] font-bold text-[#EEF3FA] opacity-0 shadow-xl shadow-black/20 transition-opacity group-hover:opacity-100">
                {tab.label}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="mt-3 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.75)]" title="OOH API online" />
    </aside>
  );
}

function Pill({ children, tone, className = '' }: { children: string; tone?: string; className?: string }) {
  return (
    <span className={`inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[11px] font-bold leading-none ${tone ?? statusTone(children)} ${className}`}>
      {children}
    </span>
  );
}

function MetricTimestamp({ updatedAt, className = '' }: { updatedAt: string; className?: string }) {
  return (
    <p className={`mt-3 text-[10px] font-black uppercase tracking-wide text-[#58708E] ${className}`}>
      Updated {formatDateTime(updatedAt)}
    </p>
  );
}

function OOHReportPreviewModal({ report, onClose }: { report: OOHGeneratedReport | null; onClose: () => void }) {
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`ooh-report-${report.id}`}
        className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-lg border border-[#2E7FFF]/35 bg-[#081426] shadow-2xl shadow-black/50"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex flex-col gap-4 border-b border-white/10 bg-[#0B172A] p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">Generated report preview</p>
            <h2 id={`ooh-report-${report.id}`} className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{report.title}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#B8C7DB]">{report.subtitle}</p>
            <p className="mt-2 text-xs font-bold text-[#7A94B4]">Generated {formatDateTime(report.generatedAt)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-4 py-2 text-sm font-black text-white hover:bg-[#4B91FF]"
              onClick={() => exportReportCsv(report)}
            >
              <Download size={16} /> Export CSV
            </button>
            <button
              type="button"
              aria-label="Close report preview"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#B8C7DB] hover:bg-white/10 hover:text-white"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="custom-scrollbar max-h-[calc(92vh-118px)] overflow-y-auto p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {report.summary.map(item => (
              <div key={item.label} className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{item.label}</p>
                <p className="mt-2 text-3xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{item.value}</p>
                <p className="mt-2 text-xs leading-5 text-[#9DB4D0]">{item.helper}</p>
                <MetricTimestamp updatedAt={report.generatedAt} />
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7EB8F7]">Operator readout</p>
              <div className="mt-3 space-y-3 text-sm leading-6 text-[#CFE3FA]">
                {report.narrative.map(line => <p key={line}>{line}</p>)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7EB8F7]">Recommended actions</p>
              <div className="mt-3 space-y-2">
                {report.nextActions.map((action, index) => (
                  <div key={action} className="flex gap-3 rounded-lg border border-blue-300/15 bg-blue-300/8 p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2E7FFF] text-xs font-black text-white">{index + 1}</span>
                    <p className="text-sm leading-6 text-[#CFE3FA]">{action}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#07111F]">
            <div className="flex flex-col gap-2 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7EB8F7]">Report rows</p>
                <h3 className="mt-1 text-lg font-black text-white">Preview data</h3>
              </div>
              <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{`${report.rows.length} rows`}</Pill>
            </div>
            <div className="custom-scrollbar max-h-[360px] overflow-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#07111F] text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">
                  <tr>
                    {report.columns.map(column => <th key={column} className="border-b border-white/10 px-4 py-3">{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length ? report.rows.map((row, index) => (
                    <tr key={`${report.id}-${index}`} className="border-t border-white/10 odd:bg-white/[0.02]">
                      {row.map((cell, cellIndex) => (
                        <td key={`${report.id}-${index}-${cellIndex}`} className="max-w-[280px] px-4 py-3 align-top text-[#CFE3FA]">
                          <span className={cellIndex === 0 ? 'font-black text-white' : ''}>{cell}</span>
                        </td>
                      ))}
                    </tr>
                  )) : (
                    <tr>
                      <td className="px-4 py-8 text-center text-[#9DB4D0]" colSpan={report.columns.length}>No rows match this report.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const addNewClientValue = '__add_new_client__';

function ClientSelectWithNew({
  label,
  value,
  options,
  onChange,
  heightClass = 'h-10',
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  heightClass?: string;
}) {
  const cleanOptions = Array.from(new Set(options.map(option => option.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const isExistingClient = cleanOptions.includes(value);
  const selectValue = isExistingClient ? value : addNewClientValue;
  const controlClass = `${heightClass} w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none`;

  return (
    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">
      {label}
      <select
        className={`mt-1 ${controlClass}`}
        value={selectValue}
        onChange={event => onChange(event.target.value === addNewClientValue ? '' : event.target.value)}
      >
        {cleanOptions.map(client => <option key={client} value={client}>{client}</option>)}
        <option value={addNewClientValue}>+ Add new client</option>
      </select>
      {!isExistingClient && (
        <input
          className={`mt-2 ${controlClass}`}
          placeholder="Enter new client name"
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function TeamSelectWithNew({
  label,
  value,
  options,
  onChange,
  heightClass = 'h-11',
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  heightClass?: string;
}) {
  const cleanOptions = Array.from(new Set(options.map(option => option.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const isExistingTeam = cleanOptions.includes(value);
  const controlClass = `${heightClass} w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none`;

  return (
    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">
      {label}
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <select className={controlClass} value={isExistingTeam ? value : ''} onChange={event => onChange(event.target.value)}>
          <option value="" disabled>Select installation team</option>
          {cleanOptions.map(team => <option key={team} value={team}>{team}</option>)}
        </select>
        <button
          type="button"
          className={`${heightClass} inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#2E7FFF]/35 bg-[#2E7FFF]/12 px-4 text-sm font-black normal-case tracking-normal text-white hover:bg-[#2E7FFF]/20`}
          onClick={() => onChange('')}
        >
          <Plus size={15} /> Add new team
        </button>
      </div>
      {!isExistingTeam && (
        <input
          className={`mt-2 ${controlClass}`}
          placeholder="Enter new installation team"
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

const addNewNetworkValue = '__add_new_network__';

function NetworkSelectWithNew({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const cleanOptions = Array.from(new Set(options.map(option => option.trim()).filter(Boolean)));
  const isExistingNetwork = cleanOptions.includes(value);
  const controlClass = 'h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none';

  return (
    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">
      Network
      <select
        className={`mt-1 ${controlClass}`}
        value={isExistingNetwork ? value : addNewNetworkValue}
        onChange={event => onChange(event.target.value === addNewNetworkValue ? '' : event.target.value)}
      >
        {cleanOptions.map(network => <option key={network} value={network}>{network}</option>)}
        <option value={addNewNetworkValue}>+ Add new network</option>
      </select>
      {!isExistingNetwork && (
        <input
          className={`mt-2 ${controlClass}`}
          placeholder="Enter new network"
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function AssetVisual({ asset, compact = false }: { asset: OOHAsset; compact?: boolean }) {
  const isDigital = asset.format.toLowerCase().includes('digital') || asset.playerStatus === 'Online';
  const isStreet = asset.format.toLowerCase().includes('shelter') || asset.format.toLowerCase().includes('furniture') || asset.format.toLowerCase().includes('totem');

  return (
    <div className={`relative overflow-hidden rounded-lg border border-blue-300/20 bg-[#07111F] ${compact ? 'h-24' : 'h-36'}`}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(46,127,255,0.22),rgba(225,29,46,0.14)_45%,rgba(7,17,31,0.9))]" />
      <div className="absolute inset-x-0 bottom-0 h-9 bg-[linear-gradient(180deg,rgba(7,17,31,0),rgba(7,17,31,0.92))]" />
      <div className="absolute bottom-4 left-4 right-4 h-[3px] rounded-full bg-blue-200/20" />
      {isStreet ? (
        <div className="absolute bottom-5 left-8 flex h-16 w-14 items-center justify-center rounded border border-blue-200/50 bg-[#0B172A] shadow-2xl shadow-black/40">
          <div className="h-11 w-8 rounded-sm bg-[linear-gradient(180deg,rgba(126,184,247,0.9),rgba(225,29,46,0.58))]" />
        </div>
      ) : (
        <div className="absolute left-8 top-5 h-14 w-32 rounded-md border border-blue-100/55 bg-[#0B172A] p-1 shadow-2xl shadow-black/40">
          <div className={`h-full rounded ${isDigital ? 'bg-[linear-gradient(135deg,#7EB8F7,#E11D2E)]' : 'bg-[linear-gradient(135deg,#F7FBFF,#7EB8F7)]'}`} />
          <div className="absolute -bottom-9 left-1/2 h-9 w-1 -translate-x-1/2 bg-blue-100/35" />
        </div>
      )}
      <div className="absolute right-3 top-3 rounded-md border border-white/10 bg-[#07111F]/80 p-2 text-right backdrop-blur">
        <p className="text-[9px] font-black uppercase tracking-wide text-[#7EB8F7]">{asset.format}</p>
        <p className="mt-1 max-w-[130px] truncate text-xs font-black text-white">{asset.campaign}</p>
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-[#07111F]/75 px-2 py-1 text-[10px] font-bold text-[#B8C7DB]">
        <Image size={12} /> Asset visual
      </div>
    </div>
  );
}

function EvidencePhotoPreview({ item, asset }: { item: OOHEvidenceItem; asset?: OOHAsset }) {
  return (
    <div className="relative h-[320px] overflow-hidden bg-[#07111F]">
      <img src={evidencePhotoSrc(item, asset)} alt={evidencePhotoAlt(item, asset)} className="h-full w-full object-cover" style={{ objectPosition: evidencePhotoObjectPosition(asset) }} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,31,0.1),rgba(7,17,31,0)_42%,rgba(7,17,31,0.88))]" />
    </div>
  );
}

function evidenceReviewBadgeTone(status: string): string {
  if (status === 'Approved') return 'border-emerald-200/25 bg-[#052E25]/85 text-emerald-100';
  if (status === 'Pending Review') return 'border-amber-200/30 bg-[#3B2F0B]/88 text-amber-100';
  if (status === 'Rejected') return 'border-red-200/25 bg-[#3A1018]/88 text-red-100';
  return 'border-blue-200/20 bg-[#07111F]/78 text-blue-50';
}

function EvidenceStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 border-t border-white/10 px-4 py-3 sm:border-l sm:border-t-0">
      <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
      <p className={`mt-1 truncate text-sm font-black ${tone ?? 'text-white'}`}>{value}</p>
    </div>
  );
}

function AssetPopupVisual({ asset, className = 'h-[92px] w-full' }: { asset: OOHAsset; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#07111F] ${className}`}>
      <img
        src={assetPreviewPhotoSrc(asset)}
        alt={assetPreviewPhotoAlt(asset)}
        className="h-full w-full object-cover"
        style={{ objectPosition: evidencePhotoObjectPosition(asset) }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,31,0),rgba(7,17,31,0.10)_48%,rgba(7,17,31,0.48))]" />
    </div>
  );
}

function PopupStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 border-l border-white/10 px-3 py-2.5 first:border-l-0">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-[#7A94B4]">{label}</p>
      <p className={`mt-1 truncate text-[13px] font-black leading-5 ${tone ?? 'text-white'}`}>{value}</p>
    </div>
  );
}

function AssetMapPopupContent({
  asset,
  latestInspection,
  onSelect,
  contextLabel = 'OOH asset',
}: {
  asset: OOHAsset;
  latestInspection?: OOHSubmission;
  onSelect?: (assetId: string) => void;
  contextLabel?: string;
}) {
  return (
    <div className="w-[320px] max-w-[calc(100vw-56px)] overflow-hidden text-left">
      <div className="grid grid-cols-[112px_minmax(0,1fr)] border-b border-white/10">
        <AssetPopupVisual asset={asset} className="h-[116px] w-full" />

        <div className="min-w-0 px-3 py-3 pr-11">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-[#7A94B4]">{contextLabel}</p>
          <button
            type="button"
            className="mt-1 block max-h-10 w-full overflow-hidden text-left text-[15px] font-black leading-5 text-[#EEF3FA] hover:text-white"
            onClick={() => onSelect?.(asset.id)}
          >
            {asset.name}
          </button>
          <p className="mt-2 truncate text-[11px] text-[#9DB4D0]">{asset.id}</p>
          <p className="mt-1 truncate text-[11px] text-[#B8C7DB]">{asset.route} - {asset.market}</p>
        </div>
      </div>

      <div className="grid min-h-[56px] grid-cols-3 bg-[#07111F]">
        <PopupStat label="Proof" value={asset.evidenceStatus} />
        <PopupStat label="Permit" value={asset.permitStatus} tone={asset.permitStatus === 'Valid' ? 'text-emerald-100' : 'text-amber-100'} />
        <PopupStat label="Health" value={`${asset.healthScore}`} tone={scoreTone(asset.healthScore)} />
      </div>

      <div className="border-t border-white/10 bg-[#0B172A] p-2.5">
        {latestInspection ? (
          <a
            aria-label={`Open latest inspection report for ${asset.name}`}
            className="flex h-8 items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] text-xs font-black !text-white hover:bg-[#4C91FF]"
            href={`/ooh/report/${latestInspection.id}`}
            onClick={event => event.stopPropagation()}
            style={{ color: '#FFFFFF' }}
          >
            <FileSearch size={14} /> Latest Report <ExternalLink size={13} />
          </a>
        ) : (
          <button
            type="button"
            className="flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 text-xs font-black text-[#D8E6F8] hover:bg-white/10"
            onClick={() => onSelect?.(asset.id)}
          >
            Open Asset Details <ExternalLink size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function EvidenceMediaPanel({ item, asset, submission }: { item: OOHEvidenceItem; asset?: OOHAsset; submission: OOHSubmission }) {
  const publishStatus = submission.clientPublishStatus ?? item.clientPublishStatus ?? 'Internal Only';

  return (
    <div className="overflow-hidden rounded-lg border border-blue-300/20 bg-[#0B172A] shadow-xl shadow-black/15">
      <div className="relative">
        <EvidencePhotoPreview item={item} asset={asset} />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span className="rounded-md border border-white/15 bg-[#07111F]/78 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#DBEAFE] backdrop-blur">Photo Evidence</span>
          {item.photoCategory && <span className="rounded-md border border-blue-200/20 bg-blue-300/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-blue-50 backdrop-blur">{item.photoCategory}</span>}
        </div>
        <div className={`absolute right-4 top-4 rounded-md border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide backdrop-blur ${evidenceReviewBadgeTone(String(item.status))}`}>
          {item.status}
        </div>
        <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-white/10 bg-[#07111F]/78 p-4 backdrop-blur">
          <p className="text-lg font-black text-white">{asset?.name ?? submission.assetId}</p>
          <p className="mt-1 text-sm text-[#B8C7DB]">{item.label}</p>
          <p className="mt-2 text-xs text-[#7A94B4]">
            {item.capturedBy} - {formatDateTime(item.capturedAt)} - GPS {item.gps.lat.toFixed(4)}, {item.gps.lng.toFixed(4)}
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-4">
        <EvidenceStat label="QR" value={submission.qrVerified === false ? 'Missing' : item.qrVerified === false ? 'Missing' : 'Verified'} tone={submission.qrVerified === false ? 'text-amber-100' : 'text-emerald-100'} />
        <EvidenceStat label="GPS Accuracy" value={`${submission.gpsAccuracyMeters ?? item.gpsAccuracyMeters ?? 8}m`} />
        <EvidenceStat label="Sync" value={submission.syncStatus ?? item.syncStatus ?? 'Synced'} tone={(submission.syncStatus ?? item.syncStatus) === 'Offline' ? 'text-amber-100' : 'text-white'} />
        <EvidenceStat label="Client Publish" value={publishStatus} tone={publishStatus === 'Published' ? 'text-emerald-100' : 'text-white'} />
      </div>
    </div>
  );
}

function latestInspectionForAsset(assetId: string, submissions: OOHSubmission[]): OOHSubmission | undefined {
  return submissions
    .filter(submission => submission.assetId === assetId)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
}

function formatReportDate(value?: string): string {
  return value && Number.isFinite(Date.parse(value)) ? formatDate(value) : 'Not set';
}

function daysUntilDate(value?: string): number | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function averageScore(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function reportDefinition(reportId: OOHReportId): OOHReportCard {
  return reportCards.find(card => card.id === reportId) ?? reportCards[0];
}

function buildOOHReportPreview(data: OOHBootstrap, reportId: OOHReportId): OOHGeneratedReport {
  const definition = reportDefinition(reportId);
  const generatedAt = new Date().toISOString();

  if (reportId === 'campaign-evidence-pack') {
    const rows = data.clientPages.map(page => {
      const pageAssets = data.assets.filter(asset => page.assetIds.includes(asset.id));
      const approvedAssets = pageAssets.filter(asset => asset.evidenceStatus === 'Ready').length;
      return [
        page.client,
        page.campaign,
        pageAssets.length ? pageAssets.map(asset => asset.name).join('; ') : 'No assets linked',
        `${approvedAssets}/${Math.max(1, pageAssets.length)} approved`,
        `${page.surveyScore}%`,
        String(page.openItems),
        formatReportDate(page.expiresAt),
      ];
    });
    const livePages = data.clientPages.filter(page => page.status === 'Live').length;
    const approvedAssetCount = data.assets.filter(asset => asset.evidenceStatus === 'Ready').length;
    const openItems = data.assets.filter(asset => asset.evidenceStatus !== 'Ready').length;
    return {
      id: reportId,
      title: definition.title,
      subtitle: 'Client-facing evidence coverage by campaign, asset and proof state.',
      generatedAt,
      summary: [
        { label: 'Live evidence pages', value: String(livePages), helper: 'Client links currently available.' },
        { label: 'Approved proof assets', value: `${approvedAssetCount}/${data.assets.length}`, helper: 'Assets with client-ready evidence.' },
        { label: 'Average inspection score', value: `${averageScore(data.clientPages.map(page => page.surveyScore))}%`, helper: 'Mean score across evidence pages.' },
        { label: 'Open proof items', value: String(openItems), helper: 'Assets still missing approved proof.' },
      ],
      columns: ['Client', 'Campaign', 'Assets', 'Approved proof', 'Inspection score', 'Open items', 'Page expiry'],
      rows,
      narrative: [
        'This report is used before sharing or renewing a client evidence page.',
        'It shows which campaigns have a secure proof pack and which assets still need reviewer-approved field evidence.',
      ],
      nextActions: [
        'Approve pending submissions before publishing the client link.',
        'Regenerate or resend the page for campaigns with current proof and expiry still active.',
      ],
    };
  }

  if (reportId === 'permit-watchlist') {
    const watchlist = data.assets
      .filter(asset => asset.permitStatus !== 'Valid' || (daysUntilDate(asset.permitExpiry) ?? 999) <= 45)
      .sort((a, b) => Date.parse(a.permitExpiry) - Date.parse(b.permitExpiry));
    return {
      id: reportId,
      title: definition.title,
      subtitle: 'Permit expiry, route, owner and action status for asset compliance control.',
      generatedAt,
      summary: [
        { label: 'Watchlist assets', value: String(watchlist.length), helper: 'Assets needing permit attention.' },
        { label: 'Expired', value: String(data.assets.filter(asset => asset.permitStatus === 'Expired').length), helper: 'Permit already outside valid window.' },
        { label: 'Pending', value: String(data.assets.filter(asset => asset.permitStatus === 'Pending').length), helper: 'Permit status still awaiting confirmation.' },
        { label: 'Next expiry', value: formatReportDate(watchlist[0]?.permitExpiry), helper: 'Earliest permit date in the watchlist.' },
      ],
      columns: ['Asset', 'Market / route', 'Permit', 'Expiry', 'Owner / site', 'Action'],
      rows: watchlist.map(asset => [
        asset.name,
        `${asset.market} / ${asset.route}`,
        asset.permitStatus,
        formatReportDate(asset.permitExpiry),
        asset.owner,
        asset.permitStatus === 'Valid' ? 'Monitor expiry window' : 'Resolve permit before client proof pack',
      ]),
      narrative: [
        'This report gives compliance and operations a shared permit queue.',
        'It prevents booked or visible assets from being treated as ready when permit status still needs attention.',
      ],
      nextActions: [
        'Prioritize expired and pending permits before installation or client publication.',
        'Attach permit renewal evidence to the asset record after resolution.',
      ],
    };
  }

  if (reportId === 'survey-scorecard') {
    const submissions = [...data.submissions].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
    const overdueAssignments = data.assignments.filter(assignment => assignment.status === 'Overdue').length;
    const pendingReview = data.submissions.filter(submission => submission.status === 'Pending Review').length;
    return {
      id: reportId,
      title: definition.title,
      subtitle: 'Latest field inspection quality, reviewer state, issues and recurrence health.',
      generatedAt,
      summary: [
        { label: 'Submitted inspections', value: String(submissions.length), helper: 'Captured survey submissions.' },
        { label: 'Average score', value: `${averageScore(submissions.map(submission => submission.score))}%`, helper: 'Mean score across submitted inspections.' },
        { label: 'Pending review', value: String(pendingReview), helper: 'Submissions waiting for reviewer decision.' },
        { label: 'Overdue assignments', value: String(overdueAssignments), helper: 'Field assignments past due date.' },
      ],
      columns: ['Asset', 'Inspection date', 'Score', 'Reviewer', 'Status', 'Issues'],
      rows: submissions.map(submission => {
        const asset = data.assets.find(item => item.id === submission.assetId);
        return [
          asset?.name ?? submission.assetId,
          formatDateTime(submission.submittedAt),
          `${submission.score}%`,
          submission.reviewer,
          submission.status,
          submission.issues.length ? submission.issues.join('; ') : 'No issues recorded',
        ];
      }),
      narrative: [
        'This report is for field supervisors and reviewers to understand recurring survey quality over time.',
        'It separates clean inspections from submissions that need rework or reviewer approval.',
      ],
      nextActions: [
        'Review pending submissions with photo, GPS and QR evidence before client publishing.',
        'Create recurring inspections for assets with stale or missing survey history.',
      ],
    };
  }

  if (reportId === 'network-inventory') {
    const markets = new Set(data.assets.map(asset => asset.market));
    const formats = new Set(data.assets.map(asset => asset.format));
    const gisReady = data.assets.filter(asset => Number.isFinite(asset.lat) && Number.isFinite(asset.lng) && asset.address && asset.route).length;
    return {
      id: reportId,
      title: definition.title,
      subtitle: 'GIS-ready OOH register with asset attributes, market coverage and current operating state.',
      generatedAt,
      summary: [
        { label: 'Registered assets', value: String(data.assets.length), helper: 'Total OOH units in the register.' },
        { label: 'Markets', value: String(markets.size), helper: 'Operating market coverage.' },
        { label: 'Formats', value: String(formats.size), helper: 'Unique media formats.' },
        { label: 'GIS complete', value: `${percent(gisReady, data.assets.length)}%`, helper: 'Assets with GPS, address and route.' },
      ],
      columns: ['Asset ID', 'Asset', 'Format', 'Market', 'Route', 'GPS', 'Status', 'Evidence'],
      rows: data.assets.map(asset => [
        asset.id,
        asset.name,
        `${asset.format} - ${asset.dimensions}`,
        asset.market,
        asset.route,
        `${asset.lat.toFixed(5)}, ${asset.lng.toFixed(5)}`,
        asset.status,
        asset.evidenceStatus,
      ]),
      narrative: [
        'This export is the operating source of truth for OOH inventory and GIS placement.',
        'It is useful for audits, route planning, market filtering and integrating asset master data.',
      ],
      nextActions: [
        'Fill missing GPS, route or market data before assigning field surveys.',
        'Use this report as the baseline for import/export reconciliation with ERP or media booking feeds.',
      ],
    };
  }

  if (reportId === 'installation-sla') {
    const bookedAssets = data.assets.filter(asset => asset.bookedFrom && asset.bookedTo && asset.status !== 'Inactive');
    const installed = bookedAssets.filter(asset => asset.installStatus === 'Installed').length;
    const pendingProof = bookedAssets.filter(asset => asset.evidenceStatus !== 'Ready').length;
    return {
      id: reportId,
      title: definition.title,
      subtitle: 'Booked campaign assets by installation status, proof requirement and next operator action.',
      generatedAt,
      summary: [
        { label: 'Booked assets', value: String(bookedAssets.length), helper: 'Assets currently tied to campaign dates.' },
        { label: 'Installed', value: `${installed}/${Math.max(1, bookedAssets.length)}`, helper: 'Assets marked installed.' },
        { label: 'Pending proof', value: String(pendingProof), helper: 'Booked assets without approved evidence.' },
        { label: 'Rejected proof', value: String(bookedAssets.filter(asset => asset.evidenceStatus === 'Rejected').length), helper: 'Assets needing evidence rework.' },
      ],
      columns: ['Campaign', 'Asset', 'Flight', 'Install', 'Proof SLA', 'Evidence', 'Next action'],
      rows: bookedAssets.map(asset => [
        asset.campaign,
        asset.name,
        assetFlight(asset),
        asset.installStatus,
        asset.proofSla ?? 'Evidence SLA not set',
        asset.evidenceStatus,
        actionState(asset),
      ]),
      narrative: [
        'This report gives campaign operations a single view of booked assets that still need installation or proof closure.',
        'It is designed to reduce missed installation evidence and late proof publishing.',
      ],
      nextActions: [
        'Assign field proof surveys for assets marked missing, pending or rejected.',
        'Resolve install status before the campaign flight starts or client evidence is shared.',
      ],
    };
  }

  const livePages = data.clientPages.filter(page => page.status === 'Live');
  const totalViews = data.clientPages.reduce((sum, page) => sum + (page.viewerCount ?? 0), 0);
  const recentlyViewed = data.clientPages.filter(page => page.lastViewedAt && (Date.now() - Date.parse(page.lastViewedAt)) <= 7 * 86400000).length;
  return {
    id: reportId,
    title: definition.title,
    subtitle: 'Evidence page status, access expiry, client viewing history and export activity.',
    generatedAt,
    summary: [
      { label: 'Live pages', value: String(livePages.length), helper: 'Secure evidence links available.' },
      { label: 'Total views', value: String(totalViews), helper: 'Client page view count across campaigns.' },
      { label: 'Viewed this week', value: String(recentlyViewed), helper: 'Pages opened in the last seven days.' },
      { label: 'Expiring soon', value: String(data.clientPages.filter(page => (daysUntilDate(page.expiresAt) ?? 999) <= 14).length), helper: 'Links expiring in the next 14 days.' },
    ],
    columns: ['Client', 'Campaign', 'Status', 'Last viewed', 'Views', 'Expires', 'Access'],
    rows: data.clientPages.map(page => [
      page.client,
      page.campaign,
      page.status,
      page.lastViewedAt ? formatDateTime(page.lastViewedAt) : 'Not viewed',
      String(page.viewerCount ?? 0),
      formatReportDate(page.expiresAt),
      page.accessState ?? 'Active',
    ]),
    narrative: [
      'This report helps account teams see which clients have evidence access and whether links are being used.',
      'It supports follow-up when pages have not been viewed or are close to expiry.',
    ],
    nextActions: [
      'Resend links for live pages that have not been viewed.',
      'Renew or lock access when page expiry or campaign scope changes.',
    ],
  };
}

function reportCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportReportCsv(report: OOHGeneratedReport) {
  const lines = [
    ['Report', report.title],
    ['Generated', formatDateTime(report.generatedAt)],
    ['Scope', report.subtitle],
    [],
    report.columns,
    ...report.rows,
  ].map(row => row.map(reportCsvCell).join(',')).join('\n');
  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${report.id}-${new Date(report.generatedAt).toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function OOHMap({ assets, submissions, selectedAssetId, onSelect }: { assets: OOHAsset[]; submissions: OOHSubmission[]; selectedAssetId: string; onSelect: (assetId: string) => void }) {
  const center = useMemo<[number, number]>(() => {
    const selected = assets.find(asset => asset.id === selectedAssetId) ?? assets[0];
    return selected ? [selected.lat, selected.lng] : [25.2048, 55.2708];
  }, [assets, selectedAssetId]);
  const readyAssets = assets.filter(asset => asset.evidenceStatus === 'Ready').length;

  return (
    <div className="relative h-[420px] overflow-hidden rounded-lg border border-white/10 bg-[#07111F]">
      <MapContainer center={center} zoom={9} scrollWheelZoom={true} className="h-full w-full ooh-modern-map">
        <TileLayer {...modernMapTiles} />
        {assets.map(asset => {
          const latestInspection = latestInspectionForAsset(asset.id, submissions);
          return (
          <Marker
            key={asset.id}
            position={[asset.lat, asset.lng]}
            icon={createOOHAssetMapIcon(asset, asset.id === selectedAssetId)}
            eventHandlers={{ click: () => onSelect(asset.id) }}
          >
            <Popup className="ooh-asset-popup" maxWidth={320}>
              <AssetMapPopupContent asset={asset} latestInspection={latestInspection} onSelect={onSelect} />
            </Popup>
          </Marker>
        );
        })}
      </MapContainer>
      <div className="absolute left-16 top-4 z-[350] flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#2E7FFF]/35 bg-[#0A1628]/88 px-4 py-2 text-xs font-black text-white shadow-xl backdrop-blur">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /> OOH ASSETS - LIVE
        </div>
        <div className="rounded-full border border-[#2E7FFF]/28 bg-[#0A1628]/84 px-4 py-2 text-xs font-bold text-[#D8E6F8] shadow-lg backdrop-blur">
          All markets
        </div>
      </div>
      <button type="button" className="absolute right-4 top-4 z-[350] inline-flex items-center gap-2 rounded-full border border-[#2E7FFF]/35 bg-[#0A1628]/88 px-4 py-2 text-xs font-black text-white shadow-xl backdrop-blur">
        <Layers3 size={14} className="text-[#8AB8FF]" /> Layers <span className="rounded-full bg-[#2E7FFF]/28 px-2 py-0.5 text-[#9BC5FF]">3</span>
      </button>
      <div className="absolute bottom-4 left-4 z-[350] grid max-w-[560px] grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Assets', String(assets.length)],
          ['Proof ready', `${readyAssets}/${assets.length}`],
          ['Markets', String(new Set(assets.map(asset => asset.market)).size)],
          ['Reviews', String(submissions.filter(submission => submission.status === 'Pending Review').length)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-[108px] rounded-lg border border-[#2E7FFF]/28 bg-[#0A1628]/88 px-3 py-2 text-center shadow-xl backdrop-blur">
            <p className="text-lg font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function teamMarkerColor(status: string): string {
  if (status === 'Overdue' || status === 'Rejected') return '#f87171';
  if (status === 'Submitted') return '#fbbf24';
  if (status === 'In Progress') return '#38bdf8';
  return '#7EB8F7';
}

interface DispatchOffice {
  name: string;
  address: string;
  position: [number, number];
}

function dispatchOfficeFor(anchor: OOHAsset | undefined): DispatchOffice {
  if (anchor?.market === 'Abu Dhabi') {
    return {
      name: 'OOH Assets Head Office - Abu Dhabi',
      address: 'Al Danah operations desk, Abu Dhabi',
      position: [24.4539, 54.3773],
    };
  }

  if (anchor?.market === 'Sharjah') {
    return {
      name: 'OOH Assets Head Office - Northern Emirates',
      address: 'Al Majaz operations desk, Sharjah',
      position: [25.3272, 55.3898],
    };
  }

  return {
    name: 'OOH Assets Head Office - Dubai',
    address: 'Business Bay dispatch desk, Dubai',
    position: [25.2048, 55.2708],
  };
}

function teamStagingPosition(assignment: OOHBootstrap['assignments'][number], anchor: OOHAsset | undefined, index: number): [number, number] {
  void assignment;
  void index;
  return dispatchOfficeFor(anchor).position;
}

function missionDepartureLabel(assignment: OOHBootstrap['assignments'][number], index: number): string {
  const departure = Number.isFinite(Date.parse(assignment.dueDate)) ? new Date(assignment.dueDate) : new Date();
  departure.setHours(7 + Math.min(index, 3), index % 2 ? 45 : 20, 0, 0);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(departure);
}

function LiveOperationsGisPanel({
  assets,
  assignments,
  submissions,
  selectedAssetId,
  onSelectAsset,
  onOpenGIS,
  onOpenAssets,
  onOpenSurveys,
  onOpenEvidence,
  onOpenObligations,
}: {
  assets: OOHAsset[];
  assignments: OOHBootstrap['assignments'];
  submissions: OOHSubmission[];
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
  onOpenGIS: () => void;
  onOpenAssets: () => void;
  onOpenSurveys: () => void;
  onOpenEvidence: () => void;
  onOpenObligations: () => void;
}) {
  const center = useMemo<[number, number]>(() => {
    const selected = assets.find(asset => asset.id === selectedAssetId) ?? assets[0];
    return selected ? [selected.lat, selected.lng] : [25.2048, 55.2708];
  }, [assets, selectedAssetId]);
  const [teamMissionMapOpen, setTeamMissionMapOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState({ assets: true, crews: true, routes: true, hotspots: true });
  const [missionTick, setMissionTick] = useState(0);
  const metricsUpdatedAt = useMemo(() => new Date().toISOString(), [assets, assignments, submissions]);
  const now = Date.now();
  const activeAssignments = assignments.filter(assignment => ['Active', 'In Progress', 'Submitted', 'Overdue'].includes(assignment.status));
  const proofGapAssets = assets.filter(asset => asset.evidenceStatus !== 'Ready');
  const permitAttentionAssets = assets.filter(asset => ['Pending', 'Expiring', 'Expired'].includes(asset.permitStatus));
  const surveyDueAssets = assets.filter(asset => !Number.isFinite(Date.parse(asset.nextSurveyDue)) || Date.parse(asset.nextSurveyDue) <= now + 3 * 86400000);
  const reviewQueue = submissions.filter(submission => submission.status === 'Pending Review');
  const readyAssets = assets.filter(asset => asset.evidenceStatus === 'Ready');
  const avgHealth = Math.round(assets.reduce((sum, asset) => sum + asset.healthScore, 0) / Math.max(1, assets.length));
  const teamRows = activeAssignments.map((assignment, index) => {
    const targetAssets = assets.filter(asset => assignment.assetIds.includes(asset.id));
    const anchor = targetAssets[0] ?? assets[index % Math.max(1, assets.length)];
    const dispatchOffice = dispatchOfficeFor(anchor);
    const position = teamStagingPosition(assignment, anchor, index);
    return {
      assignment,
      targetAssets,
      anchor,
      dispatchOffice,
      position,
      departureAt: missionDepartureLabel(assignment, index),
      blockers: targetAssets.filter(assetNeedsAction).length,
    };
  });
  useEffect(() => {
    if (!teamMissionMapOpen) return undefined;
    const interval = window.setInterval(() => setMissionTick(current => current + 1), 1100);
    return () => window.clearInterval(interval);
  }, [teamMissionMapOpen]);

  const missionRows = teamRows.map((row, index) => {
    const route = missionRouteFor(row.assignment.team, row.position, row.anchor);
    const baseProgress = Math.max(7, Math.min(92, row.assignment.progress || 10));
    const liveProgress = ((baseProgress + missionTick * (0.48 + index * 0.16) + index * 11) % 94) / 100;
    const movingPosition = pointAlongRoute(route, liveProgress);
    const routeKm = routeDistanceKm(route);
    const targetLabel = row.anchor ? missionStreetLabel(row.anchor) : 'Route target';
    return {
      ...row,
      route,
      liveProgress,
      movingPosition,
      routeKm,
      etaMinutes: missionEtaMinutes(routeKm, liveProgress, row.blockers),
      gpsAccuracy: row.assignment.status === 'Overdue' ? 11 : row.assignment.status === 'Submitted' ? 4 : 6 + index,
      targetLabel,
      currentStreet: row.anchor?.address.split(',')[0] ?? targetLabel,
    };
  });
  const selectedTeamRow = missionRows.find(row => row.assignment.id === selectedTeamId) ?? missionRows[0];
  const selectedMissionCenter = selectedTeamRow?.route ? routeMidpoint(selectedTeamRow.route) : center;
  const openTeamMissionMap = () => {
    if (!selectedTeamId && teamRows[0]) {
      setSelectedTeamId(teamRows[0].assignment.id);
    }
    setTeamMissionMapOpen(true);
  };
  const toggleMapLayer = (key: keyof typeof mapLayers) => {
    setMapLayers(current => ({ ...current, [key]: !current[key] }));
  };
  const activeLayerCount = Object.values(mapLayers).filter(Boolean).length;
  const actionAssets = assets.filter(assetNeedsAction).slice(0, 4);
  const summaryCards = [
    { label: 'Assets', value: String(assets.length), detail: 'Registered OOH units', action: onOpenAssets, actionLabel: 'Open asset register', icon: Building2, tone: 'blue' },
    { label: 'Field Teams', value: String(teamRows.length), detail: 'Active survey crews', action: openTeamMissionMap, actionLabel: 'Open mission map', icon: Users, tone: 'violet' },
    { label: 'Proof Gaps', value: String(proofGapAssets.length), detail: 'Need review or capture', action: proofGapAssets.length ? onOpenEvidence : onOpenGIS, actionLabel: proofGapAssets.length ? 'Review proof gaps' : 'Open GIS', icon: Camera, tone: 'red' },
    { label: 'Permit Watch', value: String(permitAttentionAssets.length), detail: 'Needs compliance action', action: () => {
      const target = permitAttentionAssets[0];
      if (target) onSelectAsset(target.id);
      onOpenObligations();
    }, actionLabel: 'Open obligations', icon: ShieldCheck, tone: 'amber' },
  ];

  return (
    <section className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">Live GIS operations</p>
          <h2 className="mt-1 text-xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Network map, crews and action hotspots</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#9DB4D0]">See every OOH asset with proof, permit, campaign and field-team status in one operating layer.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-sm font-black text-blue-100 hover:bg-blue-400/15" onClick={onOpenGIS}>Open GIS</button>
          <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10" onClick={onOpenSurveys}>Survey Queue</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(card => {
          const CardIcon = card.icon;
          const toneClass = {
            blue: 'border-blue-300/20 bg-blue-400/10 text-blue-100',
            violet: 'border-violet-300/20 bg-violet-400/10 text-violet-100',
            red: 'border-red-300/20 bg-red-400/10 text-red-100',
            amber: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
          }[card.tone];
          return (
            <button
              key={card.label}
              type="button"
              className="group min-h-[132px] rounded-lg border border-white/10 bg-[#07111F] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#7EB8F7]/55 hover:bg-[#102343] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7EB8F7]"
              onClick={card.action}
              aria-label={card.actionLabel}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${toneClass}`}>
                  <CardIcon size={18} />
                </div>
                <ExternalLink size={14} className="text-[#7EB8F7] opacity-80 transition group-hover:opacity-100" />
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{card.label}</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="text-3xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{card.value}</p>
                <span className="text-[11px] font-black text-[#7EB8F7]">{card.actionLabel}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{card.detail}</p>
              <MetricTimestamp updatedAt={metricsUpdatedAt} />
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_420px]">
        <div className="relative h-[520px] overflow-hidden rounded-lg border border-blue-300/20 bg-[#07111F] xl:h-[560px]">
          <MapContainer center={center} zoom={9} scrollWheelZoom={true} className="h-full w-full ooh-modern-map">
            <TileLayer {...modernMapTiles} />
            {mapLayers.hotspots && proofGapAssets.map(asset => (
              <CircleMarker
                key={`hotspot-${asset.id}`}
                center={[asset.lat, asset.lng]}
                radius={24}
                pathOptions={{ color: markerColor(asset), fillColor: markerColor(asset), fillOpacity: 0.1, weight: 1.5, dashArray: '5 7' }}
              />
            ))}
            {mapLayers.assets && assets.map(asset => (
              <Marker
                key={asset.id}
                position={[asset.lat, asset.lng]}
                icon={createOOHAssetMapIcon(asset, asset.id === selectedAssetId)}
                eventHandlers={{ click: () => onSelectAsset(asset.id) }}
              >
                <Popup className="ooh-asset-popup" maxWidth={320}>
                  <AssetMapPopupContent asset={asset} onSelect={onSelectAsset} contextLabel="Network asset" />
                </Popup>
              </Marker>
            ))}
            {mapLayers.routes && missionRows.map(row => row.anchor && (
              <Polyline key={`${row.assignment.id}-route`} positions={row.route} pathOptions={{ color: teamMarkerColor(row.assignment.status), dashArray: '6 8', opacity: 0.72, weight: 2.5 }} />
            ))}
            {mapLayers.crews && missionRows.map(row => (
              <Marker
                key={row.assignment.id}
                position={row.movingPosition}
                icon={createMissionCrewIcon(row.assignment.team, row.assignment.status)}
              >
                <Popup>
                  <div className="w-72 p-3 text-left">
                    <span className="block text-xs font-black uppercase tracking-wide text-[#7A94B4]">Field team</span>
                    <strong className="mt-1 block text-sm text-[#EEF3FA]">{row.assignment.team}</strong>
                    <p className="mt-1 text-xs text-[#B8C7DB]">{row.assignment.name}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">Progress <strong className="block text-white">{row.assignment.progress}%</strong></div>
                      <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">Due <strong className="block text-white">{formatDate(row.assignment.dueDate)}</strong></div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <div className="absolute left-16 top-4 z-[350] flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#2E7FFF]/35 bg-[#0A1628]/88 px-4 py-2 text-xs font-black text-white shadow-xl backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /> ALL OOH ASSETS - LIVE
            </div>
            <div className="rounded-full border border-[#2E7FFF]/28 bg-[#0A1628]/84 px-4 py-2 text-xs font-bold text-[#D8E6F8] shadow-lg backdrop-blur">
              Market: All
            </div>
          </div>
          <button type="button" className="absolute right-4 top-4 z-[350] inline-flex items-center gap-2 rounded-full border border-[#2E7FFF]/35 bg-[#0A1628]/88 px-4 py-2 text-xs font-black text-white shadow-xl backdrop-blur" onClick={() => setLayerPanelOpen(current => !current)}>
            <Layers3 size={14} className="text-[#8AB8FF]" /> Layers <span className="rounded-full bg-[#2E7FFF]/28 px-2 py-0.5 text-[#9BC5FF]">{activeLayerCount}</span>
          </button>
          {layerPanelOpen && (
            <div className="absolute right-4 top-16 z-[350] grid w-[230px] grid-cols-2 gap-2 rounded-lg border border-[#2E7FFF]/28 bg-[#06101E]/94 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
              {([
                ['assets', 'Assets', '#38d399'],
                ['crews', 'Crews', '#7EB8F7'],
                ['routes', 'Routes', '#38bdf8'],
                ['hotspots', 'Hotspots', '#f87171'],
              ] as Array<[keyof typeof mapLayers, string, string]>).map(([key, label, color]) => (
                <button
                  key={key}
                  type="button"
                  className={`flex min-h-[34px] items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[10px] font-black transition ${
                    mapLayers[key]
                      ? 'border-current bg-white/8 text-white'
                      : 'border-white/10 bg-[#0A1628]/82 text-[#7A94B4] hover:text-white'
                  }`}
                  style={mapLayers[key] ? { color, borderColor: `${color}88` } : undefined}
                  onClick={() => toggleMapLayer(key)}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="absolute bottom-4 left-4 z-[350] grid max-w-[640px] grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Assets', String(assets.length)],
              ['Crews', String(teamRows.length)],
              ['Proof ready', `${readyAssets.length}/${assets.length}`],
              ['Health', `${avgHealth}%`],
            ].map(([label, value]) => (
              <div key={label} className="min-w-[116px] rounded-lg border border-[#2E7FFF]/28 bg-[#0A1628]/88 px-3 py-2 text-center shadow-xl backdrop-blur">
                <p className="text-lg font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
              </div>
            ))}
          </div>
          <div className="absolute bottom-4 right-4 z-[350] flex max-w-[360px] flex-wrap gap-2 rounded-lg border border-white/10 bg-[#07111F]/88 p-2 text-[11px] font-bold text-[#B8C7DB] shadow-xl backdrop-blur">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />Ready assets</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-300" />Needs proof</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-300" />Issue</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-300" />Field team</span>
          </div>
        </div>

        <div className="grid gap-3 xl:h-[560px] xl:grid-rows-[minmax(0,1fr)_auto]">
          <div className="min-h-0 overflow-hidden rounded-lg border border-white/10 bg-[#07111F] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7A94B4]">Teams on field</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[#B8C7DB]">{surveyDueAssets.length} survey target{surveyDueAssets.length === 1 ? '' : 's'}</span>
            </div>
            <div className="custom-scrollbar mt-3 h-[286px] space-y-2 overflow-y-auto pr-1 xl:h-[330px]">
              {teamRows.map(row => (
                <button
                  key={row.assignment.id}
                  type="button"
                  className="w-full rounded-lg border border-white/10 bg-[#0B172A] p-3 text-left transition hover:border-[#7EB8F7]/45 hover:bg-[#102343]"
                  onClick={() => {
                    if (row.anchor) onSelectAsset(row.anchor.id);
                    onOpenSurveys();
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-white">{row.assignment.team}</p>
                      <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{row.targetAssets.map(asset => asset.name).join(', ')}</p>
                    </div>
                    <Pill>{row.assignment.status}</Pill>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[#2E7FFF]" style={{ width: `${Math.min(100, Math.max(0, row.assignment.progress))}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-[#7EB8F7]">{row.assignment.progress}% complete - due {formatDate(row.assignment.dueDate)} - {row.blockers} blocker{row.blockers === 1 ? '' : 's'}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#07111F] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7A94B4]">Action hotspots</p>
              <button type="button" className="text-xs font-black text-[#7EB8F7]" onClick={reviewQueue.length ? onOpenEvidence : onOpenGIS}>{reviewQueue.length ? 'Review proof' : 'Open map'}</button>
            </div>
            <div className="mt-3 grid gap-2">
              {actionAssets.map(asset => (
                <button
                  key={asset.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-left transition hover:border-[#7EB8F7]/45"
                  onClick={() => {
                    onSelectAsset(asset.id);
                    onOpenGIS();
                  }}
                >
                  <div>
                    <p className="text-sm font-black text-white">{asset.name}</p>
                    <p className="mt-1 text-xs text-[#9DB4D0]">{asset.market} - {actionState(asset)}</p>
                  </div>
                  <ExternalLink size={14} className="shrink-0 text-[#7EB8F7]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {teamMissionMapOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onClick={() => setTeamMissionMapOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="field-team-mission-map-title"
            className="max-h-[92vh] w-full max-w-[1480px] overflow-hidden rounded-lg border border-[#24476F] bg-[#081426] shadow-2xl shadow-black/50"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#0A1628]/95 p-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">Field operations control</p>
                <h3 id="field-team-mission-map-title" className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Live crew dispatch and mission status</h3>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-[#9DB4D0]">Monitor field teams against assigned OOH assets, route progress, inspection blockers and the next action required from operations.</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 font-black text-emerald-100"><span className="h-2 w-2 rounded-full bg-emerald-300" />GPS stream active</span>
                  <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 font-black text-blue-100">Street-level mission view</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-bold text-[#B8C7DB]">{missionRows.length} active crew{missionRows.length === 1 ? '' : 's'}</span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close field team mission map"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#B8C7DB] hover:bg-white/10 hover:text-white"
                onClick={() => setTeamMissionMapOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-white/10 bg-[#07111F] px-5 py-3">
              <div className="grid gap-2 md:grid-cols-3">
                {missionRows.map(row => (
                  <button
                    key={`mission-strip-${row.assignment.id}`}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left transition ${selectedTeamRow?.assignment.id === row.assignment.id ? 'border-[#7EB8F7] bg-[#102343]' : 'border-white/10 bg-[#0B172A] hover:border-[#7EB8F7]/45'}`}
                    onClick={() => setSelectedTeamId(row.assignment.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-white">{row.assignment.team}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#B8C7DB]">{row.assignment.status}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[#9DB4D0]">{row.anchor?.name ?? row.assignment.name}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid max-h-[calc(92vh-188px)] gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1.45fr)_400px]">
              <div className="relative h-[600px] overflow-hidden rounded-lg border border-[#24476F] bg-[#07111F]">
                <MapContainer center={selectedMissionCenter} zoom={14} scrollWheelZoom={true} className="h-full w-full ooh-modern-map">
                  <MissionMapFocus center={selectedMissionCenter} zoom={14} />
                  <TileLayer {...modernMapTiles} />
                  {missionRows.map(row => row.anchor && (
                    <MissionRoutePolyline
                      key={`${row.assignment.id}-mission-route`}
                      positions={row.route}
                      selected={selectedTeamRow?.assignment.id === row.assignment.id}
                    />
                  ))}
                  {missionRows.map(row => (
                    <Marker
                      key={`mission-start-${row.assignment.id}`}
                      position={row.route[0]}
                      icon={createMissionStartIcon(selectedTeamRow?.assignment.id === row.assignment.id)}
                      eventHandlers={{ click: () => setSelectedTeamId(row.assignment.id) }}
                    >
                      <Popup className="ooh-dispatch-popup" maxWidth={360}>
                        <div className="w-[380px] overflow-hidden text-left">
                          <div className="border-b border-white/10 bg-[#102343]/72 px-3 py-2 pr-10">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7EB8F7]">Head office dispatch</span>
                              <Pill>{row.assignment.status}</Pill>
                            </div>
                            <h4 className="mt-1.5 truncate text-sm font-black text-white">{row.dispatchOffice.name}</h4>
                            <p className="mt-0.5 truncate text-[11px] text-[#9DB4D0]">{row.dispatchOffice.address}</p>
                          </div>

                          <div className="px-3 py-2.5">
                            <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11px] leading-4">
                              <span className="font-black uppercase tracking-wide text-[#7A94B4]">Departure</span>
                              <span className="font-black text-white">{row.departureAt}</span>
                              <span className="font-black uppercase tracking-wide text-[#7A94B4]">ETA / Route</span>
                              <span className="font-black text-white">{row.etaMinutes} min / {row.routeKm.toFixed(1)} km</span>
                              <span className="font-black uppercase tracking-wide text-[#7A94B4]">Team</span>
                              <span className="truncate font-bold text-[#DCE8F6]">{row.assignment.team}</span>
                              <span className="font-black uppercase tracking-wide text-[#7A94B4]">Target</span>
                              <span className="truncate font-bold text-[#DCE8F6]">{row.targetAssets.map(asset => asset.name).join(', ')}</span>
                              <span className="font-black uppercase tracking-wide text-[#7A94B4]">Mission</span>
                              <span className="truncate font-bold text-white">{row.assignment.name}</span>
                              <span className="font-black uppercase tracking-wide text-[#7A94B4]">Next action</span>
                              <span className="truncate font-black text-[#7EB8F7]">{row.blockers > 0 ? 'Track blocker clearance' : 'Monitor evidence sync'}</span>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  {missionRows.flatMap(row => row.targetAssets.map(asset => ({ asset, assignmentId: row.assignment.id }))).map(({ asset, assignmentId }) => (
                    <Marker
                      key={`mission-asset-${asset.id}`}
                      position={[asset.lat, asset.lng]}
                      icon={createMissionTargetIcon(asset, selectedTeamRow?.assignment.id === assignmentId || selectedAssetId === asset.id)}
                      eventHandlers={{ click: () => onSelectAsset(asset.id) }}
                    >
                      <Popup className="ooh-asset-popup" maxWidth={320}>
                        <AssetMapPopupContent asset={asset} onSelect={onSelectAsset} contextLabel="Assigned asset" />
                      </Popup>
                    </Marker>
                  ))}
                  {missionRows.map(row => (
                    <Marker
                      key={`mission-team-${row.assignment.id}`}
                      position={row.movingPosition}
                      icon={createMissionCrewIcon(row.assignment.team, row.assignment.status, selectedTeamRow?.assignment.id === row.assignment.id)}
                      eventHandlers={{ click: () => setSelectedTeamId(row.assignment.id) }}
                    >
                      <Popup>
                        <div className="w-72 p-3 text-left">
                          <span className="block text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Live crew</span>
                          <strong className="mt-1 block text-sm text-[#EEF3FA]">{row.assignment.team}</strong>
                          <p className="mt-1 text-xs leading-5 text-[#B8C7DB]">{row.assignment.name}</p>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">ETA <strong className="block text-white">{row.etaMinutes}m</strong></div>
                            <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">GPS <strong className="block text-white">{row.gpsAccuracy}m</strong></div>
                            <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">Route <strong className="block text-white">{Math.round(row.liveProgress * 100)}%</strong></div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
                <div className="absolute left-16 top-4 z-[350] w-[min(460px,calc(100%-128px))] rounded-lg border border-[#24476F] bg-[#081426]/92 p-3 shadow-xl backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">Mission corridor</p>
                      <p className="mt-1 truncate text-sm font-black text-white">{selectedTeamRow ? selectedTeamRow.assignment.team : 'No active crew'}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100">Live</span>
                  </div>
                  <p className="mt-2 truncate text-xs text-[#9DB4D0]">{selectedTeamRow ? `${selectedTeamRow.targetLabel} - ${selectedTeamRow.anchor?.name ?? 'Target asset'}` : 'Mission routing'}</p>
                </div>
                <div className="absolute right-4 top-4 z-[350] rounded-lg border border-[#24476F] bg-[#081426]/92 px-3 py-2 text-right shadow-xl backdrop-blur">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Last signal</p>
                  <p className="text-xs font-black text-white">12 sec ago</p>
                  <p className="mt-1 text-[10px] font-bold text-[#7EB8F7]">Zoom controls enabled</p>
                </div>
                <div className="absolute bottom-4 left-4 right-4 z-[350] grid gap-2 md:grid-cols-4">
                  {[
                    ['Selected crew', selectedTeamRow?.assignment.team ?? 'No crew'],
                    ['ETA', selectedTeamRow ? `${selectedTeamRow.etaMinutes} min` : '--'],
                    ['GPS accuracy', selectedTeamRow ? `+/- ${selectedTeamRow.gpsAccuracy}m` : '--'],
                    ['Route progress', selectedTeamRow ? `${Math.round(selectedTeamRow.liveProgress * 100)}%` : '--'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[#24476F] bg-[#081426]/92 px-3 py-2 shadow-xl backdrop-blur">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
                      <p className="mt-0.5 truncate text-sm font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="custom-scrollbar max-h-[600px] space-y-3 overflow-y-auto pr-1">
                {selectedTeamRow ? (
                  <div className="rounded-lg border border-[#24476F] bg-[#07111F] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Mission control</p>
                        <h4 className="mt-1 text-xl font-black text-white">{selectedTeamRow.assignment.team}</h4>
                        <p className="mt-1 text-sm leading-6 text-[#9DB4D0]">{selectedTeamRow.assignment.name}</p>
                      </div>
                      <Pill>{selectedTeamRow.assignment.status}</Pill>
                    </div>
                    <div className="mt-4 rounded-lg border border-[#24476F] bg-[#0B172A] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Current route segment</p>
                          <p className="mt-1 text-base font-black text-white">{selectedTeamRow.currentStreet}</p>
                          <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">Next stop: {selectedTeamRow.targetLabel}</p>
                        </div>
                        <div className="rounded-lg border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-right">
                          <p className="text-[10px] font-black uppercase tracking-wide text-blue-100">ETA</p>
                          <p className="text-lg font-black text-white">{selectedTeamRow.etaMinutes}m</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">GPS</p>
                        <p className="mt-1 text-base font-black text-white">+/- {selectedTeamRow.gpsAccuracy}m</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Assets</p>
                        <p className="mt-1 text-base font-black text-white">{selectedTeamRow.targetAssets.length}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Blockers</p>
                        <p className="mt-1 text-base font-black text-white">{selectedTeamRow.blockers}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs font-bold text-[#9DB4D0]">
                        <span>Live route progress</span>
                        <span>{Math.round(selectedTeamRow.liveProgress * 100)}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[#7EB8F7]" style={{ width: `${Math.round(selectedTeamRow.liveProgress * 100)}%` }} />
                      </div>
                      <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-amber-100">Operational issue</p>
                        <p className="mt-1 text-xs leading-5 text-[#FDECC8]">{selectedTeamRow.blockers > 0 ? 'This mission has unresolved proof, permit or inspection blockers. Keep the route visible until the crew clears the target asset.' : 'No blockers on the selected route. Keep monitoring ETA and evidence sync.'}</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {selectedTeamRow.targetAssets.map(asset => (
                        <button
                          key={asset.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-left hover:border-[#7EB8F7]/45"
                          onClick={() => onSelectAsset(asset.id)}
                        >
                          <span>
                            <span className="block text-sm font-black text-white">{asset.name}</span>
                            <span className="text-xs text-[#9DB4D0]">{asset.market} - {actionState(asset)} - {missionStreetLabel(asset)}</span>
                          </span>
                          <Pill>{asset.evidenceStatus}</Pill>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]"
                      onClick={() => {
                        setTeamMissionMapOpen(false);
                        onOpenSurveys();
                      }}
                    >
                      Open Survey Assignment <ExternalLink size={14} />
                    </button>
                    {selectedTeamRow.anchor && (
                      <button
                        type="button"
                        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#2E7FFF]/30 bg-[#102343] px-3 py-2 text-sm font-black text-blue-100 hover:bg-[#17315A]"
                        onClick={() => {
                          onSelectAsset(selectedTeamRow.anchor.id);
                          setTeamMissionMapOpen(false);
                          onOpenGIS();
                        }}
                      >
                        Open Target Asset <ExternalLink size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-[#07111F] p-4 text-sm text-[#9DB4D0]">No active team missions.</div>
                )}

                <div className="rounded-lg border border-[#24476F] bg-[#07111F] p-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Active crews</p>
                  <div className="mt-3 space-y-2">
                    {missionRows.map(row => (
                      <button
                        key={`team-list-${row.assignment.id}`}
                        type="button"
                        className={`w-full rounded-lg border p-3 text-left transition ${selectedTeamRow?.assignment.id === row.assignment.id ? 'border-[#7EB8F7] bg-[#102343]' : 'border-white/10 bg-[#0B172A] hover:border-[#7EB8F7]/45'}`}
                        onClick={() => setSelectedTeamId(row.assignment.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-sm font-black text-white">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: teamMarkerColor(row.assignment.status), boxShadow: `0 0 14px ${teamMarkerColor(row.assignment.status)}AA` }} />
                            {row.assignment.team}
                          </span>
                          <span className="text-xs font-bold text-[#7EB8F7]">{row.etaMinutes}m ETA</span>
                        </div>
                        <p className="mt-1 text-xs text-[#9DB4D0]">{row.targetAssets.map(asset => asset.name).join(', ')}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-[#7EB8F7]" style={{ width: `${Math.round(row.liveProgress * 100)}%` }} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type OOHVendorRisk = 'Preferred' | 'Watchlist' | 'Action Needed';
type OOHVendorTrend = 'up' | 'steady' | 'down';
type OOHVendorFilter = 'copilot' | 'all' | 'install' | 'survey' | 'compliance' | 'dooh' | 'watchlist';
type OOHVendorAction = 'rfq' | 'compare' | 'background' | 'action';

interface OOHVendorPartner {
  id: string;
  name: string;
  category: string;
  role: string;
  owner: string;
  markets: string[];
  services: string[];
  score: number;
  risk: OOHVendorRisk;
  trend: OOHVendorTrend;
  evidenceAcceptance: number;
  fieldCompletion: number;
  proofSla: number;
  permitReadiness: number;
  complianceDocs: number;
  activeScopes: number;
  linkedAssetIds: string[];
  blockers: string[];
  strengths: string[];
  lastSync: string;
  nextAction: string;
}

function deriveVendorRisk(score: number, blockers: string[]): OOHVendorRisk {
  if (score >= 90 && blockers.length === 0) return 'Preferred';
  if (score < 78 || blockers.length > 1) return 'Action Needed';
  return 'Watchlist';
}

function buildPartner(
  partner: Omit<OOHVendorPartner, 'score' | 'risk'>,
): OOHVendorPartner {
  const score = Math.round(
    partner.evidenceAcceptance * 0.28
    + partner.fieldCompletion * 0.24
    + partner.proofSla * 0.18
    + partner.permitReadiness * 0.16
    + partner.complianceDocs * 0.14,
  );
  return { ...partner, score, risk: deriveVendorRisk(score, partner.blockers) };
}

function buildOOHVendorPartners(assets: OOHAsset[], assignments: OOHBootstrap['assignments'], submissions: OOHSubmission[]): OOHVendorPartner[] {
  const assignmentAssets = (assignmentId: string) => {
    const assignment = assignments.find(item => item.id === assignmentId);
    return assignment ? assignment.assetIds : [];
  };
  const submittedAssetIds = new Set(submissions.map(submission => submission.assetId));
  const proofBlockedAssets = assets.filter(asset => asset.evidenceStatus === 'Rejected' || asset.evidenceStatus === 'Missing');
  const permitAttentionAssets = assets.filter(asset => ['Pending', 'Expiring', 'Expired'].includes(asset.permitStatus));
  const digitalAssets = assets.filter(asset => asset.format.toLowerCase().includes('digital') || asset.playerStatus !== 'Not Installed');

  return [
    buildPartner({
      id: 'ooh-vendor-falcon',
      name: 'Falcon Field Team',
      category: 'Installation evidence',
      role: 'In-house proof and posting inspection crew',
      owner: 'Maya Haddad',
      markets: ['Dubai'],
      services: ['QR verification', 'GPS lock', 'Photo evidence', 'Client proof packs'],
      evidenceAcceptance: 92,
      fieldCompletion: assignments.find(item => item.team === 'Falcon Field Team')?.progress ?? 88,
      proofSla: 94,
      permitReadiness: 96,
      complianceDocs: 100,
      activeScopes: assignments.filter(item => item.team === 'Falcon Field Team').length,
      linkedAssetIds: assignmentAssets('ASG-OOH-1001'),
      blockers: submittedAssetIds.has('OOH-DXB-MALL-014') ? ['Dubai Mall digital screen has one pending proof angle'] : [],
      strengths: ['Fast QR/GPS capture', 'Strong reviewer handoff', 'Reliable proof metadata'],
      lastSync: '4 min ago',
      nextAction: 'Clear the pending close-up photo requirement and publish only approved proof.',
      trend: 'up',
    }),
    buildPartner({
      id: 'ooh-vendor-capital',
      name: 'Capital Survey Crew',
      category: 'Permit and readiness surveys',
      role: 'Abu Dhabi field survey partner',
      owner: 'Omar Nasser',
      markets: ['Abu Dhabi'],
      services: ['Permit readiness', 'Install condition checks', 'Route access notes'],
      evidenceAcceptance: 78,
      fieldCompletion: assignments.find(item => item.team === 'Capital Survey Crew')?.progress ?? 0,
      proofSla: 72,
      permitReadiness: 68,
      complianceDocs: 88,
      activeScopes: assignments.filter(item => item.team === 'Capital Survey Crew').length,
      linkedAssetIds: assignmentAssets('ASG-OOH-1002'),
      blockers: ['Corniche bridge banner proof is missing', 'Permit expiry needs follow-up'],
      strengths: ['Local route access knowledge', 'Strong permit document handling'],
      lastSync: '12 min ago',
      nextAction: 'Confirm access window, capture missing proof, and attach permit follow-up before client sharing.',
      trend: 'steady',
    }),
    buildPartner({
      id: 'ooh-vendor-coastal',
      name: 'Coastal QA Team',
      category: 'Large-format rework',
      role: 'Wall wrap and vinyl inspection specialist',
      owner: 'Rana Saleh',
      markets: ['Dubai'],
      services: ['Vinyl condition review', 'Angle photos', 'Rework verification', 'Signature capture'],
      evidenceAcceptance: 62,
      fieldCompletion: assignments.find(item => item.team === 'Coastal QA Team')?.progress ?? 25,
      proofSla: 66,
      permitReadiness: 74,
      complianceDocs: 82,
      activeScopes: assignments.filter(item => item.team === 'Coastal QA Team').length,
      linkedAssetIds: assignmentAssets('ASG-OOH-1003'),
      blockers: ['JBR wall wrap proof was rejected', 'Re-inspection is overdue'],
      strengths: ['Large-format install experience', 'Good exception detail when submitted'],
      lastSync: '18 min ago',
      nextAction: 'Send a rework checklist with required wide, close-up and angle photos.',
      trend: 'down',
    }),
    buildPartner({
      id: 'ooh-vendor-permitpath',
      name: 'PermitPath Services',
      category: 'Permit and NOC management',
      role: 'Authority document and expiry control partner',
      owner: 'Leila Mansour',
      markets: ['Dubai', 'Abu Dhabi', 'Sharjah'],
      services: ['Permit expiry tracking', 'NOC pack readiness', 'Municipality submission support'],
      evidenceAcceptance: 84,
      fieldCompletion: 86,
      proofSla: 80,
      permitReadiness: Math.max(58, 100 - permitAttentionAssets.length * 14),
      complianceDocs: 92,
      activeScopes: permitAttentionAssets.length,
      linkedAssetIds: permitAttentionAssets.map(asset => asset.id),
      blockers: permitAttentionAssets.map(asset => `${asset.name} permit is ${asset.permitStatus.toLowerCase()}`).slice(0, 3),
      strengths: ['Clear expiry register', 'Good document traceability'],
      lastSync: '21 min ago',
      nextAction: 'Resolve pending and expiring permits before assigning new installation activity.',
      trend: permitAttentionAssets.length > 1 ? 'down' : 'steady',
    }),
    buildPartner({
      id: 'ooh-vendor-lumiplay',
      name: 'LumiPlay Technical',
      category: 'DOOH player support',
      role: 'Digital screen power, player and uptime support',
      owner: 'Nabil Farouq',
      markets: ['Dubai'],
      services: ['Player uptime checks', 'Power status', 'Playback readiness', 'Remote diagnostics'],
      evidenceAcceptance: 95,
      fieldCompletion: 93,
      proofSla: 91,
      permitReadiness: 96,
      complianceDocs: 94,
      activeScopes: digitalAssets.length,
      linkedAssetIds: digitalAssets.map(asset => asset.id),
      blockers: digitalAssets.filter(asset => asset.playerStatus === 'Offline' || asset.powerStatus === 'Offline').map(asset => `${asset.name} player or power attention`),
      strengths: ['Strong uptime reporting', 'Fast technical triage', 'Clear player metadata'],
      lastSync: '8 min ago',
      nextAction: 'Keep daily player readiness checks attached to active DOOH campaign assets.',
      trend: 'up',
    }),
    buildPartner({
      id: 'ooh-vendor-urbanfabric',
      name: 'UrbanFabric Installers',
      category: 'Street furniture installs',
      role: 'Bus shelter, totem and street furniture field partner',
      owner: 'Samir Patel',
      markets: ['Dubai', 'Sharjah'],
      services: ['Shelter install checks', 'Furniture condition', 'Night illumination', 'Safety inspection'],
      evidenceAcceptance: 88,
      fieldCompletion: 90,
      proofSla: 86,
      permitReadiness: 90,
      complianceDocs: 89,
      activeScopes: assets.filter(asset => asset.format.toLowerCase().includes('shelter') || asset.format.toLowerCase().includes('furniture')).length,
      linkedAssetIds: assets.filter(asset => asset.format.toLowerCase().includes('shelter') || asset.format.toLowerCase().includes('furniture')).map(asset => asset.id),
      blockers: proofBlockedAssets.filter(asset => asset.format.toLowerCase().includes('shelter') || asset.format.toLowerCase().includes('furniture')).map(asset => `${asset.name} proof requires attention`),
      strengths: ['Good street furniture coverage', 'Consistent safety evidence'],
      lastSync: '16 min ago',
      nextAction: 'Maintain recurring shelter and totem inspections with photo evidence by question.',
      trend: 'steady',
    }),
  ];
}

function vendorRiskTone(risk: OOHVendorRisk): string {
  if (risk === 'Preferred') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  if (risk === 'Action Needed') return 'border-red-400/25 bg-red-400/10 text-red-200';
  return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
}

function vendorTrendLabel(trend: OOHVendorTrend): string {
  if (trend === 'up') return 'Improving';
  if (trend === 'down') return 'Needs attention';
  return 'Stable';
}

function OOHVendorIntelligence({
  data,
  onOpenAssets,
  onOpenSurveys,
  onOpenEvidence,
  onOpenGIS,
  onSelectAsset,
}: {
  data: OOHBootstrap;
  onOpenAssets: () => void;
  onOpenSurveys: () => void;
  onOpenEvidence: () => void;
  onOpenGIS: () => void;
  onSelectAsset: (assetId: string) => void;
}) {
  const partners = useMemo(() => buildOOHVendorPartners(data.assets, data.assignments, data.submissions), [data.assets, data.assignments, data.submissions]);
  const metricsUpdatedAt = useMemo(() => new Date().toISOString(), [partners]);
  const [filter, setFilter] = useState<OOHVendorFilter>('copilot');
  const [selectedPartnerId, setSelectedPartnerId] = useState(partners[0]?.id ?? '');
  const [activeAction, setActiveAction] = useState<OOHVendorAction>('action');
  const selectedPartner = partners.find(partner => partner.id === selectedPartnerId) ?? partners.find(partner => partner.risk === 'Action Needed') ?? partners[0];
  const filteredPartners = partners.filter(partner => {
    if (filter === 'all' || filter === 'copilot') return true;
    if (filter === 'install') return partner.category.toLowerCase().includes('install') || partner.category.toLowerCase().includes('format');
    if (filter === 'survey') return partner.category.toLowerCase().includes('survey') || partner.services.some(service => service.toLowerCase().includes('photo'));
    if (filter === 'compliance') return partner.category.toLowerCase().includes('permit') || partner.permitReadiness < 80;
    if (filter === 'dooh') return partner.category.toLowerCase().includes('dooh');
    return partner.risk !== 'Preferred';
  });
  const summary = {
    preferred: partners.filter(partner => partner.risk === 'Preferred').length,
    watchlist: partners.filter(partner => partner.risk === 'Watchlist').length,
    actionNeeded: partners.filter(partner => partner.risk === 'Action Needed').length,
    activeScopes: partners.reduce((sum, partner) => sum + partner.activeScopes, 0),
  };
  const actionLabels: Record<OOHVendorAction, { title: string; helper: string; icon: LucideIcon; button: string }> = {
    rfq: { title: 'Write OOH partner scope', helper: 'Installation, survey, permit, evidence and service-level rules.', icon: FileCheck2, button: 'Prepare RFQ scope' },
    compare: { title: 'Compare partner responses', helper: 'Rank vendors by SLA, evidence quality, coverage, compliance and capacity.', icon: BarChart3, button: 'Open response comparison' },
    background: { title: 'Run partner background check', helper: 'Verify licenses, insurance, permit history, references and evidence discipline.', icon: FileSearch, button: 'Open compliance register' },
    action: { title: 'Create recovery action pack', helper: 'Turn blockers into clear owner, field, evidence and approval actions.', icon: BrainCircuit, button: 'Open work queue' },
  };
  const actionConfig = actionLabels[activeAction];
  const actionLines: Record<OOHVendorAction, string[]> = {
    rfq: [
      `Scope target: ${selectedPartner?.category ?? 'OOH partner services'}.`,
      'Require QR verification, GPS accuracy, per-question photo evidence and reviewer-ready submission metadata.',
      'Ask for market coverage, escalation route, crew capacity, insurance, permits/NOC support and sample evidence pack.',
    ],
    compare: [
      `Compare ${selectedPartner?.name ?? 'partners'} against SLA, completion rate, evidence acceptance and compliance readiness.`,
      'Flag missing proof categories, unclear access windows and weak client-publish controls before award.',
      'Shortlist partners that can cover the selected markets without proof gaps.',
    ],
    background: [
      'Check trade license, insurance, safety method statements, municipality/NOC experience and named supervisor.',
      `Confirm current documents for ${selectedPartner?.markets.join(', ') ?? 'all markets'}.`,
      'Block field assignment when required evidence or permit ownership is unclear.',
    ],
    action: [
      selectedPartner?.nextAction ?? 'Open the partner work queue and clear blockers.',
      'Link partner actions to assets, survey assignments, proof review and client evidence publishing.',
      'Keep rejected, missing or stale evidence out of the client page until approved.',
    ],
  };
  const [activityLog, setActivityLog] = useState<string[]>(['Partner copilot is ready for OOH vendor control.']);
  const runAction = (action: OOHVendorAction) => {
    setActiveAction(action);
    const label = actionLabels[action].title;
    setActivityLog(current => [`${label} prepared for ${selectedPartner?.name ?? 'selected partner'}`, ...current.slice(0, 3)]);
  };
  const openActionTarget = () => {
    if (activeAction === 'rfq' || activeAction === 'compare') onOpenSurveys();
    if (activeAction === 'background') onOpenAssets();
    if (activeAction === 'action') onOpenEvidence();
  };

  if (!selectedPartner) return null;

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">OOH vendor intelligence</p>
            <h2 className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Partner control for installs, surveys, permits and DOOH support</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#B8C7DB]">Adapted from the Vendor Intelligence module for OOH operations: monitor partner readiness, evidence quality, compliance documents, field delivery and action blockers without leaving the asset command center.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={onOpenSurveys}>
              <ClipboardCheck size={16} /> Assign Partner
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#E11D2E] px-3 py-2 text-sm font-bold text-white hover:bg-[#ff3445]" onClick={() => runAction('rfq')}>
              <FileCheck2 size={16} /> Partner Scope
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Preferred', String(summary.preferred), 'Ready for repeat assignment', 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'],
            ['Watchlist', String(summary.watchlist), 'Needs closer supervision', 'border-amber-300/25 bg-amber-300/10 text-amber-100'],
            ['Action Needed', String(summary.actionNeeded), 'Has blockers before client proof', 'border-red-400/25 bg-red-400/10 text-red-200'],
            ['Active Scopes', String(summary.activeScopes), 'Linked assets, permits and surveys', 'border-blue-300/20 bg-blue-300/10 text-blue-100'],
          ].map(([label, value, helper, tone]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
              <p className="mt-2 text-3xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
              <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{helper}</p>
              <MetricTimestamp updatedAt={metricsUpdatedAt} />
              <div className={`mt-3 h-1 rounded-full border ${tone}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-[#0B172A] p-2">
        {[
          ['copilot', 'Partner Copilot'],
          ['all', 'All Partners'],
          ['install', 'Install Teams'],
          ['survey', 'Survey Vendors'],
          ['compliance', 'Permit / Compliance'],
          ['dooh', 'DOOH Support'],
          ['watchlist', 'Watchlist'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black transition ${filter === id ? 'bg-[#2E7FFF] text-white' : 'text-[#9DB4D0] hover:bg-white/5 hover:text-white'}`}
            onClick={() => setFilter(id as OOHVendorFilter)}
          >
            {label}
          </button>
        ))}
      </div>

      {filter === 'copilot' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_420px]">
          <div className="rounded-lg border border-[#2E7FFF]/30 bg-[linear-gradient(135deg,rgba(17,32,64,0.98),rgba(7,17,31,0.98))] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-[#2E7FFF]/30 bg-[#2E7FFF]/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#8DBDFF]">
                  <BrainCircuit size={13} /> Partner Copilot
                </p>
                <h3 className="mt-3 text-xl font-black text-white">Source, compare, check and recover OOH partners from one workbench</h3>
                <p className="mt-2 text-sm leading-6 text-[#9DB4D0]">Current action target is <span className="font-black text-white">{selectedPartner.name}</span>. Switch partner by clicking any vendor card below.</p>
              </div>
              <Pill tone={vendorRiskTone(selectedPartner.risk)}>{selectedPartner.risk}</Pill>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {Object.entries(actionLabels).map(([id, action]) => {
                const Icon = action.icon;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`rounded-lg border p-3 text-left transition hover:border-[#7EB8F7]/60 ${activeAction === id ? 'border-[#2E7FFF] bg-[#102343]' : 'border-white/10 bg-[#07111F]'}`}
                    onClick={() => runAction(id as OOHVendorAction)}
                  >
                    <Icon size={18} className="text-[#7EB8F7]" />
                    <p className="mt-3 text-sm font-black text-white">{action.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{action.helper}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-[#07111F] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Generated workbench</p>
                  <h4 className="mt-1 text-lg font-black text-white">{actionConfig.title}</h4>
                  <p className="mt-1 text-sm text-[#9DB4D0]">{actionConfig.helper}</p>
                </div>
                <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={openActionTarget}>
                  {actionConfig.button} <ExternalLink size={14} />
                </button>
              </div>
              <div className="mt-4 grid gap-2">
                {actionLines[activeAction].map(line => (
                  <div key={line} className="flex gap-2 rounded-lg border border-white/10 bg-[#0B172A] p-3 text-sm leading-6 text-[#D8E6F8]">
                    <CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-200" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Copilot activity</p>
            <div className="mt-3 space-y-2">
              {activityLog.map(item => (
                <div key={item} className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-sm leading-6 text-[#B8C7DB]">{item}</div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-blue-300/20 bg-blue-300/10 p-3">
              <p className="text-sm font-black text-white">Why this matters for OOH</p>
              <p className="mt-2 text-xs leading-5 text-blue-100">Partner performance directly controls proof quality, permit confidence, field survey freshness and what can safely be published to client evidence pages.</p>
            </div>
          </aside>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-black text-white">OOH Partner Register</h3>
              <p className="mt-1 text-sm text-[#9DB4D0]">Click a partner to inspect score signals, blockers and linked assets.</p>
            </div>
            <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{`${filteredPartners.length} partners`}</Pill>
          </div>
          <div className="mt-4 grid gap-3">
            {filteredPartners.map(partner => (
              <button
                key={partner.id}
                type="button"
                className={`rounded-lg border p-4 text-left transition hover:border-[#7EB8F7]/60 ${selectedPartner.id === partner.id ? 'border-[#2E7FFF] bg-[#102343]' : 'border-white/10 bg-[#07111F]'}`}
                onClick={() => setSelectedPartnerId(partner.id)}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-black text-white">{partner.name}</h4>
                      <Pill tone={vendorRiskTone(partner.risk)}>{partner.risk}</Pill>
                    </div>
                    <p className="mt-1 text-sm text-[#9DB4D0]">{partner.category} - {partner.role}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {partner.markets.map(market => <span key={market} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-[#B8C7DB]">{market}</span>)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[330px]">
                    <div className="rounded-lg border border-white/10 bg-[#0B172A] p-2">
                      <p className={`text-xl font-black ${scoreTone(partner.score)}`}>{partner.score}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#7A94B4]">Score</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-[#0B172A] p-2">
                      <p className="text-xl font-black text-white">{partner.evidenceAcceptance}%</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#7A94B4]">Proof OK</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-[#0B172A] p-2">
                      <p className="text-xl font-black text-white">{partner.fieldCompletion}%</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#7A94B4]">Field</p>
                    </div>
                  </div>
                </div>
                {partner.blockers.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm leading-6 text-red-100">
                    <AlertTriangle size={16} className="mt-1 shrink-0" />
                    <span>{partner.blockers[0]}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Selected partner</p>
                <h3 className="mt-1 text-xl font-black text-white">{selectedPartner.name}</h3>
                <p className="mt-1 text-sm leading-6 text-[#9DB4D0]">{selectedPartner.owner} - {vendorTrendLabel(selectedPartner.trend)}</p>
              </div>
              <div className={`rounded-lg bg-white/5 px-3 py-2 text-center ${scoreTone(selectedPartner.score)}`}>
                <div className="text-3xl font-black">{selectedPartner.score}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Score</div>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {[
                ['Evidence acceptance', `${selectedPartner.evidenceAcceptance}%`],
                ['Field completion', `${selectedPartner.fieldCompletion}%`],
                ['Proof SLA', `${selectedPartner.proofSla}%`],
                ['Permit readiness', `${selectedPartner.permitReadiness}%`],
                ['Compliance docs', `${selectedPartner.complianceDocs}%`],
                ['Last sync', selectedPartner.lastSync],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
                  <p className="mt-1 text-sm font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Linked OOH assets</p>
            <div className="mt-3 space-y-2">
              {selectedPartner.linkedAssetIds.length > 0 ? selectedPartner.linkedAssetIds.map(assetId => {
                const asset = data.assets.find(item => item.id === assetId);
                return (
                  <button
                    key={assetId}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#07111F] p-3 text-left hover:border-[#7EB8F7]/45"
                    onClick={() => {
                      onSelectAsset(assetId);
                      onOpenAssets();
                    }}
                  >
                    <span>
                      <span className="block text-sm font-black text-white">{asset?.name ?? assetId}</span>
                      <span className="text-xs text-[#9DB4D0]">{asset ? `${asset.market} - ${actionState(asset)}` : 'Asset register'}</span>
                    </span>
                    <ExternalLink size={14} className="text-[#7EB8F7]" />
                  </button>
                );
              }) : (
                <p className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-sm text-[#9DB4D0]">No asset links yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Actionable solution</p>
            <p className="mt-2 text-sm leading-6 text-white">{selectedPartner.nextAction}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg bg-[#2E7FFF] px-3 py-2 text-xs font-black text-white hover:bg-[#4C91FF]" onClick={onOpenSurveys}>Assign Survey</button>
              <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white hover:bg-white/10" onClick={onOpenEvidence}>Review Proof</button>
              <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white hover:bg-white/10" onClick={onOpenGIS}>Open GIS</button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

type OOHWorkOrderStatus = 'Live' | 'Commissioned' | 'Install Scheduled' | 'Proof Review' | 'Rework' | 'Future Booking';
type OOHWorkOrderFilter = 'all' | 'active' | 'install' | 'proof' | 'rework' | 'expiring' | 'future';

interface OOHCampaignWorkOrder {
  id: string;
  asset: OOHAsset;
  status: OOHWorkOrderStatus;
  client: string;
  campaign: string;
  buyer: string;
  flightLabel: string;
  durationDays: number;
  expiryLabel: string;
  daysToExpiry: number;
  artworkTitle: string;
  artworkFile: string;
  artworkSpec: string;
  artworkState: string;
  installedBy: string;
  installOwner: string;
  installationDueDate: string;
  workOrderAssignment: string;
  linkedAssignment?: OOHBootstrap['assignments'][number];
  latestSubmission?: OOHSubmission;
  futureBookings: string[];
  nextAction: string;
}

function workOrderFileSlug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function campaignDurationDays(asset: OOHAsset): number {
  if (!asset.bookedFrom || !asset.bookedTo) return 0;
  const start = Date.parse(asset.bookedFrom);
  const end = Date.parse(asset.bookedTo);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.ceil((end - start) / 86400000) + 1);
}

function daysUntil(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.ceil((parsed - Date.now()) / 86400000);
}

function futureWindow(startOffset: number, duration: number): string {
  const start = new Date(Date.now() + startOffset * 86400000).toISOString();
  const end = new Date(Date.now() + (startOffset + duration) * 86400000).toISOString();
  return `${formatDate(start)} to ${formatDate(end)}`;
}

function futureBookingsForAsset(asset: OOHAsset): string[] {
  const byAsset: Record<string, string[]> = {
    'OOH-DXB-SZR-001': [
      `Automotive launch hold - ${futureWindow(32, 28)}`,
      `Telecom route takeover option - ${futureWindow(74, 26)}`,
    ],
    'OOH-DXB-MALL-014': [
      `Retail opening loop - ${futureWindow(35, 21)}`,
      `Luxury watch display option - ${futureWindow(66, 14)}`,
    ],
    'OOH-AUH-COR-022': [
      `Airport stopover extension - ${futureWindow(39, 24)}`,
      `National route pack - ${futureWindow(96, 18)}`,
    ],
    'OOH-SHJ-BUS-033': [
      `Bank card refresh - ${futureWindow(18, 30)}`,
    ],
    'OOH-DXB-JBR-047': [
      `Summer retail rebooking - ${futureWindow(31, 28)}`,
      `Hospitality takeover option - ${futureWindow(71, 20)}`,
    ],
    'OOH-DXB-MET-061': [
      `Clinic awareness extension - ${futureWindow(24, 28)}`,
      `Transit retail slot - ${futureWindow(58, 21)}`,
    ],
  };
  return byAsset[asset.id] ?? [`Next available campaign window - ${futureWindow(30, 21)}`];
}

function artworkForAsset(asset: OOHAsset): { title: string; file: string; spec: string; state: string } {
  const slug = workOrderFileSlug(asset.campaign);
  const format = asset.format.toLowerCase();
  const isDigital = format.includes('digital') || asset.playerStatus === 'Online';
  const file = assetAttributeValue(asset, 'Artwork file') ?? (isDigital
    ? `DOOH_${slug}_${workOrderFileSlug(asset.dimensions)}_LOOP_V3.mp4`
    : `${workOrderFileSlug(asset.format)}_${slug}_${workOrderFileSlug(asset.dimensions)}_PRINT_V4.pdf`);
  let state = assetAttributeValue(asset, 'Artwork state') ?? 'Artwork matched to booking';
  if (asset.evidenceStatus === 'Missing') state = 'Artwork ready, proof missing';
  if (asset.evidenceStatus === 'Pending') state = 'Artwork installed, proof in review';
  if (asset.evidenceStatus === 'Rejected') state = 'Artwork or proof requires rework';
  return {
    title: assetAttributeValue(asset, 'Artwork title') ?? `${asset.campaign} campaign creative`,
    file,
    spec: assetAttributeValue(asset, 'Artwork spec') ?? (isDigital ? `${asset.dimensions} - DOOH playback asset` : `${asset.dimensions} - print-ready production file`),
    state,
  };
}

function workOrderStatusForAsset(asset: OOHAsset): OOHWorkOrderStatus {
  if (asset.evidenceStatus === 'Rejected' || asset.installStatus === 'Needs Visit') return 'Rework';
  if (asset.bookedFrom && Date.parse(asset.bookedFrom) > Date.now()) return 'Future Booking';
  if (asset.installStatus === 'Scheduled' || asset.status === 'Install Due') return 'Install Scheduled';
  if (asset.evidenceStatus === 'Pending') return 'Proof Review';
  if (asset.evidenceStatus === 'Ready' && asset.installStatus === 'Installed') return 'Live';
  return 'Commissioned';
}

function workOrderStatusTone(status: OOHWorkOrderStatus): string {
  if (status === 'Live') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  if (status === 'Rework') return 'border-red-400/25 bg-red-400/10 text-red-200';
  if (status === 'Proof Review' || status === 'Install Scheduled') return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
  return 'border-blue-300/20 bg-blue-300/10 text-blue-100';
}

function nextWorkOrderAction(asset: OOHAsset, status: OOHWorkOrderStatus): string {
  if (status === 'Rework') return 'Dispatch rework crew, recapture the failed evidence angle, then return to proof review.';
  if (status === 'Proof Review') return 'Review the pending survey submission and publish only approved proof to the client page.';
  if (status === 'Install Scheduled') return 'Confirm access, permit readiness, install owner and first proof capture before campaign go-live.';
  if (asset.permitStatus !== 'Valid') return 'Resolve permit status before publishing the asset into a client evidence pack.';
  if (status === 'Future Booking') return 'Hold the location, confirm artwork specifications and schedule pre-install survey.';
  return 'Keep recurring survey and client evidence page current until campaign expiry.';
}

function buildOOHWorkOrders(data: OOHBootstrap): OOHCampaignWorkOrder[] {
  return data.assets.map(asset => {
    const linkedAssignment = data.assignments.find(assignment => assignment.assetIds.includes(asset.id));
    const latestSubmission = latestInspectionForAsset(asset.id, data.submissions);
    const artwork = artworkForAsset(asset);
    const status = workOrderStatusForAsset(asset);
    const campaignInstallOwner = assetAttributeValue(asset, 'Install owner');
    const installationDueDate = assetAttributeValue(asset, 'Installation due') ?? dateOffsetInputValue(asset.bookedFrom, -1, 3);
    const installedBy = asset.installStatus === 'Installed'
      ? (asset.evidence[0]?.capturedBy ?? latestSubmission?.submittedBy ?? linkedAssignment?.team ?? 'Installation team')
      : (linkedAssignment?.team ?? campaignInstallOwner ?? 'Installation not assigned');
    return {
      id: `WO-${asset.id.replace(/^OOH-/, '')}`,
      asset,
      status,
      client: asset.client,
      campaign: asset.campaign,
      buyer: asset.buyerContact ?? 'Client contact pending',
      flightLabel: assetFlight(asset),
      durationDays: campaignDurationDays(asset),
      expiryLabel: asset.bookedTo ? `Campaign ends ${formatDate(asset.bookedTo)}` : `Permit expires ${formatDate(asset.permitExpiry)}`,
      daysToExpiry: daysUntil(asset.bookedTo ?? asset.permitExpiry),
      artworkTitle: artwork.title,
      artworkFile: artwork.file,
      artworkSpec: artwork.spec,
      artworkState: artwork.state,
      installedBy,
      installOwner: linkedAssignment ? `${linkedAssignment.team} - ${linkedAssignment.vendor}` : asset.installStatus === 'Installed' ? installedBy : campaignInstallOwner ?? 'Pending vendor assignment',
      installationDueDate,
      workOrderAssignment: assetAttributeValue(asset, 'Work order assignment') ?? (linkedAssignment ? 'Field assignment created' : 'Not assigned'),
      linkedAssignment,
      latestSubmission,
      futureBookings: futureBookingsForAsset(asset),
      nextAction: nextWorkOrderAction(asset, status),
    };
  }).sort((a, b) => {
    const priority = (status: OOHWorkOrderStatus) => {
      if (status === 'Rework') return 0;
      if (status === 'Proof Review') return 1;
      if (status === 'Install Scheduled') return 2;
      if (status === 'Future Booking') return 4;
      return 3;
    };
    return priority(a.status) - priority(b.status) || a.daysToExpiry - b.daysToExpiry;
  });
}

function OOHWorkOrders({
  data,
  selectedAssetId,
  onSelectAsset,
  onOpenAssets,
  onOpenSurveys,
  onOpenEvidence,
  onOpenClientPages,
}: {
  data: OOHBootstrap;
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
  onOpenAssets: () => void;
  onOpenSurveys: () => void;
  onOpenEvidence: () => void;
  onOpenClientPages: () => void;
}) {
  const workOrders = useMemo(() => buildOOHWorkOrders(data), [data]);
  const metricsUpdatedAt = useMemo(() => new Date().toISOString(), [workOrders]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [filter, setFilter] = useState<OOHWorkOrderFilter>('all');
  const [search, setSearch] = useState('');
  const selectedOrder = workOrders.find(order => order.id === selectedOrderId) ?? workOrders.find(order => order.asset.id === selectedAssetId) ?? workOrders[0];
  useEffect(() => {
    const focusedOrder = workOrders.find(order => order.asset.id === selectedAssetId);
    if (focusedOrder) setSelectedOrderId(focusedOrder.id);
  }, [selectedAssetId, workOrders]);
  const activeOrders = workOrders.filter(order => order.status !== 'Future Booking' && order.daysToExpiry >= 0);
  const proofActionOrders = workOrders.filter(order => order.asset.evidenceStatus !== 'Ready');
  const installOrders = workOrders.filter(order => order.status === 'Install Scheduled');
  const expiringOrders = workOrders.filter(order => order.daysToExpiry >= 0 && order.daysToExpiry <= 14);
  const futureCount = workOrders.reduce((sum, order) => sum + order.futureBookings.length, 0);
  const filteredOrders = workOrders.filter(order => {
    const haystack = `${order.id} ${order.campaign} ${order.client} ${order.asset.name} ${order.asset.market} ${order.artworkFile} ${order.installedBy}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'active') return activeOrders.some(item => item.id === order.id);
    if (filter === 'install') return order.status === 'Install Scheduled';
    if (filter === 'proof') return order.asset.evidenceStatus !== 'Ready';
    if (filter === 'rework') return order.status === 'Rework';
    if (filter === 'expiring') return order.daysToExpiry >= 0 && order.daysToExpiry <= 14;
    if (filter === 'future') return order.status === 'Future Booking' || order.futureBookings.length > 0;
    return true;
  });
  const filters: Array<{ id: OOHWorkOrderFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'install', label: 'Install' },
    { id: 'proof', label: 'Proof action' },
    { id: 'rework', label: 'Rework' },
    { id: 'expiring', label: 'Expiring' },
    { id: 'future', label: 'Future bookings' },
  ];
  const openSelectedAsset = () => {
    if (!selectedOrder) return;
    onSelectAsset(selectedOrder.asset.id);
    onOpenAssets();
  };
  const assignSelectedSurvey = () => {
    if (!selectedOrder) return;
    onSelectAsset(selectedOrder.asset.id);
    onOpenSurveys();
  };
  const reviewSelectedProof = () => {
    if (!selectedOrder) return;
    onSelectAsset(selectedOrder.asset.id);
    onOpenEvidence();
  };

  if (!selectedOrder) return null;

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">OOH campaign operations</p>
            <h2 className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Campaign Work Orders</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#B8C7DB]">Client-commissioned campaigns with asset location, artwork used, installation owner, proof status, expiry and next booking visibility.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10" onClick={assignSelectedSurvey}>
              <ClipboardCheck size={16} /> Assign Survey
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={reviewSelectedProof}>
              <Camera size={16} /> Review Proof
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            ['Active Orders', String(activeOrders.length), 'Campaigns currently controlled by operations', 'active'],
            ['Install Queue', String(installOrders.length), 'Assets due for install or first proof', 'install'],
            ['Proof Action', String(proofActionOrders.length), 'Missing, pending or rejected proof', 'proof'],
            ['Expiring Soon', String(expiringOrders.length), 'Campaigns ending inside 14 days', 'expiring'],
            ['Future Slots', String(futureCount), 'Known next bookings or option holds', 'future'],
          ].map(([label, value, helper, targetFilter]) => (
            <button
              key={label}
              type="button"
              className={`rounded-lg border p-4 text-left transition hover:border-[#7EB8F7]/50 ${filter === targetFilter ? 'border-[#2E7FFF] bg-[#102343]' : 'border-white/10 bg-[#07111F]'}`}
              onClick={() => setFilter(targetFilter as OOHWorkOrderFilter)}
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
              <p className="mt-2 text-3xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
              <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{helper}</p>
              <MetricTimestamp updatedAt={metricsUpdatedAt} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_430px]">
        <div className="min-w-0 rounded-lg border border-white/10 bg-[#0B172A] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-black text-white">Commissioned campaign register</h3>
              <p className="mt-1 text-sm text-[#9DB4D0]">Click any row to inspect artwork, installation and future booking details.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm text-[#9DB4D0]">
                <Search size={15} />
                <input className="w-52 bg-transparent text-white outline-none placeholder:text-[#58708E]" placeholder="Search work orders" value={search} onChange={event => setSearch(event.target.value)} />
              </label>
              <select className="h-10 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm font-bold text-white outline-none" value={filter} onChange={event => setFilter(event.target.value as OOHWorkOrderFilter)}>
                {filters.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3 flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-[#07111F] p-1.5">
            {filters.map(item => (
              <button
                key={item.id}
                type="button"
                className={`shrink-0 rounded-md px-3 py-2 text-xs font-black transition ${filter === item.id ? 'bg-[#2E7FFF] text-white' : 'text-[#9DB4D0] hover:bg-white/5 hover:text-white'}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="custom-scrollbar mt-4 w-full max-w-full overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
              <thead className="bg-[#07111F] text-[10px] uppercase tracking-wide text-[#7A94B4]">
                <tr>
                  <th className="px-3 py-3">Campaign / Client</th>
                  <th className="px-3 py-3">Asset</th>
                  <th className="px-3 py-3">Duration</th>
                  <th className="px-3 py-3">Artwork Used</th>
                  <th className="px-3 py-3">Installed By</th>
                  <th className="px-3 py-3">Install Due</th>
                  <th className="px-3 py-3">Expiry</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const active = selectedOrder.id === order.id;
                  return (
                    <tr
                      key={order.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open work order ${order.id}`}
                      className={`cursor-pointer border-t border-white/10 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7EB8F7] ${active ? 'bg-[#2E7FFF]/10' : ''}`}
                      onClick={() => setSelectedOrderId(order.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedOrderId(order.id);
                        }
                      }}
                    >
                      <td className="px-3 py-3 align-top">
                        <span className="block text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">{order.id}</span>
                        <span className="mt-1 block font-black text-white">{order.campaign}</span>
                        <span className="text-xs text-[#9DB4D0]">{order.client} - {order.buyer}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="block font-bold text-white">{order.asset.name}</span>
                        <span className="text-xs text-[#7A94B4]">{order.asset.market} - {order.asset.format}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="block font-bold text-white">{order.flightLabel}</span>
                        <span className="text-xs text-[#7A94B4]">{order.durationDays || 'TBD'} days</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="block max-w-[210px] truncate font-bold text-white">{order.artworkFile}</span>
                        <span className="text-xs text-[#7A94B4]">{order.artworkState}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="block font-bold text-white">{order.installedBy}</span>
                        <span className="text-xs text-[#7A94B4]">{order.installOwner}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="block font-bold text-white">{formatDate(order.installationDueDate)}</span>
                        <span className="text-xs text-[#7A94B4]">{order.workOrderAssignment}</span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="block font-bold text-white">{order.expiryLabel}</span>
                        <span className={order.daysToExpiry <= 7 ? 'text-xs font-bold text-amber-100' : 'text-xs text-[#7A94B4]'}>
                          {order.daysToExpiry >= 0 ? `${order.daysToExpiry} days left` : 'Expired'}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Pill tone={workOrderStatusTone(order.status)}>{order.status}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredOrders.length === 0 && (
              <div className="p-8 text-center text-sm text-[#9DB4D0]">No campaign work orders match the current filters.</div>
            )}
          </div>
        </div>

        <aside className="sticky top-5 space-y-4">
          <div className="overflow-hidden rounded-lg border border-[#2E7FFF]/30 bg-[#0B172A] shadow-xl shadow-black/20">
            <AssetPopupVisual asset={selectedOrder.asset} className="h-44 w-full" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">{selectedOrder.id}</p>
                  <h3 className="mt-1 text-xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{selectedOrder.campaign}</h3>
                  <p className="mt-1 text-sm text-[#9DB4D0]">Commissioned by {selectedOrder.client}</p>
                </div>
                <Pill tone={workOrderStatusTone(selectedOrder.status)}>{selectedOrder.status}</Pill>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  ['Asset', selectedOrder.asset.name],
                  ['Buyer', selectedOrder.buyer],
                  ['Flight', selectedOrder.flightLabel],
                  ['Install due', formatDate(selectedOrder.installationDueDate)],
                  ['Assignment', selectedOrder.workOrderAssignment],
                  ['Campaign expiry', selectedOrder.expiryLabel],
                  ['Installed by', selectedOrder.installedBy],
                  ['Proof', selectedOrder.asset.evidenceStatus],
                  ['Permit', selectedOrder.asset.permitStatus],
                  ['Health', String(selectedOrder.asset.healthScore)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
                    <p className="mt-1 text-sm font-black text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-[#07111F] p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Artwork used</p>
                <p className="mt-2 text-sm font-black text-white">{selectedOrder.artworkTitle}</p>
                <p className="mt-1 break-all font-mono text-xs text-[#B8C7DB]">{selectedOrder.artworkFile}</p>
                <p className="mt-2 text-xs leading-5 text-[#9DB4D0]">{selectedOrder.artworkSpec} - {selectedOrder.artworkState}</p>
              </div>

              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-100">Operator action</p>
                <p className="mt-2 text-sm leading-6 text-white">{selectedOrder.nextAction}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={openSelectedAsset}>
                  Open Asset <ExternalLink size={14} />
                </button>
                <button type="button" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10" onClick={reviewSelectedProof}>
                  Proof <Camera size={14} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10" onClick={assignSelectedSurvey}>
                  Survey <ClipboardCheck size={14} />
                </button>
                <button type="button" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10" onClick={onOpenClientPages}>
                  Client Page <Globe2 size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Future bookings</p>
              <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{`${selectedOrder.futureBookings.length} visible`}</Pill>
            </div>
            <div className="mt-3 space-y-2">
              {selectedOrder.futureBookings.map(booking => (
                <div key={booking} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                  <p className="text-sm font-black text-white">{booking}</p>
                  <p className="mt-1 text-xs text-[#9DB4D0]">Reserve artwork specs, access window and pre-install survey before confirmation.</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Linked field activity</p>
            <div className="mt-3 grid gap-2">
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Survey assignment</p>
                <p className="mt-1 text-sm font-black text-white">{selectedOrder.linkedAssignment?.name ?? 'Not assigned'}</p>
                <p className="mt-1 text-xs text-[#9DB4D0]">{selectedOrder.linkedAssignment ? `${selectedOrder.linkedAssignment.team} - due ${formatDate(selectedOrder.linkedAssignment.dueDate)}` : 'Create an assignment to capture QR, GPS and photo evidence.'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Latest inspection</p>
                <p className="mt-1 text-sm font-black text-white">{selectedOrder.latestSubmission ? selectedOrder.latestSubmission.status : 'No submission yet'}</p>
                <p className="mt-1 text-xs text-[#9DB4D0]">{selectedOrder.latestSubmission ? `${selectedOrder.latestSubmission.submittedBy} - score ${selectedOrder.latestSubmission.score}` : 'Field evidence will appear here once submitted.'}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

type OOHObligationStatus = 'Overdue' | 'Due Soon' | 'In Progress' | 'Met';
type OOHObligationCategory = 'Permits' | 'Authorisations' | 'Installation' | 'Proof' | 'Client Reporting' | 'Inspection' | 'DOOH Playback';

interface OOHObligation {
  id: string;
  code: string;
  title: string;
  description: string;
  category: OOHObligationCategory;
  status: OOHObligationStatus;
  dueDate: string;
  owner: string;
  authority: string;
  market: string;
  asset: OOHAsset;
  campaign: string;
  client: string;
  action: string;
  evidenceRequired: string[];
  linkedControls: Array<{ code: string; title: string; status: string }>;
  timeline: Array<{ date: string; note: string }>;
}

const obligationCategories: Array<'All Categories' | OOHObligationCategory> = ['All Categories', 'Permits', 'Authorisations', 'Installation', 'Proof', 'Client Reporting', 'Inspection', 'DOOH Playback'];
const obligationStatuses: Array<'All Status' | OOHObligationStatus> = ['All Status', 'Overdue', 'Due Soon', 'In Progress', 'Met'];

function obligationStatusTone(status: OOHObligationStatus): string {
  if (status === 'Met') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  if (status === 'Overdue') return 'border-red-400/25 bg-red-400/10 text-red-200';
  if (status === 'Due Soon') return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
  return 'border-blue-300/20 bg-blue-300/10 text-blue-100';
}

function obligationStatusRank(status: OOHObligationStatus): number {
  if (status === 'Overdue') return 0;
  if (status === 'Due Soon') return 1;
  if (status === 'In Progress') return 2;
  return 3;
}

function obligationDueStatus(value: string, met: boolean, inProgress = false, dueSoonDays = 7): OOHObligationStatus {
  if (met) return 'Met';
  const days = daysUntil(value);
  if (days < 0) return 'Overdue';
  if (inProgress) return 'In Progress';
  if (days <= dueSoonDays) return 'Due Soon';
  return 'In Progress';
}

function assetNeedsTrafficAuthorization(asset: OOHAsset): boolean {
  return /road|bridge|gantry|highway|corridor|street|jbr|corniche|zayed|airport/i.test(`${asset.name} ${asset.format} ${asset.route} ${asset.address}`);
}

function assetNeedsWorkAtHeightPermit(asset: OOHAsset): boolean {
  return /billboard|bridge|wall|gantry|unipole|wrap/i.test(`${asset.name} ${asset.format}`);
}

function assetNeedsPowerAuthorization(asset: OOHAsset): boolean {
  return asset.illumination !== 'Non-illuminated' && asset.powerStatus !== 'Not Required';
}

function buildOOHObligations(data: OOHBootstrap): OOHObligation[] {
  const livePageAssetIds = new Set(data.clientPages.filter(page => page.status === 'Live').flatMap(page => page.assetIds));
  const obligations = data.assets.flatMap(asset => {
    const linkedAssignment = data.assignments.find(assignment => assignment.assetIds.includes(asset.id));
    const latestSubmission = latestInspectionForAsset(asset.id, data.submissions);
    const installOwner = assetAttributeValue(asset, 'Install owner') ?? linkedAssignment?.team ?? 'Operations team';
    const installDue = assetAttributeValue(asset, 'Installation due') ?? dateOffsetInputValue(asset.bookedFrom, -1, 3);
    const authorizationDue = dateOffsetInputValue(asset.bookedFrom, -5, 2);
    const safetyDue = dateOffsetInputValue(asset.bookedFrom, -2, 3);
    const proofDue = dateOffsetInputValue(asset.bookedFrom, 1, 4);
    const clientDue = dateOffsetInputValue(asset.bookedFrom, 2, 5);
    const surveyDue = asset.nextSurveyDue;
    const campaignLabel = asset.campaign || 'Unassigned campaign';
    const baseTimeline = [
      { date: formatDate(asset.lastSurveyAt), note: `Latest inspection score ${asset.surveyHistory[0]?.score ?? asset.healthScore}.` },
      { date: formatDate(asset.bookedFrom ?? new Date().toISOString()), note: `${campaignLabel} flight context linked to asset record.` },
    ];
    const rows: OOHObligation[] = [
      {
        id: `OBL-PERMIT-${asset.id}`,
        code: `OBL-PER-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Permit and site-right validity',
        description: 'Confirm the asset permit, NOC, site-owner right, and expiry window before installation, continued display, or client publishing.',
        category: 'Authorisations',
        status: asset.permitStatus === 'Valid' && daysUntil(asset.permitExpiry) > 30 ? 'Met' : daysUntil(asset.permitExpiry) < 0 || asset.permitStatus === 'Expired' ? 'Overdue' : 'Due Soon',
        dueDate: asset.permitExpiry,
        owner: asset.owner,
        authority: asset.owner === 'OOH Assets' ? 'Internal compliance desk' : asset.owner,
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: asset.permitStatus === 'Valid' ? 'Keep permit reference attached and monitor expiry window.' : 'Update permit/NOC reference before field work or client publication.',
        evidenceRequired: ['Permit or site-owner approval reference', 'Expiry date confirmation', 'Asset ID and location match', 'Owner/site acknowledgement if required'],
        linkedControls: [
          { code: asset.id, title: `${asset.market} - ${asset.route}`, status: asset.permitStatus },
          { code: 'PUBLISH-BLOCK', title: 'Client page publish block when permit is expired or pending', status: asset.permitStatus === 'Valid' ? 'Clear' : 'Active' },
        ],
        timeline: [{ date: formatDate(asset.permitExpiry), note: `Permit status: ${asset.permitStatus}.` }, ...baseTimeline],
      },
      {
        id: `OBL-MUNICIPAL-${asset.id}`,
        code: `OBL-MUN-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Municipality display authorisation',
        description: 'Confirm the local advertising/display permit covers the booked face, format, location, campaign dates, and any municipality-specific conditions.',
        category: 'Authorisations',
        status: asset.permitStatus === 'Valid' ? 'Met' : asset.permitStatus === 'Expired' ? 'Overdue' : obligationDueStatus(authorizationDue, false, asset.permitStatus === 'Pending', 5),
        dueDate: authorizationDue,
        owner: 'Compliance coordinator',
        authority: `${asset.market} municipality / advertising authority`,
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: asset.permitStatus === 'Valid' ? 'Keep the municipal permit reference attached to the asset record.' : 'Request or update the municipality display authorisation before installation or publication.',
        evidenceRequired: ['Municipality permit number', 'Approved asset face / format', 'Campaign or display validity dates', 'Location reference matching GIS', 'Conditions or restrictions if any'],
        linkedControls: [
          { code: 'MUNICIPAL-PERMIT', title: `${asset.market} display authorisation`, status: asset.permitStatus },
          { code: asset.id, title: asset.name, status: asset.status },
        ],
        timeline: [{ date: formatDate(authorizationDue), note: 'Municipality authorisation should be cleared before field work starts.' }, ...baseTimeline],
      },
      {
        id: `OBL-SITE-ACCESS-${asset.id}`,
        code: `OBL-SIT-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Site owner access approval',
        description: 'Confirm landlord, mall, building, or site-owner access approval for installation crew entry, working hours, lift/boom access, and security requirements.',
        category: 'Permits',
        status: asset.installStatus === 'Installed' || (asset.permitStatus === 'Valid' && asset.owner === 'OOH Assets') ? 'Met' : obligationDueStatus(authorizationDue, false, asset.installStatus === 'Scheduled' || asset.installStatus === 'In Progress', 5),
        dueDate: authorizationDue,
        owner: installOwner,
        authority: asset.owner === 'OOH Assets' ? 'Internal site operations' : asset.owner,
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: asset.installStatus === 'Installed' ? 'Keep site access approval available with the work order trail.' : 'Confirm site-owner access window and crew entry requirements before dispatch.',
        evidenceRequired: ['Site-owner approval email/reference', 'Crew access window', 'Security or induction requirements', 'Lift/boom or equipment approval if required', 'Contact person on site'],
        linkedControls: [
          { code: 'SITE-ACCESS', title: `${asset.owner} access approval`, status: asset.installStatus === 'Installed' ? 'Closed' : 'Required' },
          { code: 'INSTALL-OWNER', title: installOwner, status: asset.installStatus },
        ],
        timeline: [{ date: formatDate(authorizationDue), note: 'Access approval required before installation team dispatch.' }, ...baseTimeline],
      },
      {
        id: `OBL-INSTALL-${asset.id}`,
        code: `OBL-INS-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Install by campaign deadline',
        description: 'Assign the installation owner, confirm access, and complete installation before the booked flight requires proof capture.',
        category: 'Installation',
        status: obligationDueStatus(installDue, asset.installStatus === 'Installed', asset.installStatus === 'In Progress' || asset.installStatus === 'Scheduled', 3),
        dueDate: installDue,
        owner: installOwner,
        authority: 'Campaign operations',
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: asset.installStatus === 'Installed' ? 'Installation is closed; maintain proof and inspection history.' : 'Open the work order and confirm the assigned install team and access window.',
        evidenceRequired: ['Work order assignment', 'Access window confirmation', 'Installed creative photo', 'Installer/supervisor sign-off'],
        linkedControls: [
          { code: linkedAssignment?.id ?? 'ASSIGNMENT-PENDING', title: linkedAssignment?.name ?? 'Installation assignment not yet created', status: linkedAssignment?.status ?? 'Missing' },
          { code: 'WORK-ORDER', title: assetAttributeValue(asset, 'Work order assignment') ?? 'Installation work order required', status: asset.installStatus },
        ],
        timeline: [{ date: formatDate(installDue), note: `Install due date for ${campaignLabel}.` }, ...baseTimeline],
      },
      {
        id: `OBL-PROOF-${asset.id}`,
        code: `OBL-PRF-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Proof-of-posting evidence approval',
        description: 'Capture QR/GPS/photo/signature evidence and close reviewer approval before the asset can be published to the client proof pack.',
        category: 'Proof',
        status: asset.evidenceStatus === 'Ready' ? 'Met' : asset.evidenceStatus === 'Pending' ? 'In Progress' : obligationDueStatus(proofDue, false, false, 2),
        dueDate: proofDue,
        owner: latestSubmission?.reviewer ?? linkedAssignment?.reviewer ?? 'Evidence reviewer',
        authority: 'Field proof governance',
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: asset.evidenceStatus === 'Ready' ? 'Keep the approved proof available for client evidence packs.' : asset.evidenceStatus === 'Pending' ? 'Review the captured submission and approve or reject with a clear reason.' : 'Assign a field proof survey with photo categories, QR scan, GPS lock and signature.',
        evidenceRequired: ['Wide photo', 'Close-up photo', 'Angle or context photo', 'QR verification', 'GPS accuracy', 'Supervisor signature'],
        linkedControls: [
          { code: latestSubmission?.id ?? 'SUBMISSION-PENDING', title: latestSubmission ? `Latest submission score ${latestSubmission.score}` : 'No proof submission captured', status: latestSubmission?.status ?? asset.evidenceStatus },
          { code: 'CLIENT-PUBLISH', title: 'Only approved evidence can be visible to clients', status: latestSubmission?.clientPublishStatus ?? 'Internal Only' },
        ],
        timeline: [{ date: formatDate(proofDue), note: `Proof SLA: ${asset.proofSla ?? 'Evidence due after installation'}.` }, ...baseTimeline],
      },
      {
        id: `OBL-CLIENT-${asset.id}`,
        code: `OBL-CLI-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Client evidence page coverage',
        description: 'Publish only approved installation evidence, survey results, map context, and access-controlled campaign proof to the client page.',
        category: 'Client Reporting',
        status: asset.evidenceStatus === 'Ready' && (livePageAssetIds.has(asset.id) || Boolean(asset.lastClientView)) ? 'Met' : asset.evidenceStatus === 'Ready' ? 'Due Soon' : obligationDueStatus(clientDue, false, false, 3),
        dueDate: clientDue,
        owner: asset.buyerContact ?? 'Account owner',
        authority: 'Client reporting desk',
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: asset.evidenceStatus === 'Ready' ? 'Add the approved asset proof to a secure client page with expiry and access logging.' : 'Approve proof first, then publish it to the client evidence page.',
        evidenceRequired: ['Approved proof set', 'Campaign asset list', 'Map location', 'Survey score/result', 'Page expiry/access state'],
        linkedControls: [
          { code: 'CLIENT-PAGE', title: livePageAssetIds.has(asset.id) ? 'Live client evidence page linked' : 'Client evidence page not linked', status: livePageAssetIds.has(asset.id) ? 'Live' : 'Missing' },
          { code: 'ACCESS-LOG', title: `Last client view: ${getLastClientView(asset)}`, status: asset.lastClientView ? 'Trace available' : 'No view trace' },
        ],
        timeline: [{ date: formatDate(clientDue), note: 'Target date for client-facing proof coverage.' }, ...baseTimeline],
      },
      {
        id: `OBL-SURVEY-${asset.id}`,
        code: `OBL-SRV-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Recurring inspection cadence',
        description: 'Keep recurring field inspections current so asset condition, creative match, illumination/player status, and proof quality do not go stale.',
        category: 'Inspection',
        status: obligationDueStatus(surveyDue, daysUntil(surveyDue) > 3, Boolean(linkedAssignment), 3),
        dueDate: surveyDue,
        owner: linkedAssignment?.team ?? 'Survey coordinator',
        authority: 'Field operations',
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: daysUntil(surveyDue) < 0 ? 'Assign or dispatch the overdue inspection immediately.' : 'Keep the next recurring inspection scheduled with QR/GPS/photo requirements.',
        evidenceRequired: ['Checklist answers', 'Question-level photo evidence where applicable', 'GPS lock', 'QR/NFC confirmation', 'Reviewer decision'],
        linkedControls: [
          { code: linkedAssignment?.id ?? 'ASSIGNMENT-PENDING', title: linkedAssignment?.name ?? 'Recurring survey assignment required', status: linkedAssignment?.status ?? 'Missing' },
          { code: asset.surveyHistory[0]?.id ?? 'NO-HISTORY', title: `Last survey ${formatDate(asset.lastSurveyAt)}`, status: asset.surveyHistory[0]?.status ?? 'No history' },
        ],
        timeline: [{ date: formatDate(surveyDue), note: 'Next recurring inspection due.' }, ...baseTimeline],
      },
    ];

    if (assetNeedsTrafficAuthorization(asset)) {
      rows.push({
        id: `OBL-TRAFFIC-${asset.id}`,
        code: `OBL-TRF-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Traffic / roadside work authorisation',
        description: 'Confirm road, bridge, roadside, or public-realm work approval for crew access, cones/barriers, lane impact, and permitted working hours.',
        category: 'Permits',
        status: asset.installStatus === 'Installed' && asset.permitStatus === 'Valid' ? 'Met' : obligationDueStatus(safetyDue, false, asset.installStatus === 'In Progress' || asset.installStatus === 'Scheduled', 4),
        dueDate: safetyDue,
        owner: installOwner,
        authority: `${asset.market} roads / traffic authority`,
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: asset.installStatus === 'Installed' ? 'Keep traffic access approval attached to the closed work order.' : 'Confirm roadside or public-realm access approval before the crew goes to site.',
        evidenceRequired: ['Roadside access permit or NOC', 'Approved work timing', 'Crew traffic-management plan', 'Route/location sketch', 'Emergency contact or site marshal if required'],
        linkedControls: [
          { code: 'ROUTE', title: asset.route, status: asset.market },
          { code: 'WORK-ORDER', title: assetAttributeValue(asset, 'Work order assignment') ?? 'Installation work order required', status: asset.installStatus },
        ],
        timeline: [{ date: formatDate(safetyDue), note: 'Traffic or roadside approval required before crew mobilisation.' }, ...baseTimeline],
      });
    }

    if (assetNeedsWorkAtHeightPermit(asset)) {
      rows.push({
        id: `OBL-SAFETY-${asset.id}`,
        code: `OBL-HSE-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Work-at-height / safety method approval',
        description: 'Confirm method statement, risk assessment, supervisor approval, and equipment certification before elevated installation or maintenance work.',
        category: 'Installation',
        status: asset.installStatus === 'Installed' ? 'Met' : obligationDueStatus(safetyDue, false, asset.installStatus === 'In Progress' || asset.installStatus === 'Scheduled', 3),
        dueDate: safetyDue,
        owner: installOwner,
        authority: 'HSE / site safety reviewer',
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: asset.installStatus === 'Installed' ? 'Retain the safety pack with the completed installation record.' : 'Approve the method statement and equipment access plan before assigning the work order.',
        evidenceRequired: ['Method statement', 'Risk assessment', 'Supervisor name', 'Equipment certification', 'PPE / safety checklist', 'Site induction record if required'],
        linkedControls: [
          { code: 'HSE-PACK', title: 'Safety method statement and risk assessment', status: asset.installStatus === 'Installed' ? 'Closed' : 'Required' },
          { code: 'FORMAT', title: `${asset.format} - ${asset.dimensions}`, status: asset.installStatus },
        ],
        timeline: [{ date: formatDate(safetyDue), note: 'Safety method approval required before elevated work.' }, ...baseTimeline],
      });
    }

    if (assetNeedsPowerAuthorization(asset)) {
      const powerReady = asset.powerStatus === 'Online';
      rows.push({
        id: `OBL-POWER-${asset.id}`,
        code: `OBL-PWR-${asset.id.split('-').slice(-1)[0]}`,
        title: 'Electrical / power energisation approval',
        description: 'Confirm power availability, electrical isolation/energisation approval, and responsible technician before illuminated or digital assets are treated as ready.',
        category: asset.illumination === 'Digital' ? 'DOOH Playback' : 'Authorisations',
        status: powerReady ? 'Met' : obligationDueStatus(safetyDue, false, asset.powerStatus === 'Online', 3),
        dueDate: safetyDue,
        owner: asset.illumination === 'Digital' ? 'Digital operations' : installOwner,
        authority: 'Electrical / facilities authority',
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: powerReady ? 'Keep power approval and online state visible in the asset record.' : 'Confirm power approval and technician sign-off before proof or playback readiness is accepted.',
        evidenceRequired: ['Power approval or facilities NOC', 'Technician sign-off', 'Isolation / energisation window', 'Panel or player power state', 'Photo of power/player status where applicable'],
        linkedControls: [
          { code: 'POWER', title: `Power state ${asset.powerStatus}`, status: asset.powerStatus },
          { code: 'ILLUMINATION', title: asset.illumination, status: asset.playerStatus },
        ],
        timeline: [{ date: formatDate(safetyDue), note: 'Electrical approval required before lighting/player readiness can be closed.' }, ...baseTimeline],
      });
    }

    const isDigital = asset.format.toLowerCase().includes('digital') || asset.illumination === 'Digital' || asset.playerStatus !== 'Not Installed';
    if (isDigital) {
      const playerReady = asset.powerStatus === 'Online' && asset.playerStatus === 'Online' && (asset.playerUptime ?? 0) >= 98;
      rows.push({
        id: `OBL-PLAYER-${asset.id}`,
        code: `OBL-PLY-${asset.id.split('-').slice(-1)[0]}`,
        title: 'DOOH player and playback readiness',
        description: 'Confirm power, player status, uptime, and playback-readiness signals before treating the digital asset as campaign-ready.',
        category: 'DOOH Playback',
        status: playerReady ? 'Met' : obligationDueStatus(asset.bookedFrom ?? new Date().toISOString(), false, asset.playerStatus === 'Online', 2),
        dueDate: asset.bookedFrom ?? new Date().toISOString(),
        owner: 'Digital operations',
        authority: 'Player / ad-server feed',
        market: asset.market,
        asset,
        campaign: campaignLabel,
        client: asset.client,
        action: playerReady ? 'Continue monitoring player uptime and playback feed.' : 'Check power/player state and assign maintenance before the campaign flight is treated as ready.',
        evidenceRequired: ['Player ID/status', 'Power state', 'Uptime threshold', 'Playback screenshot or ad-server feed', 'Field photo if player signal is unhealthy'],
        linkedControls: [
          { code: 'POWER', title: `Power state ${asset.powerStatus}`, status: asset.powerStatus },
          { code: 'PLAYER', title: `Player state ${asset.playerStatus}`, status: `${asset.playerUptime ?? 0}% uptime` },
        ],
        timeline: [{ date: formatDate(asset.bookedFrom ?? new Date().toISOString()), note: 'Playback readiness required before flight start.' }, ...baseTimeline],
      });
    }

    return rows;
  });

  return obligations.sort((a, b) => obligationStatusRank(a.status) - obligationStatusRank(b.status) || Date.parse(a.dueDate) - Date.parse(b.dueDate));
}

function OOHObligations({
  data,
  selectedAssetId,
  onSelectAsset,
  onOpenAssets,
  onOpenSurveys,
  onOpenEvidence,
  onOpenClientPages,
  onOpenWorkOrders,
}: {
  data: OOHBootstrap;
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
  onOpenAssets: () => void;
  onOpenSurveys: () => void;
  onOpenEvidence: () => void;
  onOpenClientPages: () => void;
  onOpenWorkOrders: () => void;
}) {
  const obligations = useMemo(() => buildOOHObligations(data), [data]);
  const metricsUpdatedAt = useMemo(() => new Date().toISOString(), [obligations]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All Status' | OOHObligationStatus>('All Status');
  const [categoryFilter, setCategoryFilter] = useState<'All Categories' | OOHObligationCategory>('All Categories');
  const [summaryFilter, setSummaryFilter] = useState<'None' | 'Open Proof'>('None');
  const [marketFilter, setMarketFilter] = useState('All markets');
  const [selectedId, setSelectedId] = useState('');
  const markets = useMemo(() => ['All markets', ...Array.from(new Set(data.assets.map(asset => asset.market))).filter(Boolean)], [data.assets]);
  const filtered = obligations.filter(item => {
    const haystack = `${item.code} ${item.title} ${item.description} ${item.asset.name} ${item.market} ${item.campaign} ${item.client} ${item.owner} ${item.authority}`.toLowerCase();
    return haystack.includes(query.toLowerCase())
      && (statusFilter === 'All Status' || item.status === statusFilter)
      && (categoryFilter === 'All Categories' || item.category === categoryFilter)
      && (marketFilter === 'All markets' || item.market === marketFilter)
      && (summaryFilter !== 'Open Proof' || (item.category === 'Proof' && item.status !== 'Met'));
  });
  const selected = obligations.find(item => item.id === selectedId)
    ?? obligations.find(item => item.asset.id === selectedAssetId)
    ?? filtered[0]
    ?? obligations[0];
  const counts = {
    overdue: obligations.filter(item => item.status === 'Overdue').length,
    dueSoon: obligations.filter(item => item.status === 'Due Soon').length,
    proof: obligations.filter(item => item.category === 'Proof' && item.status !== 'Met').length,
    met: obligations.filter(item => item.status === 'Met').length,
  };
  const selectObligation = (item: OOHObligation) => {
    setSelectedId(item.id);
    onSelectAsset(item.asset.id);
  };
  const openPrimaryAction = (item: OOHObligation) => {
    onSelectAsset(item.asset.id);
    if (item.category === 'Proof') onOpenEvidence();
    else if (item.category === 'Inspection') onOpenSurveys();
    else if (item.category === 'Client Reporting') onOpenClientPages();
    else if (item.category === 'Installation') onOpenWorkOrders();
    else onOpenAssets();
  };

  if (!selected) return null;

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">OOH obligation control</p>
            <h2 className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Obligations Register</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#B8C7DB]">Track permits, site access authorisations, traffic approvals, safety packs, installation, proof, inspections, client reporting and DOOH playback duties against every OOH asset.</p>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#2E7FFF] px-4 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={() => openPrimaryAction(selected)}>
            Open Required Action <ExternalLink size={15} />
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Overdue Actions', String(counts.overdue), 'Due date has passed and the owner must act now.', 'Overdue'],
            ['Due Soon', String(counts.dueSoon), 'Items inside the operating action window.', 'Due Soon'],
            ['Evidence Still Needed', String(counts.proof), 'Proof, photo, GPS or client evidence tasks not closed.', 'Open Proof'],
            ['Completed', String(counts.met), 'Obligations closed with required evidence or system state.', 'Met'],
          ].map(([label, value, helper, target]) => (
            <button
              key={label}
              type="button"
              className="rounded-lg border border-white/10 bg-[#07111F] p-4 text-left transition hover:border-[#7EB8F7]/45 hover:bg-white/[0.035]"
              onClick={() => {
                if (target === 'Open Proof') {
                  setCategoryFilter('Proof');
                  setStatusFilter('All Status');
                  setSummaryFilter('Open Proof');
                } else {
                  setStatusFilter(target as OOHObligationStatus);
                  setCategoryFilter('All Categories');
                  setSummaryFilter('None');
                }
              }}
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
              <p className="mt-2 text-3xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
              <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{helper}</p>
              <MetricTimestamp updatedAt={metricsUpdatedAt} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_430px]">
        <div className="min-w-0 rounded-lg border border-white/10 bg-[#0B172A] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-black text-white">Operating obligation queue</h3>
              <p className="mt-1 text-sm text-[#9DB4D0]">Click an obligation to see required evidence, linked controls and the action owner.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm text-[#9DB4D0]">
                <Search size={15} />
                <input className="w-52 bg-transparent text-white outline-none placeholder:text-[#58708E]" placeholder="Search obligations" value={query} onChange={event => setQuery(event.target.value)} />
              </label>
              <select className="h-10 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm font-bold text-white outline-none" value={statusFilter} onChange={event => {
                setStatusFilter(event.target.value as 'All Status' | OOHObligationStatus);
                setSummaryFilter('None');
              }}>
                {obligationStatuses.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="h-10 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm font-bold text-white outline-none" value={categoryFilter} onChange={event => {
                setCategoryFilter(event.target.value as 'All Categories' | OOHObligationCategory);
                setSummaryFilter('None');
              }}>
                {obligationCategories.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="h-10 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm font-bold text-white outline-none" value={marketFilter} onChange={event => setMarketFilter(event.target.value)}>
                {markets.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>

          <div className="custom-scrollbar mt-4 w-full max-w-full overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
              <thead className="bg-[#07111F] text-[10px] uppercase tracking-wide text-[#7A94B4]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Obligation</th>
                  <th className="px-4 py-3">Asset / Campaign</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const active = selected.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open obligation ${item.code}`}
                      className={`cursor-pointer border-t border-white/10 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7EB8F7] ${active ? 'bg-[#2E7FFF]/10' : ''}`}
                      onClick={() => selectObligation(item)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectObligation(item);
                        }
                      }}
                    >
                      <td className="px-4 py-4 align-top font-mono text-xs font-black text-[#7EB8F7]">{item.code}</td>
                      <td className="px-4 py-4 align-top">
                        <span className="block max-w-[260px] font-black text-white">{item.title}</span>
                        <span className="mt-1 block max-w-[300px] text-xs leading-5 text-[#7A94B4]">{item.description}</span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className="block font-bold text-white">{item.asset.name}</span>
                        <span className="text-xs text-[#9DB4D0]">{item.campaign} - {item.client}</span>
                      </td>
                      <td className="px-4 py-4 align-top text-[#B8C7DB]">{item.category}</td>
                      <td className="px-4 py-4 align-top">
                        <span className="block font-bold text-white">{formatDate(item.dueDate)}</span>
                        <span className={daysUntil(item.dueDate) < 0 ? 'text-xs font-bold text-red-200' : 'text-xs text-[#7A94B4]'}>
                          {daysUntil(item.dueDate) < 0 ? `${Math.abs(daysUntil(item.dueDate))} days overdue` : `${daysUntil(item.dueDate)} days left`}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top text-[#B8C7DB]">{item.owner}</td>
                      <td className="px-4 py-4 align-top"><Pill tone={obligationStatusTone(item.status)}>{item.status}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-[#9DB4D0]">No obligations match the current filters.</div>
            )}
          </div>
        </div>

        <aside className="sticky top-5 space-y-4">
          <div className="overflow-hidden rounded-lg border border-[#2E7FFF]/30 bg-[#0B172A] shadow-xl shadow-black/20">
            <AssetPopupVisual asset={selected.asset} className="h-40 w-full" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[#7EB8F7]">{selected.code}</p>
                  <h3 className="mt-2 text-xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{selected.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#B8C7DB]">{selected.description}</p>
                </div>
                <Pill tone={obligationStatusTone(selected.status)}>{selected.status}</Pill>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  ['Asset', selected.asset.name],
                  ['Campaign', selected.campaign],
                  ['Client', selected.client],
                  ['Market', selected.market],
                  ['Category', selected.category],
                  ['Due date', formatDate(selected.dueDate)],
                  ['Owner', selected.owner],
                  ['Authority', selected.authority],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
                    <p className="mt-1 text-sm font-black text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-100">Required action</p>
                <p className="mt-2 text-sm leading-6 text-white">{selected.action}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={() => openPrimaryAction(selected)}>
                  Open Action <ExternalLink size={14} />
                </button>
                <button type="button" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10" onClick={() => {
                  onSelectAsset(selected.asset.id);
                  onOpenAssets();
                }}>
                  Open Asset <Building2 size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Evidence required</p>
            <div className="mt-3 space-y-2">
              {selected.evidenceRequired.map(item => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-white/10 bg-[#07111F] p-3 text-sm text-white">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-200" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Linked controls</p>
            <div className="mt-3 space-y-2">
              {selected.linkedControls.map(control => (
                <div key={control.code} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-mono text-[11px] font-black text-[#7EB8F7]">{control.code}</p>
                    <span className="text-xs font-black text-[#B8C7DB]">{control.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-black text-white">{control.title}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Obligation timeline</p>
            <div className="mt-3 space-y-0">
              {selected.timeline.map((entry, index) => (
                <div key={`${entry.date}-${entry.note}`} className="grid grid-cols-[16px_1fr] gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1 h-2 w-2 rounded-full ${index === 0 ? 'bg-[#7EB8F7]' : 'bg-[#526A87]'}`} />
                    {index < selected.timeline.length - 1 && <span className="h-full min-h-[34px] w-px bg-white/10" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-[11px] text-[#7A94B4]">{entry.date}</p>
                    <p className="mt-1 text-sm leading-5 text-white">{entry.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

type OOHSettingsSection = 'network' | 'evidence' | 'surveys' | 'client' | 'permits' | 'integrations' | 'access';
type OOHBooleanSettingKey = {
  [K in keyof OOHSettingsState]: OOHSettingsState[K] extends boolean ? K : never
}[keyof OOHSettingsState];

interface OOHSettingsState {
  defaultMarket: string;
  assetIdPattern: string;
  gpsAccuracyMeters: number;
  clusterZoom: number;
  permitAlertDays: number;
  clientPageExpiryDays: number;
  watermarkLabel: string;
  reviewerRole: string;
  surveyRecurrence: AssignmentForm['recurrence'];
  proofPublishPolicy: string;
  requireQr: boolean;
  requireGps: boolean;
  requireSignature: boolean;
  requirePhotoByQuestion: boolean;
  offlineCapture: boolean;
  mapTeamPins: boolean;
  blockExpiredPermitPublish: boolean;
  clientAccessLog: boolean;
  ssoEnabled: boolean;
  vendorGate: boolean;
  playerHealthChecks: boolean;
}

const oohSettingsDefaults: OOHSettingsState = {
  defaultMarket: 'Dubai',
  assetIdPattern: 'OOH-{MARKET}-{FORMAT}-{SEQ}',
  gpsAccuracyMeters: 8,
  clusterZoom: 12,
  permitAlertDays: 45,
  clientPageExpiryDays: 30,
  watermarkLabel: '4C360 verified OOH evidence',
  reviewerRole: 'Field supervisor',
  surveyRecurrence: 'Weekly',
  proofPublishPolicy: 'Approved evidence only',
  requireQr: true,
  requireGps: true,
  requireSignature: true,
  requirePhotoByQuestion: true,
  offlineCapture: true,
  mapTeamPins: true,
  blockExpiredPermitPublish: true,
  clientAccessLog: true,
  ssoEnabled: true,
  vendorGate: true,
  playerHealthChecks: true,
};

const oohSettingsSections: Array<{ id: OOHSettingsSection; label: string; icon: LucideIcon; helper: string }> = [
  { id: 'network', label: 'Network', icon: MapPin, helper: 'GIS, naming and asset controls' },
  { id: 'evidence', label: 'Evidence', icon: Camera, helper: 'QR, GPS, photos and proof gates' },
  { id: 'surveys', label: 'Surveys', icon: ClipboardCheck, helper: 'Recurring inspection templates' },
  { id: 'client', label: 'Clients', icon: Globe2, helper: 'Secure sharing and exports' },
  { id: 'permits', label: 'Permits', icon: ShieldCheck, helper: 'Compliance windows and blocks' },
  { id: 'integrations', label: 'Integrations', icon: Link2, helper: 'System feeds and sync health' },
  { id: 'access', label: 'Access', icon: Users, helper: 'Roles, vendors and controls' },
];

function SettingToggle({
  label,
  text,
  enabled,
  onToggle,
}: {
  label: string;
  text: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left transition ${
        enabled ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-white/10 bg-[#07111F] hover:border-[#7EB8F7]/45'
      }`}
      onClick={onToggle}
      aria-pressed={enabled}
    >
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[#9DB4D0]">{text}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full border transition ${enabled ? 'border-emerald-300/40 bg-emerald-300/30' : 'border-white/10 bg-white/5'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${enabled ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

function SettingsField({
  label,
  value,
  helper,
  children,
}: {
  label: string;
  value?: string;
  helper: string;
  children?: ReactNode;
}) {
  return (
    <label className="block rounded-lg border border-white/10 bg-[#07111F] p-3">
      <span className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</span>
      {children ?? <span className="mt-1 block text-sm font-black text-white">{value}</span>}
      <span className="mt-1 block text-xs leading-5 text-[#9DB4D0]">{helper}</span>
    </label>
  );
}

function OOHSettings({
  data,
  onOpenGIS,
  onOpenSurveys,
  onOpenEvidence,
  onOpenClientPages,
  onOpenVendors,
}: {
  data: OOHBootstrap;
  onOpenGIS: () => void;
  onOpenSurveys: () => void;
  onOpenEvidence: () => void;
  onOpenClientPages: () => void;
  onOpenVendors: () => void;
}) {
  const [section, setSection] = useState<OOHSettingsSection>('network');
  const [settings, setSettings] = useState<OOHSettingsState>(oohSettingsDefaults);
  const [notice, setNotice] = useState('Settings are ready for OOH assets, field evidence, client pages and partner governance.');
  const metricsUpdatedAt = useMemo(() => new Date().toISOString(), [data]);
  const markets = useMemo(() => Array.from(new Set(data.assets.map(asset => asset.market))).filter(Boolean), [data.assets]);
  const formats = useMemo(() => Array.from(new Set(data.assets.map(asset => asset.format))).filter(Boolean), [data.assets]);
  const readyAssets = data.assets.filter(asset => asset.evidenceStatus === 'Ready').length;
  const proofBlockedAssets = data.assets.filter(asset => asset.evidenceStatus !== 'Ready');
  const permitWatchAssets = data.assets.filter(asset => ['Pending', 'Expiring', 'Expired'].includes(asset.permitStatus));
  const activeAssignments = data.assignments.filter(assignment => ['Active', 'In Progress', 'Submitted', 'Overdue'].includes(assignment.status));
  const liveClientPages = data.clientPages.filter(page => page.status === 'Live');
  const pendingSubmissions = data.submissions.filter(submission => submission.status === 'Pending Review');
  const digitalAssets = data.assets.filter(asset => asset.format.toLowerCase().includes('digital') || asset.playerStatus !== 'Not Installed');
  const digitalReady = digitalAssets.filter(asset => asset.playerStatus === 'Online' && asset.powerStatus === 'Online').length;
  const selectedSection = oohSettingsSections.find(item => item.id === section) ?? oohSettingsSections[0];
  const SelectedIcon = selectedSection.icon;
  const setToggle = (key: OOHBooleanSettingKey) => {
    setSettings(current => ({ ...current, [key]: !current[key] }));
  };
  const saveSettings = () => {
    setNotice(`OOH settings applied for ${markets.length || 1} markets, ${data.assets.length} assets and ${activeAssignments.length} field assignments.`);
  };
  const resetSettings = () => {
    setSettings(oohSettingsDefaults);
    setNotice('OOH settings restored to the standard operator profile.');
  };
  const proofCategories = ['Wide installation photo', 'Creative close-up', 'QR asset tag', 'Frame or screen condition', 'Power/player status', 'Exception photo'];
  const roles = [
    ['OOH administrator', 'All markets, configuration and publishing controls', 'SSO, audit log and approval history'],
    ['Media operations', 'Assets, campaigns, GIS and booking context', 'Cannot publish rejected evidence'],
    ['Field supervisor', 'Survey templates, assignments and review decisions', 'QR/GPS/photo rules always enforced'],
    ['Compliance owner', 'Permit dates, NOC references and publish blocks', 'Can hold client publishing when permits need attention'],
    ['Client success', 'Secure client pages, access expiry and exports', 'Sees approved evidence only'],
    ['External field partner', 'Assigned missions and mobile capture', 'No internal navigation or client page control'],
  ];

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">OOH platform settings</p>
            <h2 className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Control how assets, surveys, proof and client pages behave</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#B8C7DB]">Adapted for OOH operators: configure GIS confidence, field evidence rules, recurring surveys, publishing controls, permit governance, integration feeds and partner access.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10" onClick={resetSettings}>
              <Settings2 size={16} /> Reset OOH Defaults
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={saveSettings}>
              <CheckCircle2 size={16} /> Apply Settings
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-blue-300/20 bg-blue-300/10 p-3 text-sm font-bold text-blue-100">{notice}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            ['Assets Governed', String(data.assets.length), `${markets.length || 1} markets and ${formats.length || 1} formats`],
            ['Proof Ready', `${readyAssets}/${data.assets.length}`, `${proofBlockedAssets.length} assets need evidence action`],
            ['Field Assignments', String(activeAssignments.length), `${pendingSubmissions.length} submissions waiting for review`],
            ['Clients', String(liveClientPages.length), `${settings.clientPageExpiryDays} day default expiry`],
            ['DOOH Readiness', digitalAssets.length ? `${digitalReady}/${digitalAssets.length}` : 'N/A', settings.playerHealthChecks ? 'Player checks enabled' : 'Manual player checks'],
          ].map(([label, value, helper]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
              <p className="mt-2 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
              <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{helper}</p>
              <MetricTimestamp updatedAt={metricsUpdatedAt} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-white/10 bg-[#0B172A] p-3">
          <p className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#7A94B4]">Settings workspace</p>
          <div className="mt-3 grid gap-2">
            {oohSettingsSections.map(item => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${active ? 'border-[#2E7FFF] bg-[#102343]' : 'border-white/10 bg-[#07111F] hover:border-[#7EB8F7]/45'}`}
                  onClick={() => setSection(item.id)}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${active ? 'border-[#2E7FFF]/40 bg-[#2E7FFF]/18 text-white' : 'border-white/10 bg-white/5 text-[#7EB8F7]'}`}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">{item.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#9DB4D0]">{item.helper}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#2E7FFF]/35 bg-[#2E7FFF]/14 text-[#9BC5FF]">
                <SelectedIcon size={20} />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">{selectedSection.label} controls</p>
                <h3 className="text-xl font-black text-white">{selectedSection.helper}</h3>
              </div>
            </div>
            <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{settings.proofPublishPolicy}</Pill>
          </div>

          {section === 'network' && (
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-3 md:grid-cols-2">
                <SettingsField label="Default market" helper="Used when adding a new OOH unit.">
                  <select className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.defaultMarket} onChange={event => setSettings(current => ({ ...current, defaultMarket: event.target.value }))}>
                    {[...markets, 'Abu Dhabi', 'Sharjah'].filter((item, index, arr) => arr.indexOf(item) === index).map(market => <option key={market}>{market}</option>)}
                  </select>
                </SettingsField>
                <SettingsField label="Asset ID pattern" helper="Controls imported and manually created IDs.">
                  <input className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.assetIdPattern} onChange={event => setSettings(current => ({ ...current, assetIdPattern: event.target.value }))} />
                </SettingsField>
                <SettingsField label="GPS tolerance" helper="Maximum acceptable field capture accuracy in meters.">
                  <input type="number" min={1} max={50} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.gpsAccuracyMeters} onChange={event => setSettings(current => ({ ...current, gpsAccuracyMeters: Number(event.target.value) || 1 }))} />
                </SettingsField>
                <SettingsField label="Cluster zoom" helper="Default GIS zoom level for network operations.">
                  <input type="number" min={8} max={18} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.clusterZoom} onChange={event => setSettings(current => ({ ...current, clusterZoom: Number(event.target.value) || 12 }))} />
                </SettingsField>
              </div>
              <div className="space-y-3">
                <SettingToggle label="Show field teams on GIS" text="Display live crew pins beside OOH assets and action hotspots." enabled={settings.mapTeamPins} onToggle={() => setToggle('mapTeamPins')} />
                <SettingToggle label="DOOH player readiness" text="Include player and power status in map and asset decision signals." enabled={settings.playerHealthChecks} onToggle={() => setToggle('playerHealthChecks')} />
                <button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={onOpenGIS}>
                  Open GIS Operations <ExternalLink size={14} />
                </button>
              </div>
            </div>
          )}

          {section === 'evidence' && (
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-3 md:grid-cols-2">
                <SettingToggle label="QR scan required" text="Every proof submission must verify the physical asset tag." enabled={settings.requireQr} onToggle={() => setToggle('requireQr')} />
                <SettingToggle label="GPS lock required" text={`Accept capture only inside ${settings.gpsAccuracyMeters}m tolerance.`} enabled={settings.requireGps} onToggle={() => setToggle('requireGps')} />
                <SettingToggle label="Photo evidence per question" text="Relevant checklist questions require their own photo evidence." enabled={settings.requirePhotoByQuestion} onToggle={() => setToggle('requirePhotoByQuestion')} />
                <SettingToggle label="Signature on completion" text="Field lead signs the inspection before submission." enabled={settings.requireSignature} onToggle={() => setToggle('requireSignature')} />
                <SettingToggle label="Offline capture and sync" text="Allow field teams to capture on site and sync once connected." enabled={settings.offlineCapture} onToggle={() => setToggle('offlineCapture')} />
                <SettingsField label="Reviewer role" helper="Default owner for approval decisions.">
                  <select className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.reviewerRole} onChange={event => setSettings(current => ({ ...current, reviewerRole: event.target.value }))}>
                    {['Field supervisor', 'Media operations', 'Client success', 'Compliance owner'].map(role => <option key={role}>{role}</option>)}
                  </select>
                </SettingsField>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Required photo categories</p>
                <div className="mt-3 grid gap-2">
                  {proofCategories.map(category => (
                    <div key={category} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0B172A] p-3 text-sm font-black text-white">
                      <Camera size={15} className="text-[#7EB8F7]" /> {category}
                    </div>
                  ))}
                </div>
                <button type="button" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={onOpenEvidence}>
                  Open Evidence Workbench <ExternalLink size={14} />
                </button>
              </div>
            </div>
          )}

          {section === 'surveys' && (
            <div className="mt-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-3">
                <SettingsField label="Default recurrence" helper="Used when assigning inspections from an asset.">
                  <select className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.surveyRecurrence} onChange={event => setSettings(current => ({ ...current, surveyRecurrence: event.target.value as AssignmentForm['recurrence'] }))}>
                    {recurrenceOptions.map(option => <option key={option}>{option}</option>)}
                  </select>
                </SettingsField>
                <button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={onOpenSurveys}>
                  Open Survey Templates <ExternalLink size={14} />
                </button>
              </div>
              <div className="grid gap-3">
                {data.assignments.slice(0, 4).map(assignment => (
                  <div key={assignment.id} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">{assignment.name}</p>
                        <p className="mt-1 text-xs text-[#9DB4D0]">{assignment.team} - {assignment.recurrence} - due {formatDate(assignment.dueDate)}</p>
                      </div>
                      <Pill>{assignment.status}</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignment.accessRules.qrScan && <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">QR</Pill>}
                      {assignment.accessRules.gpsRequired && <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">GPS</Pill>}
                      {assignment.accessRules.photoRequired && <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">Photos</Pill>}
                      {assignment.accessRules.signatureRequired && <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">Signature</Pill>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'client' && (
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-3 md:grid-cols-2">
                <SettingsField label="Evidence page expiry" helper="Default number of days before a shared page expires.">
                  <input type="number" min={1} max={180} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.clientPageExpiryDays} onChange={event => setSettings(current => ({ ...current, clientPageExpiryDays: Number(event.target.value) || 1 }))} />
                </SettingsField>
                <SettingsField label="Watermark label" helper="Shown on client-facing evidence exports.">
                  <input className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.watermarkLabel} onChange={event => setSettings(current => ({ ...current, watermarkLabel: event.target.value }))} />
                </SettingsField>
                <SettingToggle label="Published evidence only" text="Hide rejected, pending and internal notes from client pages." enabled={settings.proofPublishPolicy === 'Approved evidence only'} onToggle={() => setSettings(current => ({ ...current, proofPublishPolicy: current.proofPublishPolicy === 'Approved evidence only' ? 'Reviewer-controlled publishing' : 'Approved evidence only' }))} />
                <SettingToggle label="Access log enabled" text="Track viewer count, last view and export history." enabled={settings.clientAccessLog} onToggle={() => setToggle('clientAccessLog')} />
              </div>
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Current share coverage</p>
                <p className="mt-2 text-3xl font-black text-white">{liveClientPages.length}</p>
                <p className="mt-1 text-sm text-[#9DB4D0]">Live secure client evidence pages.</p>
                <MetricTimestamp updatedAt={metricsUpdatedAt} />
                <div className="mt-4 grid gap-2">
                  {data.clientPages.slice(0, 3).map(page => (
                    <div key={page.token} className="rounded-lg border border-white/10 bg-[#0B172A] p-3">
                      <p className="text-sm font-black text-white">{page.title}</p>
                      <p className="mt-1 text-xs text-[#9DB4D0]">{page.client} - expires {formatDate(page.expiresAt)}</p>
                    </div>
                  ))}
                </div>
                <button type="button" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={onOpenClientPages}>
                  Open Clients <ExternalLink size={14} />
                </button>
              </div>
            </div>
          )}

          {section === 'permits' && (
            <div className="mt-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-3">
                <SettingsField label="Permit alert window" helper="Days before expiry when assets enter permit watch.">
                  <input type="number" min={1} max={180} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2 text-sm font-black text-white" value={settings.permitAlertDays} onChange={event => setSettings(current => ({ ...current, permitAlertDays: Number(event.target.value) || 1 }))} />
                </SettingsField>
                <SettingToggle label="Block publish on expired permit" text="Prevent expired-permit assets from client evidence pages." enabled={settings.blockExpiredPermitPublish} onToggle={() => setToggle('blockExpiredPermitPublish')} />
                <button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={onOpenEvidence}>
                  Open Compliance Review <ExternalLink size={14} />
                </button>
              </div>
              <div className="grid gap-3">
                {permitWatchAssets.length ? permitWatchAssets.map(asset => (
                  <div key={asset.id} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">{asset.name}</p>
                        <p className="mt-1 text-xs text-[#9DB4D0]">{asset.market} - {asset.route} - expires {formatDate(asset.permitExpiry)}</p>
                      </div>
                      <Pill>{asset.permitStatus}</Pill>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm font-black text-emerald-100">All tracked permits are clear.</div>
                )}
              </div>
            </div>
          )}

          {section === 'integrations' && (
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-3 md:grid-cols-2">
                {integrationFeeds.map(feed => (
                  <div key={feed.name} className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">{feed.name}</p>
                        <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{feed.source}</p>
                      </div>
                      <Pill>{feed.status}</Pill>
                    </div>
                    <p className="mt-3 text-xs font-bold text-[#7EB8F7]">Last sync {feed.at}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Feed policy</p>
                <div className="mt-3 grid gap-2">
                  {['ERP asset master cannot overwrite approved proof.', 'Media booking controls campaign and flight context.', 'Player/ad-server feeds inform DOOH readiness only.', 'Document repository stores permits, NOCs and evidence packs.'].map(rule => (
                    <div key={rule} className="flex gap-2 rounded-lg border border-white/10 bg-[#0B172A] p-3 text-sm leading-6 text-[#D8E6F8]">
                      <CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-200" />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'access' && (
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-3">
                {roles.map(([role, scope, guard]) => (
                  <div key={role} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-black text-white">{role}</p>
                        <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{scope}</p>
                      </div>
                      <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">RBAC</Pill>
                    </div>
                    <p className="mt-2 text-xs font-bold text-[#7EB8F7]">{guard}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <SettingToggle label="SSO enabled" text="Use identity provider sign-in for internal platform users." enabled={settings.ssoEnabled} onToggle={() => setToggle('ssoEnabled')} />
                <SettingToggle label="Vendor assignment gate" text="Block external crews without approved role, market and evidence permissions." enabled={settings.vendorGate} onToggle={() => setToggle('vendorGate')} />
                <button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]" onClick={onOpenVendors}>
                  Open Vendor IQ <ExternalLink size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AssetLocationModal({
  asset,
  onClose,
  onOpenGIS,
  onAssignSurvey,
}: {
  asset: OOHAsset | null;
  onClose: () => void;
  onOpenGIS: (asset: OOHAsset) => void;
  onAssignSurvey: (asset: OOHAsset) => void;
}) {
  if (!asset) return null;
  const latestSurvey = [...asset.surveyHistory].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  const locationRows = [
    { label: 'GPS lock', value: `${asset.lat.toFixed(5)}, ${asset.lng.toFixed(5)}`, helper: 'Survey and map verification' },
    { label: 'Address', value: asset.address, helper: 'Crew navigation point' },
    { label: 'Route', value: asset.route, helper: 'Media route / corridor' },
    { label: 'Market', value: asset.market, helper: 'Operating market' },
    { label: 'Format', value: asset.format, helper: asset.dimensions },
    { label: 'Owner / site', value: asset.owner, helper: 'Commercial ownership' },
    { label: 'Permit expiry', value: formatDate(asset.permitExpiry), helper: asset.permitStatus },
    { label: 'Latest survey', value: latestSurvey ? formatDate(latestSurvey.date) : 'No survey yet', helper: latestSurvey ? `${latestSurvey.score} score - ${latestSurvey.status}` : 'Assign inspection' },
  ];
  const operatingRows = [
    { label: 'Install', value: asset.installStatus, icon: CheckCircle2 },
    { label: 'Evidence', value: asset.evidenceStatus, icon: Camera },
    { label: 'Permit', value: asset.permitStatus, icon: ShieldCheck },
    { label: 'Health', value: String(asset.healthScore), icon: BarChart3 },
  ];
  const nextAction = asset.evidenceStatus === 'Rejected'
    ? 'Evidence was rejected. Reassign a focused photo inspection and keep the asset out of client proof until approved.'
    : asset.evidenceStatus === 'Missing'
      ? 'No approved proof is attached. Send the field team to capture QR, GPS and photo evidence.'
      : asset.evidenceStatus === 'Pending'
        ? 'Captured proof is waiting for reviewer decision. Open the workbench and approve or request rework.'
        : 'Location, permit and proof are ready for client evidence sharing.';

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`asset-location-${asset.id}`}
        className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-lg border border-[#2E7FFF]/35 bg-[#081426] shadow-2xl shadow-black/50"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#0B172A] p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7EB8F7]">Asset location intelligence</p>
            <h3 id={`asset-location-${asset.id}`} className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{asset.name}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#9DB4D0]">
              <span>{asset.id}</span>
              <span className="h-1 w-1 rounded-full bg-[#7A94B4]" />
              <span>{asset.market}</span>
              <span className="h-1 w-1 rounded-full bg-[#7A94B4]" />
              <span>{assetFlight(asset)}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close asset location attributes"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#B8C7DB] hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="custom-scrollbar max-h-[calc(92vh-92px)] space-y-4 overflow-y-auto p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="relative h-[320px] overflow-hidden rounded-lg border border-blue-300/20 bg-[#07111F]">
              <MapContainer key={asset.id} center={[asset.lat, asset.lng]} zoom={13} scrollWheelZoom={true} className="h-full w-full ooh-modern-map">
                <TileLayer {...modernMapTiles} />
                <CircleMarker
                  center={[asset.lat, asset.lng]}
                  radius={13}
                  pathOptions={{ color: markerColor(asset), fillColor: markerColor(asset), fillOpacity: 0.9, weight: 3 }}
                >
                  <Popup>
                    <div className="w-64 p-2 text-left">
                      <span className="block text-xs font-black uppercase tracking-wide text-[#7A94B4]">{asset.id}</span>
                      <strong className="mt-1 block text-sm text-[#EEF3FA]">{asset.name}</strong>
                      <p className="mt-1 text-xs text-[#B8C7DB]">{asset.address}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              </MapContainer>
              <div className="absolute bottom-3 left-3 right-3 z-[500] rounded-lg border border-white/10 bg-[#07111F]/90 p-3 shadow-xl shadow-black/30 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">Pinned location</p>
                <p className="mt-1 text-lg font-black text-white">{asset.route}</p>
                <p className="mt-1 text-sm leading-5 text-[#B8C7DB]">{asset.address}</p>
              </div>
            </div>

            <aside className="flex flex-col gap-3 rounded-lg border border-white/10 bg-[#07111F] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Operator action</p>
                  <p className="mt-1 text-xl font-black text-white">{actionState(asset)}</p>
                </div>
                <div className={`rounded-lg bg-white/5 px-3 py-2 text-center ${scoreTone(asset.healthScore)}`}>
                  <div className="text-3xl font-black">{asset.healthScore}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Health</div>
                </div>
              </div>
              <p className="rounded-lg border border-blue-300/20 bg-blue-300/10 p-3 text-sm leading-6 text-blue-100">{nextAction}</p>
              <div className="grid grid-cols-2 gap-2">
                {operatingRows.map(row => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="rounded-lg border border-white/10 bg-[#0B172A] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{row.label}</p>
                        <Icon size={14} className="text-[#7EB8F7]" />
                      </div>
                      <p className={`mt-2 text-sm font-black ${row.label === 'Health' ? scoreTone(asset.healthScore) : 'text-white'}`}>{row.value}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-auto grid gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-sm font-black text-white hover:bg-[#4C91FF]"
                onClick={() => onOpenGIS(asset)}
              >
                Open In GIS <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white hover:bg-white/10"
                onClick={() => onAssignSurvey(asset)}
              >
                Assign Survey <ClipboardCheck size={14} />
              </button>
              </div>
            </aside>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {locationRows.map(row => (
              <div key={row.label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{row.label}</p>
                <p className="mt-1 text-sm font-black leading-5 text-white">{row.value}</p>
                <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{row.helper}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">Location attributes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {asset.attributes.map(attribute => (
                <span key={attribute} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-[#B8C7DB]">{attribute}</span>
              ))}
            </div>
            <p className="mt-4 rounded-lg border border-blue-300/20 bg-blue-300/10 p-3 text-sm leading-6 text-blue-100">{asset.audienceReference ?? 'GIS/GPS verified OOH location with market and route attributes.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssetProfile({
  asset,
  latestSubmission,
  onPatch,
  onOpenLocation,
  onOpenGIS,
  onAssignSurvey,
  onReviewProof,
  onOpenWorkOrders,
  onOpenClientPages,
}: {
  asset: OOHAsset;
  latestSubmission?: OOHSubmission;
  onPatch: (updates: Partial<OOHAsset>) => void;
  onOpenLocation: () => void;
  onOpenGIS: () => void;
  onAssignSurvey: () => void;
  onReviewProof: () => void;
  onOpenWorkOrders: () => void;
  onOpenClientPages: () => void;
}) {
  const latestSurvey = [...asset.surveyHistory].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  const workOrderStatus = workOrderStatusForAsset(asset);
  const artwork = artworkForAsset(asset);
  const nextAction = nextWorkOrderAction(asset, workOrderStatus);
  const futureBooking = futureBookingsForAsset(asset)[0];
  const inspectionResult = latestSurvey
    ? `${formatDate(latestSurvey.date)} - score ${latestSurvey.score}; checklist ${latestSurvey.status.toLowerCase()}`
    : 'No inspection submitted yet';
  const proofDecision = asset.evidenceStatus === 'Ready'
    ? 'Approved for client page'
    : asset.evidenceStatus === 'Rejected'
      ? 'Rejected for client proof'
      : asset.evidenceStatus === 'Pending'
        ? 'Pending reviewer decision'
        : 'Missing proof capture';
  const evidencePackageState = latestSubmission
    ? `${proofDecision} - survey score ${latestSubmission.score}`
    : asset.evidenceStatus === 'Missing'
      ? 'No proof package submitted'
      : `${proofDecision} - no linked submission`;
  const inspectorRows = [
    ['Campaign', asset.campaign],
    ['Client', asset.client],
    ['Format', asset.format],
    ['Dimensions', asset.dimensions],
    ['Market', asset.market],
    ['Route', asset.route],
    ['Permit', `${asset.permitStatus} - ${formatDate(asset.permitExpiry)}`],
    ['Install', asset.installStatus],
    ['Client proof decision', proofDecision],
    ['Inspection result', inspectionResult],
    ['Evidence package', evidencePackageState],
    ['Buyer', asset.buyerContact ?? 'Client contact pending'],
  ];

  return (
    <aside className="overflow-hidden rounded-lg border border-white/10 bg-[#0B172A] shadow-xl shadow-black/10">
      <AssetPopupVisual asset={asset} className="h-48 w-full" />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7A94B4]">{asset.id}</p>
            <h3 className="mt-1 text-xl font-black leading-7 text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{asset.name}</h3>
            <p className="mt-2 text-sm leading-6 text-[#9DB4D0]">{asset.address}</p>
          </div>
          <div className={`shrink-0 rounded-lg px-3 py-2 text-center ${scoreTone(asset.healthScore)} bg-white/5`}>
            <div className="text-2xl font-black">{asset.healthScore}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Health</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Pill>{asset.status}</Pill>
          <Pill>{asset.evidenceStatus}</Pill>
          <Pill>{asset.permitStatus}</Pill>
          <Pill tone={workOrderStatusTone(workOrderStatus)}>{workOrderStatus}</Pill>
        </div>

        <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-amber-100">Operator next action</p>
          <p className="mt-2 text-sm leading-6 text-white">{nextAction}</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-100">Campaign flight</p>
            <p className="mt-1 text-sm font-black text-white">{assetFlight(asset)}</p>
          </div>
          <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-100">Action state</p>
            <p className="mt-1 text-sm font-black text-white">{actionState(asset)}</p>
          </div>
          <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Client view</p>
            <p className="mt-1 text-sm font-black text-white">{getLastClientView(asset)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {inspectorRows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
              <p className="mt-1 text-sm font-bold leading-5 text-[#EEF3FA]">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-[#07111F] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Artwork and next booking</p>
          <p className="mt-1 text-sm font-black text-white">{artwork.title}</p>
          <p className="mt-1 break-all font-mono text-xs text-[#B8C7DB]">{artwork.file}</p>
          <p className="mt-2 text-xs leading-5 text-[#9DB4D0]">{futureBooking}</p>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-[#07111F] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Audience and location reference</p>
          <p className="mt-1 text-sm leading-5 text-[#B8C7DB]">{asset.audienceReference ?? 'GIS/GPS verified OOH unit with market and route attributes.'}</p>
        </div>

        <div className="mt-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">Inspector actions</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={onOpenLocation}>
              <MapPin size={14} /> Location & Map
            </button>
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={onOpenGIS}>
              <Globe2 size={14} /> GIS Layer
            </button>
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-400/12 px-3 py-2 text-sm font-bold text-blue-100 hover:bg-blue-400/18" onClick={onAssignSurvey}>
              <ClipboardCheck size={14} /> Assign Survey
            </button>
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-300/12 px-3 py-2 text-sm font-bold text-amber-100 hover:bg-amber-300/18" onClick={onReviewProof}>
              <Camera size={14} /> Review Proof
            </button>
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={onOpenWorkOrders}>
              <FileSearch size={14} /> Work Order
            </button>
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={onOpenClientPages}>
              <Globe2 size={14} /> Client Page
            </button>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">Lifecycle controls</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="rounded-lg bg-emerald-400/12 px-3 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-400/18" onClick={() => onPatch({ status: 'Live', installStatus: 'Installed', evidenceStatus: 'Ready' })}>
              Mark Installed
            </button>
            <button className="rounded-lg bg-red-400/12 px-3 py-2 text-sm font-bold text-red-100 hover:bg-red-400/18" onClick={() => onPatch({ status: 'Issue', installStatus: 'Needs Visit', evidenceStatus: 'Rejected' })}>
              Flag Issue
            </button>
            <button className="rounded-lg bg-white/8 px-3 py-2 text-sm font-bold text-white hover:bg-white/12" onClick={() => onPatch({ permitStatus: 'Valid', permitExpiry: new Date(Date.now() + 365 * 86400000).toISOString() })}>
              Renew Permit
            </button>
            <button className="rounded-lg bg-white/8 px-3 py-2 text-sm font-bold text-white hover:bg-white/12" onClick={onOpenClientPages}>
              Share Control
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function OOHOperatorApp() {
  const [data, setData] = useState<OOHBootstrap>(fallbackOOHBootstrap);
  const [activeTab, setActiveTab] = useState<OOHTab>(getInitialOOHTab);
  const [selectedAssetId, setSelectedAssetId] = useState(fallbackOOHBootstrap.assets[0]?.id ?? '');
  const [assetForm, setAssetForm] = useState<AssetForm>(buildNewAssetForm);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(buildAssignmentForm(fallbackOOHBootstrap.assets[0]?.id ?? ''));
  const [searchTerm, setSearchTerm] = useState('');
  const [marketFilter, setMarketFilter] = useState('All markets');
  const [busy, setBusy] = useState(false);
  const [activeMetricId, setActiveMetricId] = useState('proof-gap');
  const [metricModalId, setMetricModalId] = useState<string | null>(null);
  const [locationAssetId, setLocationAssetId] = useState<string | null>(null);
  const [highlightSubmissionId, setHighlightSubmissionId] = useState('');
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [assetIntakeMode, setAssetIntakeMode] = useState<AssetIntakeMode>('choice');
  const [bulkAssetRows, setBulkAssetRows] = useState<BulkAssetPreview[]>([]);
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkUploadError, setBulkUploadError] = useState('');
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignStep, setCampaignStep] = useState<CampaignWizardStep>(1);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(() => buildCampaignForm(fallbackOOHBootstrap.assets[0]));
  const [campaignArtworkUpload, setCampaignArtworkUpload] = useState<CampaignArtworkUpload | null>(null);
  const [copyNotice, setCopyNotice] = useState<{ path: string; copied: boolean } | null>(null);
  const [activeReportId, setActiveReportId] = useState<OOHReportId | null>(null);
  const navigateToTab = (tab: OOHTab) => {
    setActiveTab(tab);
    const nextPath = oohTabPaths[tab];
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
  };

  useEffect(() => {
    let mounted = true;
    fetchOOHBootstrap().then(store => {
      if (!mounted) return;
      setData(store);
      const firstAssetId = store.assets[0]?.id ?? '';
      setSelectedAssetId(current => store.assets.some(asset => asset.id === current) ? current : firstAssetId);
      setAssignmentForm(current => ({ ...current, assetId: current.assetId || firstAssetId }));
      setCampaignForm(current => current.assetId ? current : buildCampaignForm(store.assets[0]));
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!metricModalId && !locationAssetId && !assetModalOpen && !campaignModalOpen && !activeReportId) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMetricModalId(null);
        setLocationAssetId(null);
        setAssetModalOpen(false);
        setCampaignModalOpen(false);
        setActiveReportId(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [metricModalId, locationAssetId, assetModalOpen, campaignModalOpen, activeReportId]);

  const selectedAsset = data.assets.find(asset => asset.id === selectedAssetId) ?? data.assets[0];
  const locationAsset = locationAssetId ? data.assets.find(asset => asset.id === locationAssetId) ?? null : null;
  const campaignAsset = data.assets.find(asset => asset.id === campaignForm.assetId) ?? selectedAsset;
  const campaignDuration = Number.isFinite(Date.parse(campaignForm.bookedFrom)) && Number.isFinite(Date.parse(campaignForm.bookedTo))
    ? Math.max(1, Math.ceil((Date.parse(campaignForm.bookedTo) - Date.parse(campaignForm.bookedFrom)) / 86400000) + 1)
    : 0;
  const clientOptions = useMemo(() => Array.from(new Set([
    ...data.assets.map(asset => asset.client),
    ...data.clientPages.map(page => page.client),
  ].map(client => client.trim()).filter(Boolean))), [data.assets, data.clientPages]);
  const installationTeamOptions = useMemo(() => Array.from(new Set([
    ...defaultInstallationTeams,
    ...data.assignments.map(assignment => assignment.team),
    ...data.assets.map(asset => assetAttributeValue(asset, 'Install owner') ?? ''),
  ].map(team => team.trim()).filter(Boolean))), [data.assignments, data.assets]);
  const filteredAssets = useMemo(() => data.assets.filter(asset => {
    const matchesMarket = marketFilter === 'All markets' || asset.market === marketFilter;
    const haystack = `${asset.id} ${asset.name} ${asset.format} ${asset.route} ${asset.client} ${asset.campaign}`.toLowerCase();
    return matchesMarket && haystack.includes(searchTerm.toLowerCase());
  }), [data.assets, marketFilter, searchTerm]);
  const clientBookingRows = useMemo(() => buildClientBookingRows(data.assets, data.clientPages), [data.assets, data.clientPages]);
  const activeReportPreview = useMemo(() => activeReportId ? buildOOHReportPreview(data, activeReportId) : null, [activeReportId, data]);
  const metricsUpdatedAt = useMemo(() => new Date().toISOString(), [data]);

  const pendingSubmissions = data.submissions.filter(submission => submission.status === 'Pending Review');
  const actionBlockers = data.assets.filter(assetNeedsAction).length;
  const metricInsights = useMemo<MetricInsight[]>(() => {
    const totalAssets = data.assets.length;
    const now = Date.now();
    const proofGapAssets = data.assets.filter(asset => asset.evidenceStatus !== 'Ready');
    const firstProofGapSubmission = pendingSubmissions.find(submission => proofGapAssets.some(asset => asset.id === submission.assetId));
    const surveyOverdueAssets = data.assets
      .filter(asset => !Number.isFinite(Date.parse(asset.nextSurveyDue)) || Date.parse(asset.nextSurveyDue) < now)
      .sort((a, b) => Date.parse(a.nextSurveyDue) - Date.parse(b.nextSurveyDue));
    const surveyDueSoonAssets = data.assets
      .filter(asset => Number.isFinite(Date.parse(asset.nextSurveyDue)) && Date.parse(asset.nextSurveyDue) >= now && Date.parse(asset.nextSurveyDue) <= now + 3 * 86400000)
      .sort((a, b) => Date.parse(a.nextSurveyDue) - Date.parse(b.nextSurveyDue));
    const surveyAttentionAssets = [...surveyOverdueAssets, ...surveyDueSoonAssets];
    const gisReadyAssets = data.assets.filter(asset => (
      Number.isFinite(asset.lat)
      && Number.isFinite(asset.lng)
      && Boolean(asset.market)
      && Boolean(asset.route)
      && Boolean(asset.address)
      && Boolean(asset.format)
      && Boolean(asset.dimensions)
      && Boolean(asset.permitStatus)
      && asset.attributes.length > 0
    ));
    const gisGapAssets = data.assets.filter(asset => !gisReadyAssets.some(ready => ready.id === asset.id));
    const livePageAssetIds = new Set(data.clientPages.filter(page => page.status === 'Live').flatMap(page => page.assetIds));
    const approvedAssetIds = new Set(data.submissions.filter(submission => submission.status === 'Approved' && submission.clientPublishStatus !== 'Blocked').map(submission => submission.assetId));
    const clientEvidenceAssets = data.assets.filter(asset => (
      approvedAssetIds.has(asset.id)
      || (asset.evidenceStatus === 'Ready' && (livePageAssetIds.has(asset.id) || Boolean(asset.lastClientView)))
    ));
    const clientGapAssets = data.assets.filter(asset => !clientEvidenceAssets.some(ready => ready.id === asset.id));
    const permitWatchAssets = data.assets.filter(asset => ['Expiring', 'Expired', 'Pending'].includes(asset.permitStatus));
    const digitalAssets = data.assets.filter(asset => asset.format.toLowerCase().includes('digital') || asset.illumination === 'Digital' || asset.playerStatus !== 'Not Installed');
    const digitalReadyAssets = digitalAssets.filter(asset => asset.powerStatus === 'Online' && asset.playerStatus === 'Online' && (asset.playerUptime ?? 0) >= 98);
    const digitalAttentionAssets = digitalAssets.filter(asset => !digitalReadyAssets.some(ready => ready.id === asset.id));

    return [
      {
        id: 'proof-gap',
        label: 'Proof Gap',
        value: proofGapAssets.length,
        note: `${proofGapAssets.length}/${totalAssets} assets do not yet have approved client proof.`,
        icon: AlertTriangle,
        tone: proofGapAssets.length ? 'red' : 'green',
        formula: `Count assets where evidence status is not Ready. Current calculation: ${proofGapAssets.length} / ${totalAssets}.`,
        deepDive: 'This shows the exact gap between the OOH inventory and what can confidently be used as installation evidence. Pending, missing and rejected proof stay visible until the reviewer approves the captured survey evidence.',
        painPoint: 'Campaign proof cannot be shared confidently while assets are pending, missing, or rejected. Operators end up chasing field teams manually and clients see gaps instead of a clean evidence pack.',
        rootCause: 'Installation status, survey submission status, and reviewer decision are not closed for every booked asset. The system keeps those assets out of client-ready proof until the evidence is approved.',
        solutionSteps: ['Review pending submissions first because they can become proof-ready immediately.', 'Reject weak or blurred evidence with a correction reason so the field team knows exactly what to recapture.', 'Assign a proof survey for assets with no captured submission.'],
        signals: ['asset.evidenceStatus', 'asset.installStatus', 'review status', 'photo evidence'],
        records: proofGapAssets.slice(0, 9).map(asset => {
          const submission = data.submissions.find(item => item.assetId === asset.id && ['Pending Review', 'Rejected'].includes(item.status));
          const hasSubmission = Boolean(submission);
          const rejected = asset.evidenceStatus === 'Rejected' || submission?.status === 'Rejected';
          const missing = asset.evidenceStatus === 'Missing';
          return assetMetricRecord(
            asset,
            `${asset.evidenceStatus}, ${actionState(asset)}`,
            hasSubmission ? 'Evidence' : 'Surveys',
            hasSubmission ? 'Open Proof Review' : 'Assign Survey',
            submission?.id,
            {
              urgency: rejected || missing ? 'Critical' : 'Attention',
              painPoint: rejected
                ? 'Captured proof was rejected, so the asset is blocked from client publishing.'
                : missing
                  ? 'No proof submission exists yet, so the asset cannot be included in the evidence pack.'
                  : 'Captured proof is waiting for review and is not visible to clients yet.',
              solution: hasSubmission
                ? 'Open the proof review, inspect photo/GPS/QR quality, then approve or reject with a field correction reason.'
                : 'Create a field survey for this asset with required wide, close-up, QR/GPS and signature evidence.',
            },
          );
        }),
        action: 'Open Evidence to approve valid submissions, or open Surveys to send field teams back for missing proof.',
        actionLabel: firstProofGapSubmission ? 'Review Pending Proof' : 'Open Proof Workbench',
        actionAssetId: firstProofGapSubmission?.assetId ?? proofGapAssets[0]?.id,
        actionSubmissionId: firstProofGapSubmission?.id,
        tab: 'Evidence',
      },
      {
        id: 'survey-freshness',
        label: 'Overdue Surveys',
        value: surveyOverdueAssets.length,
        note: surveyOverdueAssets.length
          ? `${surveyOverdueAssets.length} assets are overdue for inspection; ${surveyDueSoonAssets.length} more are due within 3 days.`
          : `${surveyDueSoonAssets.length} assets are due within 3 days; none are overdue.`,
        icon: ClipboardCheck,
        tone: surveyOverdueAssets.length ? 'red' : surveyDueSoonAssets.length ? 'amber' : 'green',
        formula: `Count assets where the next survey due date is missing or earlier than today. Current calculation: ${surveyOverdueAssets.length} overdue out of ${totalAssets} assets.`,
        deepDive: 'This tells the operator whether the network is being inspected often enough over time. It is more useful than a generic health average because it exposes stale sites before the client asks for fresh evidence.',
        painPoint: 'Stale inspections create blind spots: damage, creative mismatch, player failure, or missing proof can sit unnoticed until the client asks for fresh evidence.',
        rootCause: 'Recurring survey coverage is too close to the due window or not scheduled far enough ahead for some assets.',
        solutionSteps: ['Open the survey queue and assign recurring inspections for due assets.', 'Prioritize assets tied to active campaigns or client proof pages.', 'Use QR, GPS, photo categories and signature rules so every visit produces usable evidence.'],
        signals: ['asset.lastSurveyAt', 'asset.nextSurveyDue', 'survey recurrence', 'assignment status'],
        records: surveyAttentionAssets.slice(0, 9).map(asset => {
          const dueTime = Date.parse(asset.nextSurveyDue);
          const hasDueDate = Number.isFinite(dueTime);
          const isOverdue = !hasDueDate || dueTime < now;
          return assetMetricRecord(
            asset,
            !hasDueDate ? 'Survey due date missing' : isOverdue ? `Overdue since ${formatDate(asset.nextSurveyDue)}` : `Due ${formatDate(asset.nextSurveyDue)}`,
            'Surveys',
            'Assign Recurring Survey',
            undefined,
            {
              urgency: isOverdue ? 'Critical' : 'Attention',
              painPoint: isOverdue
                ? 'The next inspection is overdue, so the latest condition and proof evidence may be stale.'
                : 'The next inspection is inside the action window and should be scheduled before proof freshness drops.',
              solution: 'Assign a recurring survey with QR scan, GPS lock, required photo evidence and reviewer ownership.',
            },
          );
        }),
        action: 'Open Surveys and assign recurring inspections for overdue assets first, then schedule assets due in the next three days.',
        actionLabel: 'Assign Recurring Survey',
        actionAssetId: surveyAttentionAssets[0]?.id,
        tab: 'Surveys',
      },
      {
        id: 'client-evidence-coverage',
        label: 'Client Evidence Gaps',
        value: clientGapAssets.length,
        note: `${clientGapAssets.length} assets do not yet have client-ready proof coverage; ${clientEvidenceAssets.length} are shareable.`,
        icon: Globe2,
        tone: clientGapAssets.length ? 'amber' : 'green',
        formula: `Count assets without approved survey proof, a live evidence page, or a client view trace. Current calculation: ${clientGapAssets.length} gaps out of ${totalAssets} assets.`,
        deepDive: 'This separates internal proof readiness from client-facing evidence coverage. An asset only counts when approved evidence can be shared or traced through a secure client page.',
        painPoint: 'Internal proof is not enough if the client cannot access it. Account teams lose time sending manual screenshots, files, and status updates.',
        rootCause: 'Some assets either do not have approved evidence yet or have not been added to a live client evidence page with access trace.',
        solutionSteps: ['Approve pending evidence before publishing.', 'Generate or update the secure client page for the campaign.', 'Check that only approved evidence is visible and that expiry/access controls are set.'],
        signals: ['asset.evidenceStatus', 'approved submissions', 'live client pages', 'last client view'],
        records: clientGapAssets.slice(0, 9).map(asset => assetMetricRecord(
          asset,
          `${asset.evidenceStatus}, client view ${getLastClientView(asset)}`,
          'Clients',
          'Prepare Client Page',
          undefined,
          {
            urgency: asset.evidenceStatus === 'Ready' ? 'Attention' : 'Critical',
            painPoint: asset.evidenceStatus === 'Ready'
              ? 'Evidence is ready internally but is not yet covered by a client-share trace.'
              : 'The asset cannot be shared to the client because approved proof is not ready.',
            solution: asset.evidenceStatus === 'Ready'
              ? 'Add this asset to the campaign evidence page and confirm access expiry and watermark settings.'
              : 'Approve proof first, then publish the asset to the secure evidence page.',
          },
        )),
        action: 'Open Clients to publish approved proof, or approve pending evidence first if the asset is not ready.',
        actionLabel: 'Prepare Client Evidence Page',
        actionAssetId: clientGapAssets[0]?.id ?? clientEvidenceAssets[0]?.id,
        tab: 'Clients',
      },
      {
        id: 'gis-confidence',
        label: 'GIS Confidence',
        value: `${percent(gisReadyAssets.length, totalAssets)}%`,
        note: `${gisReadyAssets.length}/${totalAssets} assets have GPS, route, market, format and permit attributes.`,
        icon: MapPin,
        tone: gisReadyAssets.length === totalAssets ? 'green' : 'amber',
        formula: `Assets with valid coordinates plus market, route, address, format, dimensions, permit status and attributes divided by total assets. Current calculation: ${gisReadyAssets.length} / ${totalAssets}.`,
        deepDive: 'This is the map-trust score. It confirms whether the GIS can be used as a real operating layer instead of just a visual map, because every marker must carry the attributes needed for planning, survey routing and client proof.',
        painPoint: 'Bad GIS data sends field teams to the wrong place and weakens client proof because location, route, market, and asset attributes cannot be trusted.',
        rootCause: 'One or more asset records are missing the attributes needed to make the map operational: GPS, address, route, format, dimensions, permit status or field tags.',
        solutionSteps: ['Open the GIS view and inspect the affected marker.', 'Update the asset record with route, market, format, dimensions and permit context.', 'Use the corrected attributes to drive survey routing and client proof maps.'],
        signals: ['GPS latitude/longitude', 'market', 'route', 'address', 'format', 'dimensions', 'permit status'],
        records: gisGapAssets.slice(0, 9).map(asset => assetMetricRecord(
          asset,
          'Missing or incomplete GIS attributes',
          'GIS',
          'Open GIS Asset',
          undefined,
          {
            urgency: 'Critical',
            painPoint: 'The asset cannot be trusted for routing, map proof or market reporting until its GIS attributes are complete.',
            solution: 'Open the marker, confirm the physical location, then update missing coordinates and asset attributes.',
          },
        )),
        action: 'Open GIS to inspect clusters, then update any asset records missing route, permit, or location attributes.',
        actionLabel: 'Open GIS Asset',
        actionAssetId: gisGapAssets[0]?.id ?? data.assets[0]?.id,
        tab: 'GIS',
      },
      {
        id: 'permit-attention',
        label: 'Permit Attention',
        value: permitWatchAssets.length,
        note: `${permitWatchAssets.length} assets have pending, expiring or expired permit status.`,
        icon: ShieldCheck,
        tone: permitWatchAssets.length ? 'amber' : 'green',
        formula: `Count assets where permit status is Pending, Expiring or Expired. Current calculation: ${permitWatchAssets.length} / ${totalAssets}.`,
        deepDive: 'This metric isolates compliance work from field proof work. It helps the operator avoid publishing or scheduling activity against assets that need permit follow-up.',
        painPoint: 'Permit issues can block installation, renewal, client publishing, or continued display even when field proof looks complete.',
        rootCause: 'Permit state or expiry date requires attention before the asset should be treated as clean for operations and client evidence.',
        solutionSteps: ['Open the asset record and verify permit status and expiry.', 'Attach or update the permit/NOC reference when available.', 'Flag assets that need owner or authority follow-up before client publication.'],
        signals: ['asset.permitStatus', 'asset.permitExpiry', 'owner/site', 'route'],
        records: permitWatchAssets.slice(0, 9).map(asset => assetMetricRecord(
          asset,
          `${asset.permitStatus}, expires ${formatDate(asset.permitExpiry)}`,
          'Assets',
          'Update Permit',
          undefined,
          {
            urgency: asset.permitStatus === 'Expired' ? 'Critical' : 'Attention',
            painPoint: `${asset.permitStatus} permit status can block operations or weaken the evidence pack for this asset.`,
            solution: 'Open the asset profile, update permit status and expiry, then attach the latest permit reference.',
          },
        )),
        action: 'Open Assets to update permit status and attach the latest permit or NOC before client sharing.',
        actionLabel: 'Open Permit Asset',
        actionAssetId: permitWatchAssets[0]?.id,
        tab: 'Assets',
      },
      {
        id: 'review-backlog',
        label: 'Review Backlog',
        value: pendingSubmissions.length,
        note: `${pendingSubmissions.length} captured survey submissions are waiting for reviewer decision.`,
        icon: Camera,
        tone: pendingSubmissions.length ? 'amber' : 'green',
        formula: `Count submissions where review status is Pending Review. Current calculation: ${pendingSubmissions.length}.`,
        deepDive: 'This is the operational queue between field capture and client-ready proof. It keeps photo evidence, QR/GPS checks, checklist issues and reviewer decisions in one place.',
        painPoint: 'Captured evidence has no value for the client until a reviewer approves it. Backlog turns completed field work into a publishing bottleneck.',
        rootCause: 'Survey submissions are waiting for reviewer decision, or they contain issues that need approval/rejection with clear correction notes.',
        solutionSteps: ['Open the oldest pending submission first.', 'Approve clean proof immediately when photo, GPS and QR checks pass.', 'Reject incomplete evidence with a precise rework reason so the field team can recapture it.'],
        signals: ['submission.status', 'submission.score', 'issues', 'evidence files', 'reviewer'],
        records: pendingSubmissions.slice(0, 9).map(submission => {
          const asset = data.assets.find(item => item.id === submission.assetId);
          return {
            id: submission.id,
            title: asset?.name ?? submission.assetId,
            detail: `${submission.score}% by ${submission.submittedBy}`,
            painPoint: submission.issues.length
              ? `Submission is waiting for review and has issues: ${submission.issues.join(', ')}.`
              : 'Submission is waiting for approval before it can become client-ready proof.',
            solution: 'Open the submission, compare photo/GPS/QR evidence against the checklist, then approve or reject with a reason.',
            tab: 'Evidence' as const,
            actionLabel: 'Review Submission',
            urgency: submission.issues.length ? 'Critical' as const : 'Attention' as const,
            assetId: submission.assetId,
            submissionId: submission.id,
          };
        }),
        action: 'Open Evidence to approve clean submissions or reject them with a reason for field correction.',
        actionLabel: 'Review Submission',
        actionAssetId: pendingSubmissions[0]?.assetId,
        actionSubmissionId: pendingSubmissions[0]?.id,
        tab: 'Evidence',
      },
      {
        id: 'dooh-player-readiness',
        label: 'DOOH Player Readiness',
        value: digitalAssets.length ? `${percent(digitalReadyAssets.length, digitalAssets.length)}%` : 'N/A',
        note: `${digitalReadyAssets.length}/${digitalAssets.length} digital assets have online power, player and uptime above threshold.`,
        icon: MonitorUp,
        tone: digitalReadyAssets.length === digitalAssets.length ? 'green' : 'amber',
        formula: `Digital assets with Online power, Online player and uptime at or above 98%, divided by digital assets. Current calculation: ${digitalReadyAssets.length} / ${digitalAssets.length}.`,
        deepDive: 'This keeps the DOOH part of the network operationally visible. It focuses on screen/player readiness instead of blending digital operations into a vague network health score.',
        painPoint: 'Digital assets can look installed on paper while the player, power, or uptime state quietly prevents reliable campaign playback.',
        rootCause: 'Digital screens need a separate readiness check because power, player and uptime signals change faster than static asset attributes.',
        solutionSteps: ['Open the digital asset record and confirm power/player state.', 'Prioritize offline players or uptime below threshold.', 'Use the corrected player status in client reporting and survey assignment.'],
        signals: ['asset.format', 'illumination', 'powerStatus', 'playerStatus', 'playerUptime'],
        records: digitalAttentionAssets.slice(0, 9).map(asset => assetMetricRecord(
          asset,
          `Power ${asset.powerStatus}, player ${asset.playerStatus}, uptime ${asset.playerUptime ?? 0}%`,
          'Assets',
          'Open Digital Asset',
          undefined,
          {
            urgency: asset.powerStatus !== 'Online' || asset.playerStatus !== 'Online' ? 'Critical' : 'Attention',
            painPoint: 'This digital asset is not fully playback-ready, so campaign confidence depends on follow-up.',
            solution: 'Open the digital asset, verify player/power details, then assign maintenance or a field check if the signal remains unhealthy.',
          },
        )),
        action: 'Open Assets or GIS and prioritize digital screens with offline players, low uptime, or missing player details.',
        actionLabel: 'Open Digital Asset',
        actionAssetId: digitalAttentionAssets[0]?.id,
        tab: 'Assets',
      },
    ];
  }, [data]);
  const selectedMetric = metricInsights.find(metric => metric.id === activeMetricId) ?? metricInsights[0];
  const modalMetric = metricInsights.find(metric => metric.id === metricModalId) ?? null;
  const handleMetricExplain = (metricId: string) => {
    setActiveMetricId(metricId);
    setMetricModalId(metricId);
  };

  const openMetricTarget = ({ tab, assetId, submissionId }: { tab: OOHTab; assetId?: string; submissionId?: string }) => {
    setMetricModalId(null);
    const targetAsset = assetId ? data.assets.find(asset => asset.id === assetId) : undefined;
    if (targetAsset) {
      setSelectedAssetId(targetAsset.id);
      if (tab === 'GIS' || tab === 'Assets') {
        setMarketFilter(targetAsset.market);
      }
      if (tab === 'Surveys') {
        const dueDate = Number.isFinite(Date.parse(targetAsset.nextSurveyDue)) ? targetAsset.nextSurveyDue.slice(0, 10) : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        setAssignmentForm(current => ({
          ...current,
          assetId: targetAsset.id,
          name: `${targetAsset.name} recurring proof and condition survey`,
          recurrence: 'Weekly',
          dueDate,
        }));
      }
    }
    setHighlightSubmissionId(submissionId ?? '');
    setActiveTab(tab);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const runMetricAction = (metric: MetricInsight) => {
    openMetricTarget({ tab: metric.tab, assetId: metric.actionAssetId, submissionId: metric.actionSubmissionId });
  };

  const runMetricRecordAction = (record: MetricRecord) => {
    openMetricTarget({ tab: record.tab, assetId: record.assetId, submissionId: record.submissionId });
  };
  const marketClusters = marketOptions.filter(option => option !== 'All markets').map(market => {
    const assets = data.assets.filter(asset => asset.market === market);
    return {
      market,
      assets,
      blockers: assets.filter(assetNeedsAction).length,
      proofReady: assets.filter(asset => asset.evidenceStatus === 'Ready').length,
    };
  }).filter(row => row.assets.length > 0);
  const runMutation = async (task: () => Promise<OOHBootstrap>) => {
    setBusy(true);
    try {
      const store = await task();
      setData(store);
      const firstAssetId = store.assets[0]?.id ?? '';
      setSelectedAssetId(current => store.assets.some(asset => asset.id === current) ? current : firstAssetId);
    } catch {
      // Local persistence can be unavailable during offline review.
    } finally {
      setBusy(false);
    }
  };

  const openAssetIntakeWizard = () => {
    setAssetIntakeMode('choice');
    setBulkAssetRows([]);
    setBulkFileName('');
    setBulkUploadError('');
    setAssetModalOpen(true);
  };

  const closeAssetIntake = () => {
    setAssetModalOpen(false);
    setAssetIntakeMode('choice');
    setBulkUploadError('');
  };

  const handleCreateAsset = () => {
    closeAssetIntake();
    void runMutation(async () => createOOHAsset(assetPayloadFromForm(assetForm)));
    setActiveTab('GIS');
  };

  const handleBulkFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkUploadError('');
    try {
      const rows = parseBulkAssetCsv(await file.text());
      if (!rows.length) {
        setBulkAssetRows([]);
        setBulkUploadError('No asset rows were found. Upload a CSV with asset name, format, dimensions, market, route, address, gps lat, gps lng, frequency and network.');
        return;
      }
      setBulkAssetRows(rows);
    } catch {
      setBulkAssetRows([]);
      setBulkUploadError('The file could not be read. Please use a CSV export from the asset register.');
    }
  };

  const handleLoadPreparedBulkAssets = () => {
    setBulkAssetRows(buildPreparedBulkAssets());
    setBulkFileName('prepared-ooh-bulk-upload.csv');
    setBulkUploadError('');
  };

  const handleBulkImport = () => {
    if (!bulkAssetRows.length) {
      setBulkUploadError('Upload a CSV or load the prepared bulk file before importing assets.');
      return;
    }
    const rowsToImport = bulkAssetRows;
    closeAssetIntake();
    void runMutation(async () => {
      let store = data;
      for (const row of rowsToImport) {
        store = await createOOHAsset(assetPayloadFromForm(row, ['Bulk upload', 'Awaiting first field survey']));
      }
      return store;
    });
    setActiveTab('GIS');
  };

  const handleAssetPatch = (updates: Partial<OOHAsset>) => {
    if (!selectedAsset) return;
    void runMutation(() => updateOOHAsset(selectedAsset.id, updates));
  };

  const handleCreateAssignment = () => {
    const asset = data.assets.find(item => item.id === assignmentForm.assetId) ?? selectedAsset;
    if (!asset) return;
    void runMutation(() => createOOHAssignment({
      name: assignmentForm.name,
      assetIds: [asset.id],
      team: assignmentForm.team,
      vendor: assignmentForm.vendor,
      recurrence: assignmentForm.recurrence,
      dueDate: new Date(assignmentForm.dueDate).toISOString(),
      reviewer: assignmentForm.reviewer,
      status: 'Active',
      progress: 0,
      accessRules: { qrScan: true, gpsRequired: true, photoRequired: true, signatureRequired: true },
      questions: oohSurveyQuestions,
    }));
    setActiveTab('Surveys');
  };

  const handleReview = (submission: OOHSubmission, status: OOHReviewStatus) => {
    void runMutation(() => reviewOOHSubmission(submission.id, {
      status,
      reviewer: submission.reviewer,
      reviewerNotes: status === 'Approved' ? 'Approved for client evidence page.' : 'Returned to field team for corrected proof.',
      clientPublishStatus: status === 'Approved' ? 'Published' : 'Blocked',
    }));
  };

  const handleCreateClientPage = () => {
    if (!selectedAsset) return;
    const campaignAssets = data.assets.filter(asset => asset.campaign === selectedAsset.campaign);
    void runMutation(() => createOOHClientPage({
      client: selectedAsset.client,
      campaign: selectedAsset.campaign,
      title: `${selectedAsset.campaign} evidence page`,
      assetIds: campaignAssets.length ? campaignAssets.map(asset => asset.id) : [selectedAsset.id],
      status: 'Live',
    }));
    setActiveTab('Clients');
  };

  const handleCreateClientPageForBooking = (row: OOHClientBookingRow) => {
    setSelectedAssetId(row.primaryAsset.id);
    void runMutation(() => createOOHClientPage({
      client: row.client,
      campaign: row.campaign,
      title: `${row.campaign} evidence page`,
      assetIds: row.assets.map(asset => asset.id),
      status: 'Live',
    }));
    setActiveTab('Clients');
  };

  const copyLink = async (path: string) => {
    const shareUrl = absolutePath(path);
    let copied = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
    } catch {
      const helper = document.createElement('textarea');
      helper.value = shareUrl;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        document.body.removeChild(helper);
      }
    }
    setCopyNotice({ path, copied });
    window.setTimeout(() => {
      setCopyNotice(current => current?.path === path ? null : current);
    }, 2200);
  };

  const focusAssetForSurvey = () => {
    if (!selectedAsset) return;
    setAssignmentForm(current => ({ ...current, assetId: selectedAsset.id, name: `${selectedAsset.name} proof and condition survey` }));
    setActiveTab('Surveys');
  };
  const openAssetLocation = (asset: OOHAsset) => {
    setSelectedAssetId(asset.id);
    setLocationAssetId(asset.id);
  };
  const openSelectedAssetLocation = () => {
    if (!selectedAsset) return;
    openAssetLocation(selectedAsset);
  };
  const openSelectedAssetInGIS = () => {
    if (!selectedAsset) return;
    setSelectedAssetId(selectedAsset.id);
    setMarketFilter(selectedAsset.market);
    setLocationAssetId(null);
    setActiveTab('GIS');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };
  const reviewProofForSelectedAsset = () => {
    if (!selectedAsset) return;
    const latestSubmission = latestInspectionForAsset(selectedAsset.id, data.submissions);
    setSelectedAssetId(selectedAsset.id);
    setHighlightSubmissionId(latestSubmission?.id ?? '');
    setActiveTab('Evidence');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };
  const openWorkOrderForSelectedAsset = () => {
    if (!selectedAsset) return;
    setSelectedAssetId(selectedAsset.id);
    setActiveTab('Work Orders');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };
  const openClientPagesForSelectedAsset = () => {
    if (!selectedAsset) return;
    setSelectedAssetId(selectedAsset.id);
    setActiveTab('Clients');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };
  const openLocationAssetInGIS = (asset: OOHAsset) => {
    setSelectedAssetId(asset.id);
    setMarketFilter(asset.market);
    setLocationAssetId(null);
    setActiveTab('GIS');
  };
  const assignSurveyFromLocation = (asset: OOHAsset) => {
    setSelectedAssetId(asset.id);
    setAssignmentForm(current => ({ ...current, assetId: asset.id, name: `${asset.name} proof and condition survey` }));
    setLocationAssetId(null);
    setActiveTab('Surveys');
  };
  const closeCampaignWizard = () => {
    setCampaignModalOpen(false);
    setCampaignStep(1);
  };
  const updateCampaignAsset = (assetId: string) => {
    const asset = data.assets.find(item => item.id === assetId);
    if (!asset) return;
    setSelectedAssetId(asset.id);
    setCampaignForm(buildCampaignForm(asset));
    setCampaignArtworkUpload(null);
  };
  const startCampaignFlow = () => {
    const asset = selectedAsset ?? data.assets[0];
    setCampaignForm(buildCampaignForm(asset));
    setCampaignArtworkUpload(null);
    setCampaignStep(1);
    setCampaignModalOpen(true);
  };
  const handleCampaignArtworkUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const typeLabel = file.type || file.name.split('.').pop()?.toUpperCase() || 'Artwork file';
    const sizeLabel = formatFileSize(file.size);
    const uploadedAt = new Date().toISOString();
    setCampaignArtworkUpload({
      name: file.name,
      type: typeLabel,
      sizeLabel,
      uploadedAt,
    });
    setCampaignForm(current => ({
      ...current,
      artworkFile: file.name,
      artworkTitle: current.artworkTitle.trim() ? current.artworkTitle : fileTitle(file.name),
      artworkSpec: `${campaignAsset?.dimensions ?? 'Asset dimensions'} - ${typeLabel} - ${sizeLabel}`,
    }));
    event.target.value = '';
  };
  const handleStartCampaign = () => {
    const asset = data.assets.find(item => item.id === campaignForm.assetId) ?? selectedAsset;
    if (!asset) return;
    const bookedFrom = new Date(`${campaignForm.bookedFrom}T08:00:00`).toISOString();
    const bookedTo = new Date(`${campaignForm.bookedTo}T20:00:00`).toISOString();
    const attributes = mergeAssetAttributes(asset, {
      'Artwork title': campaignForm.artworkTitle,
      'Artwork file': campaignForm.artworkFile,
      'Artwork spec': campaignForm.artworkSpec,
      'Artwork state': 'Artwork commissioned',
      'Artwork upload': campaignArtworkUpload ? `${campaignArtworkUpload.name} (${campaignArtworkUpload.sizeLabel}, ${campaignArtworkUpload.type})` : '',
      'Install owner': campaignForm.installOwner,
      'Installation due': campaignForm.installationDueDate,
      'Work order assignment': campaignForm.workOrderAssignment,
    });
    closeCampaignWizard();
    setSelectedAssetId(asset.id);
    void runMutation(async () => {
      let store = await updateOOHAsset(asset.id, {
        campaign: campaignForm.campaign,
        client: campaignForm.client,
        buyerContact: campaignForm.buyerContact,
        bookedFrom,
        bookedTo,
        installSla: campaignForm.installSla,
        proofSla: campaignForm.proofSla,
        status: asset.installStatus === 'Installed' ? 'Live' : 'Install Due',
        installStatus: asset.installStatus === 'Installed' ? 'Installed' : 'Scheduled',
        evidenceStatus: asset.evidenceStatus === 'Ready' ? 'Ready' : asset.evidenceStatus,
        attributes,
      });

      if (campaignForm.workOrderAssignment !== 'Campaign booking only') {
        const assignmentName = campaignForm.workOrderAssignment === 'Create proof survey only'
          ? `${campaignForm.campaign} proof survey`
          : `${campaignForm.campaign} installation work order`;
        store = await createOOHAssignment({
          name: assignmentName,
          assetIds: [asset.id],
          team: campaignForm.installOwner || 'Unassigned installation team',
          vendor: campaignForm.installOwner || 'Assigned vendor',
          recurrence: 'One-time',
          dueDate: new Date(`${campaignForm.installationDueDate}T17:00:00`).toISOString(),
          reviewer: 'Maya Haddad',
          status: 'Active',
          progress: 0,
          accessRules: { qrScan: true, gpsRequired: true, photoRequired: true, signatureRequired: true },
          questions: oohSurveyQuestions,
        });
      }

      return store;
    });
    setActiveTab('Work Orders');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  return (
    <div className="min-h-screen bg-[#07111F] text-[#EEF3FA]">
      <div className="flex min-h-screen">
        <OOHSideNav activeTab={activeTab} onChange={navigateToTab} />
        <div className="min-w-0 flex-1">
          <header className="border-b border-white/10 bg-[#081426]/95 px-4 py-4 backdrop-blur">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#7EB8F7]">4C360 OOH Asset Intelligence</p>
                <h1 className="mt-1 text-2xl font-black text-white md:text-4xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Proof and Control Center</h1>
                <p className="mt-2 max-w-3xl text-sm text-[#B8C7DB]">One operating flow for OOH inventory, installation evidence, field surveys, approvals and secure client proof pages.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={openAssetIntakeWizard}>
                  <Plus size={16} /> Add Asset
                </button>
                <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={startCampaignFlow}>
                  <CalendarClock size={16} /> Start Campaign
                </button>
                <button className="inline-flex items-center gap-2 rounded-lg bg-[#E11D2E] px-3 py-2 text-sm font-bold text-white hover:bg-[#ff3445]" onClick={handleCreateClientPage} disabled={!selectedAsset || busy}>
                  <Link2 size={16} /> Share Evidence
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1500px] px-4 py-5">
        {activeTab === 'Command' && (
          <section className="space-y-5">
            <LiveOperationsGisPanel
              assets={data.assets}
              assignments={data.assignments}
              submissions={data.submissions}
              selectedAssetId={selectedAssetId}
              onSelectAsset={setSelectedAssetId}
              onOpenGIS={() => setActiveTab('GIS')}
              onOpenAssets={() => setActiveTab('Assets')}
              onOpenSurveys={() => setActiveTab('Surveys')}
              onOpenEvidence={() => setActiveTab('Evidence')}
              onOpenObligations={() => setActiveTab('Obligations')}
            />

            <div className="grid gap-3 lg:grid-cols-3">
              {metricInsights.slice(0, 3).map(metric => (
                <MetricCard key={metric.id} metric={metric} selected={selectedMetric.id === metric.id} updatedAt={metricsUpdatedAt} onOpen={handleMetricExplain} />
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {metricInsights.slice(3).map(metric => (
                <MetricCard key={metric.id} metric={metric} selected={selectedMetric.id === metric.id} updatedAt={metricsUpdatedAt} onOpen={handleMetricExplain} />
              ))}
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[1fr_0.85fr]">
              <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">AI priority queue</p>
                    <h2 className="mt-1 text-lg font-black text-white">What to fix before the next client share</h2>
                  </div>
                  <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{`${actionBlockers} action blocker${actionBlockers === 1 ? '' : 's'}`}</Pill>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {metricInsights.filter(metric => metric.records.length > 0).slice(0, 3).map(metric => (
                    <button
                      key={metric.id}
                      type="button"
                      className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-left hover:border-[#7EB8F7]/40"
                      onClick={() => handleMetricExplain(metric.id)}
                    >
                      <p className="text-sm font-black text-white">{metric.label}</p>
                      <p className="mt-2 text-xs leading-5 text-[#9DB4D0]">{metric.records[0]?.title} - {metric.records[0]?.detail}</p>
                      <p className="mt-3 text-xs font-bold text-[#7EB8F7]">Open AI work queue</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-black text-white">Evidence Queue</h2>
                  <Pill>{`${pendingSubmissions.length} Pending Review`}</Pill>
                </div>
                <div className="space-y-3">
                  {pendingSubmissions.map(submission => {
                    const asset = data.assets.find(item => item.id === submission.assetId);
                    return (
                      <div key={submission.id} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-white">{asset?.name ?? submission.assetId}</p>
                            <p className="mt-1 text-xs text-[#9DB4D0]">{submission.submittedBy} - {formatDateTime(submission.submittedAt)}</p>
                          </div>
                          <span className={`text-lg font-black ${scoreTone(submission.score)}`}>{submission.score}</span>
                        </div>
                        {submission.issues.length > 0 && <p className="mt-2 text-xs text-amber-100">{submission.issues.join(', ')}</p>}
                        <div className="mt-3 flex gap-2">
                          <button className="rounded-lg bg-emerald-400/12 px-3 py-2 text-xs font-bold text-emerald-100" onClick={() => handleReview(submission, 'Approved')}>Approve</button>
                          <button className="rounded-lg bg-red-400/12 px-3 py-2 text-xs font-bold text-red-100" onClick={() => handleReview(submission, 'Rejected')}>Reject</button>
                        </div>
                      </div>
                    );
                  })}
                  {pendingSubmissions.length === 0 && <p className="rounded-lg border border-white/10 bg-[#07111F] p-4 text-sm text-[#9DB4D0]">No pending evidence. Approved proof can be shared with clients.</p>}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-black text-white">Integration Confidence</h2>
                  <p className="mt-1 text-sm text-[#9DB4D0]">4C360 reconciles booking, field proof, player state and documents through monitored operating feeds.</p>
                </div>
                <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">Monitored feeds</Pill>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {integrationFeeds.map(feed => (
                  <div key={feed.name} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-white">{feed.name}</p>
                      <Pill tone={feed.status === 'Synced' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-300/25 bg-amber-300/10 text-amber-100'}>{feed.status}</Pill>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#9DB4D0]">{feed.source}</p>
                    <p className="mt-3 font-mono text-[11px] text-[#7A94B4]">{feed.at}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'Assets' && (
          <section className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="min-w-0 rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-black text-white">OOH Asset Register</h2>
                <div className="flex flex-wrap gap-2">
                  <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm text-[#9DB4D0]">
                    <Search size={15} />
                    <input className="w-44 bg-transparent text-white outline-none placeholder:text-[#58708E]" placeholder="Search assets" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} />
                  </label>
                  <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm text-[#9DB4D0]">
                    <Filter size={15} />
                    <select className="bg-transparent text-white outline-none" value={marketFilter} onChange={event => setMarketFilter(event.target.value)}>
                      {marketOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="custom-scrollbar mt-4 max-w-full overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                  <thead className="bg-[#07111F] text-[11px] uppercase tracking-wide text-[#7A94B4]">
                    <tr>
                      <th className="px-4 py-3">Asset</th>
                      <th className="px-4 py-3">Market</th>
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">Readiness</th>
                      <th className="w-[124px] px-4 py-3">Permit</th>
                      <th className="w-[132px] px-4 py-3">Evidence</th>
                      <th className="w-[92px] px-4 py-3">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map(asset => (
                      <tr
                        key={asset.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select ${asset.name} in the asset inspector`}
                        className={`cursor-pointer border-t border-white/10 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7EB8F7] ${asset.id === selectedAssetId ? 'bg-[#2E7FFF]/8' : ''}`}
                        onClick={() => setSelectedAssetId(asset.id)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedAssetId(asset.id);
                          }
                        }}
                      >
                        <td className="px-4 py-4 align-middle">
                          <span className="block text-left">
                            <span className="block font-black text-white">{asset.name}</span>
                            <span className="text-xs text-[#7A94B4]">{asset.id} - {asset.format} - {asset.dimensions}</span>
                          </span>
                        </td>
                        <td className="px-4 py-4 align-middle text-[#B8C7DB]">{asset.market}</td>
                        <td className="px-4 py-4 align-middle">
                          <span className="block font-bold text-white">{asset.campaign}</span>
                          <span className="text-xs text-[#7A94B4]">{asset.client}</span>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <span className="block font-bold text-white">{assetFlight(asset)}</span>
                          <span className={assetNeedsAction(asset) ? 'text-xs font-bold text-red-200' : 'text-xs font-bold text-emerald-200'}>{actionState(asset)}</span>
                        </td>
                        <td className="px-4 py-4 align-middle"><Pill className="min-w-[86px]">{asset.permitStatus}</Pill></td>
                        <td className="px-4 py-4 align-middle"><Pill className="min-w-[94px]">{asset.evidenceStatus}</Pill></td>
                        <td className={`px-4 py-4 align-middle text-lg font-black ${scoreTone(asset.healthScore)}`}>{asset.healthScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-5">
              {selectedAsset && (
                <AssetProfile
                  asset={selectedAsset}
                  latestSubmission={latestInspectionForAsset(selectedAsset.id, data.submissions)}
                  onPatch={handleAssetPatch}
                  onOpenLocation={openSelectedAssetLocation}
                  onOpenGIS={openSelectedAssetInGIS}
                  onAssignSurvey={focusAssetForSurvey}
                  onReviewProof={reviewProofForSelectedAsset}
                  onOpenWorkOrders={openWorkOrderForSelectedAsset}
                  onOpenClientPages={openClientPagesForSelectedAsset}
                />
              )}
            </div>
          </section>
        )}

        {activeTab === 'GIS' && (
          <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black text-white">GIS Asset Map</h2>
                  <p className="mt-1 text-sm text-[#9DB4D0]">Live layers for formats, permits, proof status, GPS and campaign coverage.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill tone="border-emerald-400/25 bg-emerald-400/10 text-emerald-200">Ready</Pill>
                  <Pill tone="border-amber-300/25 bg-amber-300/10 text-amber-100">Pending</Pill>
                  <Pill tone="border-red-400/25 bg-red-400/10 text-red-200">Issue</Pill>
                </div>
              </div>
              <OOHMap assets={filteredAssets.length ? filteredAssets : data.assets} submissions={data.submissions} selectedAssetId={selectedAssetId} onSelect={setSelectedAssetId} />
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {marketClusters.map(cluster => (
                  <button key={cluster.market} className={`rounded-lg border p-3 text-left ${marketFilter === cluster.market ? 'border-[#2E7FFF] bg-[#2E7FFF]/12' : 'border-white/10 bg-[#07111F]'}`} onClick={() => setMarketFilter(cluster.market)}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-white">{cluster.market}</p>
                      <span className="text-xs font-bold text-[#7EB8F7]">{cluster.assets.length} unit{cluster.assets.length === 1 ? '' : 's'}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#9DB4D0]">{cluster.proofReady} proof ready - {cluster.blockers} action blocker{cluster.blockers === 1 ? '' : 's'}</p>
                  </button>
                ))}
              </div>
            </div>
            {selectedAsset && (
              <AssetProfile
                asset={selectedAsset}
                latestSubmission={latestInspectionForAsset(selectedAsset.id, data.submissions)}
                onPatch={handleAssetPatch}
                onOpenLocation={openSelectedAssetLocation}
                onOpenGIS={openSelectedAssetInGIS}
                onAssignSurvey={focusAssetForSurvey}
                onReviewProof={reviewProofForSelectedAsset}
                onOpenWorkOrders={openWorkOrderForSelectedAsset}
                onOpenClientPages={openClientPagesForSelectedAsset}
              />
            )}
          </section>
        )}

        {activeTab === 'Surveys' && (
          <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <h2 className="text-xl font-black text-white">Assign Field Survey</h2>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Asset scope<select className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assignmentForm.assetId} onChange={event => setAssignmentForm({ ...assignmentForm, assetId: event.target.value })}>{data.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.id} - {asset.name}</option>)}</select></label>
                <label className="block text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Survey name<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assignmentForm.name} onChange={event => setAssignmentForm({ ...assignmentForm, name: event.target.value })} /></label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Team<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assignmentForm.team} onChange={event => setAssignmentForm({ ...assignmentForm, team: event.target.value })} /></label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Vendor<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assignmentForm.vendor} onChange={event => setAssignmentForm({ ...assignmentForm, vendor: event.target.value })} /></label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Recurrence<select className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assignmentForm.recurrence} onChange={event => setAssignmentForm({ ...assignmentForm, recurrence: event.target.value as AssignmentForm['recurrence'] })}>{recurrenceOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Due date<input type="date" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assignmentForm.dueDate} onChange={event => setAssignmentForm({ ...assignmentForm, dueDate: event.target.value })} /></label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Reviewer<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assignmentForm.reviewer} onChange={event => setAssignmentForm({ ...assignmentForm, reviewer: event.target.value })} /></label>
                </div>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#E11D2E] px-4 py-3 text-sm font-bold text-white" onClick={handleCreateAssignment} disabled={busy}>
                  <ClipboardCheck size={16} /> Create Mobile Assignment
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <h2 className="text-xl font-black text-white">Survey Campaign Control</h2>
              <div className="mt-4 grid gap-3">
                {data.assignments.map(assignment => {
                  const assignmentAssets = data.assets.filter(asset => assignment.assetIds.includes(asset.id));
                  const link = `/ooh/field/${assignment.id}`;
                  return (
                    <div key={assignment.id} className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-[#7A94B4]">{assignment.id}</p>
                          <h3 className="mt-1 text-lg font-black text-white">{assignment.name}</h3>
                          <p className="mt-1 text-sm text-[#9DB4D0]">{assignment.team} - {assignment.vendor} - due {formatDate(assignment.dueDate)}</p>
                        </div>
                        <Pill>{assignment.status}</Pill>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {assignmentAssets.map(asset => <Pill key={asset.id}>{asset.id}</Pill>)}
                        <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{assignment.recurrence}</Pill>
                        {assignment.accessRules.qrScan && <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">QR required</Pill>}
                        {assignment.accessRules.gpsRequired && <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">GPS lock</Pill>}
                        {assignment.accessRules.photoRequired && <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">Photo proof</Pill>}
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#112040]">
                        <div className="h-full rounded-full bg-[#2E7FFF]" style={{ width: `${assignment.progress}%` }} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <a className="inline-flex items-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-xs font-bold text-white" href={link}>
                          <QrCode size={14} /> Open Mobile Capture
                        </a>
                        <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white" onClick={() => void copyLink(link)}>
                          <Copy size={14} /> {copyNotice?.path === link ? (copyNotice.copied ? 'Copied' : 'Copy blocked') : 'Copy Link'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'Evidence' && (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-black text-white">Proof-of-Installation Workbench</h2>
                  <p className="mt-1 text-sm text-[#9DB4D0]">Review captured field photos, QR/GPS integrity and client publishing state in one place.</p>
                </div>
                <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{`${data.submissions.length} submissions`}</Pill>
              </div>
              <div className="mt-5 space-y-4">
                {data.submissions.map(submission => {
                  const asset = data.assets.find(item => item.id === submission.assetId);
                  const photoEvidence = submission.evidence.filter(item => item.type === 'photo');
                  const primaryPhoto = photoEvidence[0];
                  return (
                    <div
                      key={submission.id}
                      className={`rounded-lg border p-4 transition ${
                        highlightSubmissionId === submission.id
                          ? 'border-[#2E7FFF] bg-[#2E7FFF]/12 shadow-lg shadow-blue-500/10'
                          : 'border-white/10 bg-[#07111F]'
                      }`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-[#7A94B4]">{submission.id}</p>
                          <h3 className="mt-1 text-lg font-black text-white">{asset?.name ?? submission.assetId}</h3>
                          <p className="mt-1 text-sm text-[#9DB4D0]">{submission.submittedBy} - {formatDateTime(submission.submittedAt)} - GPS {submission.gps.lat.toFixed(4)}, {submission.gps.lng.toFixed(4)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {highlightSubmissionId === submission.id && <Pill tone="border-blue-300/25 bg-blue-400/15 text-blue-100">Action target</Pill>}
                          <Pill>{submission.status}</Pill>
                          <span className={`text-2xl font-black ${scoreTone(submission.score)}`}>{submission.score}</span>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.72fr)]">
                        {primaryPhoto ? (
                          <EvidenceMediaPanel item={primaryPhoto} asset={asset} submission={submission} />
                        ) : (
                          <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#0B172A] p-6 text-center">
                            <div>
                              <Camera size={28} className="mx-auto text-[#7EB8F7]" />
                              <p className="mt-3 text-sm font-black text-white">No photo evidence captured</p>
                              <p className="mt-1 text-xs text-[#9DB4D0]">Send the field team back with a required photo checklist.</p>
                            </div>
                          </div>
                        )}
                        <div className="space-y-3">
                          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[10px] font-black uppercase tracking-wide text-[#7EB8F7]">Review Summary</p>
                              <a className="inline-flex items-center gap-1.5 text-xs font-black text-[#7EB8F7] hover:text-white" href={`/ooh/report/${submission.id}`}>
                                Inspection report <ExternalLink size={13} />
                              </a>
                            </div>
                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                              <div className="rounded-md border border-white/10 bg-[#07111F] p-3">
                                <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Reviewer</p>
                                <p className="mt-1 text-sm font-black text-white">{submission.reviewer}</p>
                              </div>
                              <div className="rounded-md border border-white/10 bg-[#07111F] p-3">
                                <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Evidence Files</p>
                                <p className="mt-1 text-sm font-black text-white">{submission.evidence.length} captured</p>
                              </div>
                            </div>
                            {submission.issues.length > 0 && <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">{submission.issues.join(', ')}</p>}
                            {submission.reviewerNotes && <p className="mt-3 rounded-lg border border-blue-300/20 bg-blue-300/10 p-3 text-sm text-blue-100">{submission.reviewerNotes}</p>}
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button className="rounded-lg bg-emerald-400/12 px-3 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-400/18" onClick={() => handleReview(submission, 'Approved')}>Approve Evidence</button>
                              <button className="rounded-lg bg-red-400/12 px-3 py-2 text-sm font-bold text-red-100 hover:bg-red-400/18" onClick={() => handleReview(submission, 'Rejected')}>Reject and Rework</button>
                            </div>
                          </div>
                          {submission.evidence.length > 1 && (
                            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                              <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">Supporting Evidence</p>
                              <div className="mt-3 grid gap-2">
                                {submission.evidence.slice(1).map(item => (
                                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-[#07111F] p-3">
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-black text-white">{item.label}</span>
                                      <span className="text-xs text-[#7A94B4]">{item.photoCategory ?? item.type.toUpperCase()} - {formatDate(item.capturedAt)}</span>
                                    </span>
                                    <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{item.syncStatus ?? 'Synced'}</Pill>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                <h2 className="text-xl font-black text-white">Permit & Compliance Register</h2>
                <div className="mt-4 space-y-3">
                  {data.assets.map(asset => (
                    <button key={asset.id} className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#07111F] p-3 text-left" onClick={() => setSelectedAssetId(asset.id)}>
                      <span>
                        <span className="block text-sm font-black text-white">{asset.name}</span>
                        <span className="text-xs text-[#9DB4D0]">Permit expires {formatDate(asset.permitExpiry)}</span>
                      </span>
                      <Pill>{asset.permitStatus}</Pill>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                <h2 className="text-xl font-black text-white">Workflow Approvals</h2>
                <div className="mt-4 grid gap-3">
                  {[
                    ['Media ops', 'Reviews booking, campaign and site match'],
                    ['Field supervisor', 'Confirms QR, GPS, checklist and photos'],
                    ['Client success', 'Publishes evidence page and export pack'],
                    ['Compliance', 'Tracks permit expiry and access approvals'],
                  ].map(([role, copy]) => (
                    <div key={role} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                      <div className="flex items-center gap-2 text-sm font-black text-white"><ShieldCheck size={16} className="text-emerald-200" /> {role}</div>
                      <p className="mt-1 text-xs text-[#9DB4D0]">{copy}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'Clients' && (
          <section className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">Active clients</p>
                <h2 className="mt-1 text-2xl font-black text-white">Campaign bookings and client share links</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-[#9DB4D0]">
                  One row per active client campaign, with booked assets, installation/proof state and the evidence link the account team can share.
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-300/20 bg-blue-300/10 px-4 py-2 text-sm font-bold text-blue-100">
                <Globe2 size={16} /> {clientBookingRows.length} active bookings
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                <thead className="bg-[#07111F] text-[11px] font-black uppercase tracking-wide text-[#7A94B4]">
                  <tr>
                    <th className="px-3 py-3">Client</th>
                    <th className="px-3 py-3">Campaign</th>
                    <th className="px-3 py-3">Outdoor asset booked</th>
                    <th className="px-3 py-3">Market / route</th>
                    <th className="px-3 py-3">Duration</th>
                    <th className="px-3 py-3">Install / proof</th>
                    <th className="px-3 py-3">Evidence page</th>
                    <th className="px-3 py-3">Last client view</th>
                    <th className="px-3 py-3 text-right">Share actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientBookingRows.map(row => {
                    const path = row.page ? `/ooh/client/${row.page.token}` : '';
                    const selected = row.assets.some(asset => asset.id === selectedAssetId);
                    return (
                      <tr
                        key={row.key}
                        tabIndex={0}
                        className={`cursor-pointer border-t border-white/10 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7EB8F7] ${selected ? 'bg-[#2E7FFF]/8' : 'bg-transparent'}`}
                        onClick={() => setSelectedAssetId(row.primaryAsset.id)}
                        onKeyDown={event => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedAssetId(row.primaryAsset.id);
                          }
                        }}
                      >
                        <td className="px-3 py-4 align-top">
                          <p className="font-black text-white">{row.client}</p>
                          <p className="mt-1 max-w-40 truncate text-xs text-[#7A94B4]">{row.primaryAsset.buyerContact ?? 'Buyer contact pending'}</p>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <p className="font-black text-white">{row.campaign}</p>
                          <p className="mt-1 text-xs text-[#7A94B4]">{row.assets.length} booked face{row.assets.length === 1 ? '' : 's'}</p>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <p className="max-w-52 font-black text-white">{clientBookingAssetLabel(row)}</p>
                          <p className="mt-1 text-xs text-[#7A94B4]">{row.primaryAsset.format} - {row.primaryAsset.dimensions}</p>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <p className="max-w-44 font-bold text-[#CFE3FA]">{clientBookingMarketRoute(row)}</p>
                          <p className="mt-1 text-xs text-[#7A94B4]">{row.primaryAsset.address}</p>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <p className="font-black text-white">{clientBookingDuration(row)}</p>
                          <p className="mt-1 text-xs text-[#7A94B4]">{row.primaryAsset.installSla ?? 'Install requirement pending'}</p>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <Pill tone={row.installState === 'Installed' ? statusTone('Installed') : statusTone('Pending')}>{row.installState}</Pill>
                            <Pill tone={row.proofState === 'Ready' ? statusTone('Ready') : statusTone('Pending')}>{row.proofState}</Pill>
                          </div>
                          <p className={`mt-2 text-xs font-bold ${row.openItems ? 'text-amber-100' : 'text-emerald-200'}`}>
                            {row.openItems ? `${row.openItems} open action${row.openItems === 1 ? '' : 's'}` : 'Client proof clear'}
                          </p>
                        </td>
                        <td className="px-3 py-4 align-top">
                          {row.page ? (
                            <>
                              <Pill>{row.page.status}</Pill>
                              <p className="mt-2 text-xs text-[#7A94B4]">
                                Expires {formatDate(row.page.expiresAt)} | {row.page.viewerCount ?? 0} view{(row.page.viewerCount ?? 0) === 1 ? '' : 's'}
                              </p>
                            </>
                          ) : (
                            <>
                              <Pill tone="border-amber-300/25 bg-amber-300/10 text-amber-100">No link</Pill>
                              <p className="mt-2 text-xs text-[#7A94B4]">Generate when proof is ready to share.</p>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-4 align-top">
                          <p className="font-bold text-[#CFE3FA]">
                            {row.page?.lastViewedAt
                              ? formatDateTime(row.page.lastViewedAt)
                              : row.primaryAsset.lastClientView
                                ? formatDateTime(row.primaryAsset.lastClientView)
                                : 'Not viewed yet'}
                          </p>
                          <p className="mt-1 text-xs text-[#7A94B4]">{row.page?.accessState ?? 'Access not issued'}</p>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            {row.page ? (
                              <>
                                <a
                                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-xs font-black text-white hover:bg-[#4B91FF]"
                                  href={path}
                                  onClick={event => event.stopPropagation()}
                                >
                                  <Eye size={14} /> Open Page
                                </a>
                                <button
                                  type="button"
                                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white hover:bg-white/10"
                                  onClick={event => {
                                    event.stopPropagation();
                                    void copyLink(path);
                                  }}
                                >
                                  <Copy size={14} /> {copyNotice?.path === path ? (copyNotice.copied ? 'Copied' : 'Copy blocked') : 'Copy Link'}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#E11D2E] px-3 py-2 text-xs font-black text-white hover:bg-[#ff3445] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={event => {
                                  event.stopPropagation();
                                  handleCreateClientPageForBooking(row);
                                }}
                                disabled={busy}
                              >
                                <Link2 size={14} /> Generate Link
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {clientBookingRows.length === 0 && (
              <div className="mt-5 rounded-lg border border-dashed border-blue-300/25 bg-[#07111F] p-6 text-center">
                <p className="text-lg font-black text-white">No active booked campaigns yet</p>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#9DB4D0]">
                  Start a campaign from the header or assign a client, campaign and future booking dates to an asset. It will appear here with client-share actions.
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === 'Work Orders' && (
          <OOHWorkOrders
            data={data}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            onOpenAssets={() => setActiveTab('Assets')}
            onOpenSurveys={() => setActiveTab('Surveys')}
            onOpenEvidence={() => setActiveTab('Evidence')}
            onOpenClientPages={() => setActiveTab('Clients')}
          />
        )}

        {activeTab === 'Obligations' && (
          <OOHObligations
            data={data}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            onOpenAssets={() => navigateToTab('Assets')}
            onOpenSurveys={() => navigateToTab('Surveys')}
            onOpenEvidence={() => navigateToTab('Evidence')}
            onOpenClientPages={() => navigateToTab('Clients')}
            onOpenWorkOrders={() => navigateToTab('Work Orders')}
          />
        )}

        {activeTab === 'Vendors' && (
          <OOHVendorIntelligence
            data={data}
            onOpenAssets={() => setActiveTab('Assets')}
            onOpenSurveys={() => setActiveTab('Surveys')}
            onOpenEvidence={() => setActiveTab('Evidence')}
            onOpenGIS={() => setActiveTab('GIS')}
            onSelectAsset={setSelectedAssetId}
          />
        )}

        {activeTab === 'Settings' && (
          <OOHSettings
            data={data}
            onOpenGIS={() => setActiveTab('GIS')}
            onOpenSurveys={() => setActiveTab('Surveys')}
            onOpenEvidence={() => setActiveTab('Evidence')}
            onOpenClientPages={() => setActiveTab('Clients')}
            onOpenVendors={() => setActiveTab('Vendors')}
          />
        )}

        {activeTab === 'Reports' && (
          <section className="grid gap-5 xl:grid-cols-3">
            {reportCards.map(({ id, title, text, icon: Icon }) => (
              <div key={id} className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-400/10 text-blue-100">
                  <Icon size={22} />
                </div>
                <h2 className="mt-4 text-lg font-black text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#9DB4D0]">{text}</p>
                <button
                  type="button"
                  aria-label={`Preview ${title}`}
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#2E7FFF] px-4 py-2 text-sm font-black text-white hover:bg-[#4B91FF]"
                  onClick={() => setActiveReportId(id)}
                >
                  <Eye size={15} /> Preview Report
                </button>
              </div>
            ))}
          </section>
        )}
          </main>
        </div>
      </div>
      <AssetLocationModal
        asset={locationAsset}
        onClose={() => setLocationAssetId(null)}
        onOpenGIS={openLocationAssetInGIS}
        onAssignSurvey={assignSurveyFromLocation}
      />
      <OOHReportPreviewModal report={activeReportPreview} onClose={() => setActiveReportId(null)} />
      {assetModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onClick={closeAssetIntake}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-ooh-asset-title"
            className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg border border-[#2E7FFF]/35 bg-[#081426] shadow-2xl shadow-black/50"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#0B172A] p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">OOH asset intake</p>
                <h2 id="add-ooh-asset-title" className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {assetIntakeMode === 'choice' && 'Add OOH Assets'}
                  {assetIntakeMode === 'single' && 'Add One OOH Asset'}
                  {assetIntakeMode === 'bulk' && 'Bulk Upload OOH Assets'}
                </h2>
                <p className="mt-1 text-sm text-[#9DB4D0]">
                  {assetIntakeMode === 'choice' && 'Choose how the operator wants to register inventory into GIS and the proof workflow.'}
                  {assetIntakeMode === 'single' && 'Create a GIS-ready asset record with campaign, location, format and first-proof context.'}
                  {assetIntakeMode === 'bulk' && 'Upload a CSV asset register, review the rows, then add the assets to GIS in one action.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close add asset"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#B8C7DB] hover:bg-white/10 hover:text-white"
                onClick={closeAssetIntake}
              >
                <X size={18} />
              </button>
            </div>

            <div className="custom-scrollbar max-h-[calc(92vh-88px)] overflow-y-auto p-4">
              {assetIntakeMode === 'choice' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    className="group min-h-[230px] rounded-lg border border-[#2E7FFF]/25 bg-[#07111F] p-5 text-left transition hover:border-[#7EB8F7]/70 hover:bg-[#0E213B]"
                    onClick={() => setAssetIntakeMode('single')}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#2E7FFF]/30 bg-[#2E7FFF]/12 text-[#9FC8FF]">
                      <Building2 size={22} />
                    </span>
                    <span className="mt-5 block text-xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Add One by One</span>
                    <span className="mt-3 block text-sm leading-6 text-[#B8C7DB]">Create a single asset record, place it on GIS, attach campaign context and send it into the first-proof workflow.</span>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#7EB8F7] group-hover:text-white">
                      Continue to form <ExternalLink size={14} />
                    </span>
                  </button>

                  <button
                    type="button"
                    className="group min-h-[230px] rounded-lg border border-[#2E7FFF]/25 bg-[#07111F] p-5 text-left transition hover:border-[#7EB8F7]/70 hover:bg-[#0E213B]"
                    onClick={() => setAssetIntakeMode('bulk')}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-300/10 text-emerald-100">
                      <UploadCloud size={22} />
                    </span>
                    <span className="mt-5 block text-xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Upload Bulk File</span>
                    <span className="mt-3 block text-sm leading-6 text-[#B8C7DB]">Import a CSV asset register with GPS, route, market, frequency and network fields, then review rows before adding them.</span>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#7EB8F7] group-hover:text-white">
                      Continue to upload <ExternalLink size={14} />
                    </span>
                  </button>
                </div>
              )}

              {assetIntakeMode === 'single' && (
                <>
                  <button
                    type="button"
                    className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#9DB4D0] hover:bg-white/10 hover:text-white"
                    onClick={() => setAssetIntakeMode('choice')}
                  >
                    Back to choices
                  </button>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Asset name<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.name} onChange={event => setAssetForm({ ...assetForm, name: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Format<select className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.format} onChange={event => setAssetForm({ ...assetForm, format: event.target.value })}>{assetFormatOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Dimensions<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.dimensions} onChange={event => setAssetForm({ ...assetForm, dimensions: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Market<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.market} onChange={event => setAssetForm({ ...assetForm, market: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Route<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.route} onChange={event => setAssetForm({ ...assetForm, route: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Address<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.address} onChange={event => setAssetForm({ ...assetForm, address: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">GPS lat<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.lat} onChange={event => setAssetForm({ ...assetForm, lat: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">GPS lng<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.lng} onChange={event => setAssetForm({ ...assetForm, lng: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">
                      Frequency
                      <select
                        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none"
                        value={assetForm.frequency}
                        onChange={event => setAssetForm({ ...assetForm, frequency: event.target.value })}
                      >
                        {assetFrequencyOptions.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <NetworkSelectWithNew value={assetForm.network} options={assetNetworkOptions} onChange={network => setAssetForm({ ...assetForm, network })} />
                  </div>
                  <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-[#9DB4D0]">New records are placed on GIS immediately and marked for first field proof.</p>
                    <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E11D2E] px-4 py-2 text-sm font-bold text-white hover:bg-[#ff3445] disabled:opacity-50" onClick={handleCreateAsset} disabled={busy}>
                      <Plus size={16} /> Add Asset
                    </button>
                  </div>
                </>
              )}

              {assetIntakeMode === 'bulk' && (
                <>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <button
                      type="button"
                      className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#9DB4D0] hover:bg-white/10 hover:text-white"
                      onClick={() => setAssetIntakeMode('choice')}
                    >
                      Back to choices
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <input id="ooh-bulk-upload" type="file" accept=".csv,text/csv" className="sr-only" onChange={handleBulkFileChange} />
                      <label htmlFor="ooh-bulk-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#2E7FFF]/35 bg-[#2E7FFF]/12 px-4 py-2 text-sm font-bold text-white hover:bg-[#2E7FFF]/20">
                        <UploadCloud size={16} /> Upload CSV
                      </label>
                      <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={handleLoadPreparedBulkAssets}>
                        <FileSearch size={16} /> Load Prepared File
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-white/10 bg-[#07111F] p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7A94B4]">Bulk file</p>
                        <p className="mt-1 text-lg font-black text-white">{bulkFileName || 'No file selected'}</p>
                      </div>
                      <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{`${bulkAssetRows.length} rows ready`}</Pill>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[#9DB4D0]">Expected CSV headers: asset name, format, dimensions, market, route, address, gps lat, gps lng, frequency, network.</p>
                    {bulkUploadError && <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100">{bulkUploadError}</p>}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead className="bg-[#07111F] text-[11px] uppercase tracking-wide text-[#7A94B4]">
                        <tr>
                          <th className="px-3 py-3">Asset</th>
                          <th className="px-3 py-3">Market</th>
                          <th className="px-3 py-3">Format</th>
                          <th className="px-3 py-3">GPS</th>
                          <th className="px-3 py-3">Network / Frequency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkAssetRows.slice(0, 6).map(row => (
                          <tr key={`${row.rowNumber}-${row.name}`} className="border-t border-white/10">
                            <td className="px-3 py-3">
                              <span className="block font-black text-white">{row.name}</span>
                              <span className="text-xs text-[#7A94B4]">{row.address}</span>
                            </td>
                            <td className="px-3 py-3 text-[#B8C7DB]">{row.market}</td>
                            <td className="px-3 py-3 text-[#B8C7DB]">{row.format}</td>
                            <td className="px-3 py-3 text-[#B8C7DB]">{row.lat}, {row.lng}</td>
                            <td className="px-3 py-3">
                              <span className="block font-bold text-white">{row.network}</span>
                              <span className="text-xs text-[#7A94B4]">{row.frequency}</span>
                            </td>
                          </tr>
                        ))}
                        {!bulkAssetRows.length && (
                          <tr>
                            <td colSpan={5} className="px-3 py-8 text-center text-sm text-[#9DB4D0]">Upload a CSV or load the prepared file to preview assets before import.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-[#9DB4D0]">{bulkAssetRows.length ? `${bulkAssetRows.length} assets will be added to GIS and marked for first proof.` : 'No assets are queued yet.'}</p>
                    <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E11D2E] px-4 py-2 text-sm font-bold text-white hover:bg-[#ff3445] disabled:opacity-50" onClick={handleBulkImport} disabled={busy || !bulkAssetRows.length}>
                      <UploadCloud size={16} /> Add {bulkAssetRows.length || ''} Assets
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {campaignModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onClick={closeCampaignWizard}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-campaign-title"
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-lg border border-[#2E7FFF]/35 bg-[#081426] shadow-2xl shadow-black/50"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#0B172A] p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7EB8F7]">OOH campaign commissioning</p>
                <h2 id="start-campaign-title" className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Start Campaign</h2>
                <p className="mt-1 text-sm text-[#9DB4D0]">Create the campaign work order with asset, artwork, flight dates, installation owner and proof rules.</p>
              </div>
              <button
                type="button"
                aria-label="Close start campaign"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#B8C7DB] hover:bg-white/10 hover:text-white"
                onClick={closeCampaignWizard}
              >
                <X size={18} />
              </button>
            </div>

            <div className="custom-scrollbar max-h-[calc(92vh-88px)] overflow-y-auto p-4">
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  [1, 'Asset & client', 'Choose the booked face and buyer'],
                  [2, 'Artwork & flight', 'Confirm creative and campaign duration'],
                  [3, 'Install & proof', 'Assign owner and evidence rules'],
                ].map(([step, label, helper]) => (
                  <button
                    key={String(step)}
                    type="button"
                    className={`min-h-[112px] rounded-lg border p-5 text-left transition ${campaignStep === step ? 'border-[#2E7FFF] bg-[#102343]' : 'border-white/10 bg-[#07111F] hover:border-[#7EB8F7]/45'}`}
                    onClick={() => setCampaignStep(step as CampaignWizardStep)}
                  >
                    <span className="flex items-center gap-3 text-base font-black text-white">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${campaignStep === step ? 'bg-[#2E7FFF] text-white' : 'bg-white/8 text-[#9DB4D0]'}`}>{step}</span>
                      {label}
                    </span>
                    <span className="mt-3 block text-sm leading-6 text-[#9DB4D0]">{helper}</span>
                  </button>
                ))}
              </div>

              {campaignStep === 1 && (
                <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">
                      Asset
                      <select
                        className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none"
                        value={campaignForm.assetId}
                        onChange={event => updateCampaignAsset(event.target.value)}
                      >
                        {data.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name} - {asset.market}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Campaign<input className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={campaignForm.campaign} onChange={event => setCampaignForm({ ...campaignForm, campaign: event.target.value })} /></label>
                    <ClientSelectWithNew label="Client" value={campaignForm.client} options={clientOptions} heightClass="h-11" onChange={client => setCampaignForm({ ...campaignForm, client })} />
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Buyer / brand contact<input className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={campaignForm.buyerContact} onChange={event => setCampaignForm({ ...campaignForm, buyerContact: event.target.value })} /></label>
                  </div>

                  <aside className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                    {campaignAsset && (
                      <>
                        <AssetPopupVisual asset={campaignAsset} className="h-36 w-full rounded-lg" />
                        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#7A94B4]">{campaignAsset.id}</p>
                        <h3 className="mt-1 text-lg font-black text-white">{campaignAsset.name}</h3>
                        <p className="mt-1 text-sm text-[#9DB4D0]">{campaignAsset.route} - {campaignAsset.market}</p>
                        <div className="mt-3 rounded-lg border border-white/10 bg-[#0B172A] p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7A94B4]">Media specification</p>
                          <p className="mt-1 text-sm font-black text-white">{campaignAsset.format}</p>
                          <p className="mt-1 text-sm text-[#B8C7DB]">{campaignAsset.dimensions}</p>
                        </div>
                      </>
                    )}
                  </aside>
                </div>
              )}

              {campaignStep === 2 && (
                <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Start date<input type="date" className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={campaignForm.bookedFrom} onChange={event => setCampaignForm({ ...campaignForm, bookedFrom: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">End date<input type="date" className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={campaignForm.bookedTo} onChange={event => setCampaignForm({ ...campaignForm, bookedTo: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Artwork title<input className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={campaignForm.artworkTitle} onChange={event => setCampaignForm({ ...campaignForm, artworkTitle: event.target.value })} /></label>
                    <div className="space-y-1 md:col-span-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Artwork file</p>
                      <div className="mt-1 flex flex-col gap-2 rounded-lg border border-white/10 bg-[#07111F] p-2 sm:flex-row sm:items-center">
                        <input
                          className="h-12 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#050D18] px-4 text-sm text-white outline-none"
                          value={campaignForm.artworkFile}
                          onChange={event => setCampaignForm({ ...campaignForm, artworkFile: event.target.value })}
                        />
                        <input
                          id="campaign-artwork-upload"
                          type="file"
                          accept=".pdf,.ai,.eps,.psd,.jpg,.jpeg,.png,.webp,.mp4,.mov,.zip,application/pdf,image/*,video/*"
                          className="sr-only"
                          onChange={handleCampaignArtworkUpload}
                        />
                        <label
                          htmlFor="campaign-artwork-upload"
                          className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] px-6 text-sm font-black text-white hover:bg-[#4C91FF]"
                        >
                          <UploadCloud size={16} /> Upload Artwork
                        </label>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-xs leading-5 text-[#9DB4D0]">
                        {campaignArtworkUpload ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span><span className="font-black text-white">{campaignArtworkUpload.name}</span> uploaded as {campaignArtworkUpload.type}</span>
                            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 font-bold text-emerald-100">{campaignArtworkUpload.sizeLabel}</span>
                          </div>
                        ) : (
                          <span>Upload the final artwork, video creative, production PDF, or a packaged ZIP. The selected file name is written into the campaign work order.</span>
                        )}
                      </div>
                    </div>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Artwork specification<input className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={campaignForm.artworkSpec} onChange={event => setCampaignForm({ ...campaignForm, artworkSpec: event.target.value })} /></label>
                  </div>
                  <aside className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7A94B4]">Flight summary</p>
                    <p className="mt-3 text-4xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{campaignDuration}</p>
                    <p className="text-sm font-bold text-[#B8C7DB]">campaign days</p>
                    <div className="mt-4 space-y-2 text-sm text-[#D8E6F8]">
                      <p className="rounded-lg border border-white/10 bg-[#0B172A] p-3">{campaignForm.bookedFrom || 'Start'} to {campaignForm.bookedTo || 'End'}</p>
                      <p className="rounded-lg border border-white/10 bg-[#0B172A] p-3">{campaignAsset?.dimensions ?? 'Asset dimensions'} production size</p>
                    </div>
                  </aside>
                </div>
              )}

              {campaignStep === 3 && (
                <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <TeamSelectWithNew label="Installation owner" value={campaignForm.installOwner} options={installationTeamOptions} onChange={installOwner => setCampaignForm({ ...campaignForm, installOwner })} />
                    </div>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">
                      Installation due date
                      <input
                        type="date"
                        className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none"
                        value={campaignForm.installationDueDate}
                        onChange={event => setCampaignForm({ ...campaignForm, installationDueDate: event.target.value })}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">
                      Work order assignment
                      <select
                        className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none"
                        value={campaignForm.workOrderAssignment}
                        onChange={event => setCampaignForm({ ...campaignForm, workOrderAssignment: event.target.value as CampaignAssignmentMode })}
                      >
                        <option value="Create installation work order">Create installation work order</option>
                        <option value="Create proof survey only">Create proof survey only</option>
                        <option value="Campaign booking only">Campaign booking only</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Install requirement<textarea className="mt-1 min-h-[86px] w-full rounded-lg border border-white/10 bg-[#07111F] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none" value={campaignForm.installSla} onChange={event => setCampaignForm({ ...campaignForm, installSla: event.target.value })} /></label>
                    <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Proof requirement<textarea className="mt-1 min-h-[86px] w-full rounded-lg border border-white/10 bg-[#07111F] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none" value={campaignForm.proofSla} onChange={event => setCampaignForm({ ...campaignForm, proofSla: event.target.value })} /></label>
                  </div>
                  <aside className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7A94B4]">Work order preview</p>
                    <h3 className="mt-2 text-xl font-black text-white">{campaignForm.campaign}</h3>
                    <p className="mt-1 text-sm text-[#9DB4D0]">{campaignForm.client} - {campaignForm.buyerContact}</p>
                    <div className="mt-4 space-y-2">
                      {[
                        ['Asset', campaignAsset?.name ?? 'No asset selected'],
                        ['Artwork', campaignForm.artworkFile],
                        ['Flight', `${campaignForm.bookedFrom} to ${campaignForm.bookedTo}`],
                        ['Install due', campaignForm.installationDueDate],
                        ['Assignment', campaignForm.workOrderAssignment],
                        ['Owner', campaignForm.installOwner],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-white/10 bg-[#0B172A] p-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
                          <p className="mt-1 text-sm font-black text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-[#9DB4D0]">Starting the campaign updates the asset work order, artwork record, booked dates and proof requirements.</p>
                <div className="flex flex-wrap gap-2">
                  {campaignStep > 1 && (
                    <button type="button" className="min-h-12 rounded-lg border border-white/10 bg-white/5 px-7 py-3 text-base font-bold text-white hover:bg-white/10" onClick={() => setCampaignStep((campaignStep - 1) as CampaignWizardStep)}>
                      Back
                    </button>
                  )}
                  {campaignStep < 3 ? (
                    <button type="button" className="min-h-12 rounded-lg bg-[#2E7FFF] px-8 py-3 text-base font-bold text-white hover:bg-[#4C91FF]" onClick={() => setCampaignStep((campaignStep + 1) as CampaignWizardStep)}>
                      Next
                    </button>
                  ) : (
                    <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#E11D2E] px-7 py-3 text-base font-bold text-white hover:bg-[#ff3445] disabled:opacity-50" onClick={handleStartCampaign} disabled={busy || !campaignForm.assetId}>
                      <CalendarClock size={16} /> Start Campaign
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <MetricInsightModal
        metric={modalMetric}
        updatedAt={metricsUpdatedAt}
        onRunAction={runMetricAction}
        onRunRecord={runMetricRecordAction}
        onClose={() => setMetricModalId(null)}
      />
    </div>
  );
}
