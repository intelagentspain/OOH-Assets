import { useEffect, useMemo, useState } from 'react';
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
  ShieldCheck,
  UploadCloud,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
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
import { evidencePhotoAlt, evidencePhotoObjectPosition, evidencePhotoSrc } from './evidenceVisual';
import type { OOHEvidenceItem, OOHAsset, OOHBootstrap, OOHReviewStatus, OOHSubmission } from './types';

type OOHTab = 'Command' | 'Assets' | 'GIS' | 'Surveys' | 'Evidence' | 'Client Pages' | 'Reports';

interface AssetForm {
  name: string;
  format: string;
  dimensions: string;
  market: string;
  route: string;
  address: string;
  lat: string;
  lng: string;
  client: string;
  campaign: string;
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

const tabs: Array<{ id: OOHTab; label: string; icon: typeof BarChart3 }> = [
  { id: 'Command', label: 'Command', icon: BarChart3 },
  { id: 'Assets', label: 'Assets', icon: Building2 },
  { id: 'GIS', label: 'GIS', icon: MapPin },
  { id: 'Surveys', label: 'Surveys', icon: ClipboardCheck },
  { id: 'Evidence', label: 'Evidence', icon: Camera },
  { id: 'Client Pages', label: 'Client Pages', icon: Globe2 },
  { id: 'Reports', label: 'Reports', icon: FileCheck2 },
];

const assetFormatOptions = ['Unipole billboard', 'Digital screen', 'Bridge banner', 'Bus shelter', 'Wall wrap', 'Street furniture'];
const marketOptions = ['All markets', 'Dubai', 'Abu Dhabi', 'Sharjah'];
const recurrenceOptions: AssignmentForm['recurrence'][] = ['One-time', 'Weekly', 'Monthly', 'Quarterly'];
const reportCards: Array<{ title: string; text: string; icon: LucideIcon }> = [
  { title: 'Campaign Evidence Pack', text: 'Client-ready proof, maps, survey scores and exception notes.', icon: FileCheck2 },
  { title: 'Permit Watchlist', text: 'Expiry windows, municipal owner, route and access requirements.', icon: ShieldCheck },
  { title: 'Survey Scorecard', text: 'Recurring field survey trend, findings and reviewer status.', icon: BarChart3 },
  { title: 'Network Inventory Export', text: 'OOH asset register with GIS coordinates and attributes.', icon: Layers3 },
  { title: 'Installation SLA Report', text: 'Booked, installed, pending proof and rejected evidence.', icon: CalendarClock },
  { title: 'Client Access Log', text: 'Secure page state, expiry controls and shared campaigns.', icon: Users },
];

const integrationFeeds = [
  { name: 'ERP operations', source: 'Asset master and booking state', status: 'Synced', at: '4 min ago' },
  { name: 'CRM / buyer desk', source: 'Client contacts and campaign account', status: 'Synced', at: '8 min ago' },
  { name: 'Media booking', source: 'Campaign flights, formats and assets', status: 'Synced', at: '12 min ago' },
  { name: 'Player / ad-server', source: 'DOOH uptime and playback readiness', status: 'Attention', at: '18 min ago' },
  { name: 'Document repository', source: 'Permits, NOCs and proof packs', status: 'Synced', at: '21 min ago' },
];

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
    client: 'Skyline Telecom',
    campaign: 'Roaming Pass Launch',
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

function MetricCard({ metric, selected, onOpen }: { metric: MetricInsight; selected: boolean; onOpen: (metricId: string) => void }) {
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
  onRunAction,
  onRunRecord,
  onClose,
}: {
  metric: MetricInsight | null;
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

function Pill({ children, tone }: { children: string; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone ?? statusTone(children)}`}>{children}</span>;
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

function OOHMap({ assets, submissions, selectedAssetId, onSelect }: { assets: OOHAsset[]; submissions: OOHSubmission[]; selectedAssetId: string; onSelect: (assetId: string) => void }) {
  const center = useMemo<[number, number]>(() => {
    const selected = assets.find(asset => asset.id === selectedAssetId) ?? assets[0];
    return selected ? [selected.lat, selected.lng] : [25.2048, 55.2708];
  }, [assets, selectedAssetId]);

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border border-white/10 bg-[#07111F]">
      <MapContainer center={center} zoom={9} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {assets.map(asset => {
          const latestInspection = latestInspectionForAsset(asset.id, submissions);
          return (
          <CircleMarker
            key={asset.id}
            center={[asset.lat, asset.lng]}
            radius={asset.id === selectedAssetId ? 11 : 8}
            pathOptions={{ color: markerColor(asset), fillColor: markerColor(asset), fillOpacity: asset.id === selectedAssetId ? 0.88 : 0.68, weight: 2 }}
            eventHandlers={{ click: () => onSelect(asset.id) }}
          >
            <Popup>
              <div className="w-80 p-3 text-left">
                <AssetVisual asset={asset} compact />
                <button className="mt-3 block w-full text-left" onClick={() => onSelect(asset.id)}>
                  <span className="block text-xs font-black uppercase tracking-wide text-[#7A94B4]">{asset.id}</span>
                  <span className="mt-1 block text-sm font-black text-[#EEF3FA]">{asset.name}</span>
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Pill>{asset.status}</Pill>
                  <Pill>{asset.evidenceStatus}</Pill>
                  <Pill>{asset.permitStatus}</Pill>
                </div>
                <p className="mt-2 text-xs text-[#B8C7DB]">{asset.address}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">
                    Campaign <strong className="block text-white">{asset.campaign}</strong>
                  </div>
                  <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">
                    Action <strong className="block text-white">{actionState(asset)}</strong>
                  </div>
                  <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">
                    Health <strong className="block text-white">{asset.healthScore}%</strong>
                  </div>
                  <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">
                    Uptime <strong className="block text-white">{asset.playerUptime ?? 100}%</strong>
                  </div>
                </div>
                {latestInspection ? (
                  <a
                    aria-label={`Open latest inspection report for ${asset.name}`}
                    className="mt-3 flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2E7FFF] text-xs font-black !text-white"
                    href={`/ooh/report/${latestInspection.id}`}
                    onClick={event => event.stopPropagation()}
                    style={{ color: '#FFFFFF' }}
                  >
                    <FileSearch size={14} /> Latest Inspection Report <ExternalLink size={13} />
                  </a>
                ) : (
                  <div className="mt-3 flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-[#9DB4D0]">
                    <FileSearch size={14} /> No inspection report yet
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
        })}
      </MapContainer>
    </div>
  );
}

function teamMarkerColor(status: string): string {
  if (status === 'Overdue' || status === 'Rejected') return '#f87171';
  if (status === 'Submitted') return '#fbbf24';
  if (status === 'In Progress') return '#38bdf8';
  return '#a78bfa';
}

function LiveOperationsGisPanel({
  assets,
  assignments,
  submissions,
  selectedAssetId,
  onSelectAsset,
  onOpenGIS,
  onOpenSurveys,
  onOpenEvidence,
}: {
  assets: OOHAsset[];
  assignments: OOHBootstrap['assignments'];
  submissions: OOHSubmission[];
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
  onOpenGIS: () => void;
  onOpenSurveys: () => void;
  onOpenEvidence: () => void;
}) {
  const center = useMemo<[number, number]>(() => {
    const selected = assets.find(asset => asset.id === selectedAssetId) ?? assets[0];
    return selected ? [selected.lat, selected.lng] : [25.2048, 55.2708];
  }, [assets, selectedAssetId]);
  const now = Date.now();
  const activeAssignments = assignments.filter(assignment => ['Active', 'In Progress', 'Submitted', 'Overdue'].includes(assignment.status));
  const proofGapAssets = assets.filter(asset => asset.evidenceStatus !== 'Ready');
  const permitAttentionAssets = assets.filter(asset => ['Pending', 'Expiring', 'Expired'].includes(asset.permitStatus));
  const surveyDueAssets = assets.filter(asset => !Number.isFinite(Date.parse(asset.nextSurveyDue)) || Date.parse(asset.nextSurveyDue) <= now + 3 * 86400000);
  const reviewQueue = submissions.filter(submission => submission.status === 'Pending Review');
  const teamRows = activeAssignments.map((assignment, index) => {
    const targetAssets = assets.filter(asset => assignment.assetIds.includes(asset.id));
    const anchor = targetAssets[0] ?? assets[index % Math.max(1, assets.length)];
    const direction = index % 2 === 0 ? 1 : -1;
    const position: [number, number] = anchor
      ? [anchor.lat + direction * (0.035 + index * 0.006), anchor.lng - direction * (0.028 + index * 0.004)]
      : [25.2048, 55.2708];
    return {
      assignment,
      targetAssets,
      anchor,
      position,
      blockers: targetAssets.filter(assetNeedsAction).length,
    };
  });
  const actionAssets = assets.filter(assetNeedsAction).slice(0, 4);

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

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="relative h-[460px] overflow-hidden rounded-lg border border-blue-300/20 bg-[#07111F]">
          <MapContainer center={center} zoom={9} scrollWheelZoom={false} className="h-full w-full">
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {assets.map(asset => (
              <CircleMarker
                key={asset.id}
                center={[asset.lat, asset.lng]}
                radius={asset.id === selectedAssetId ? 11 : 7}
                pathOptions={{ color: markerColor(asset), fillColor: markerColor(asset), fillOpacity: asset.id === selectedAssetId ? 0.9 : 0.68, weight: asset.id === selectedAssetId ? 3 : 2 }}
                eventHandlers={{ click: () => onSelectAsset(asset.id) }}
              >
                <Popup>
                  <div className="w-72 p-3 text-left">
                    <span className="block text-xs font-black uppercase tracking-wide text-[#7A94B4]">{asset.id}</span>
                    <strong className="mt-1 block text-sm text-[#EEF3FA]">{asset.name}</strong>
                    <p className="mt-1 text-xs text-[#B8C7DB]">{asset.route} - {asset.market}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">Proof <strong className="block text-white">{asset.evidenceStatus}</strong></div>
                      <div className="rounded border border-white/10 bg-[#07111F] p-2 text-[#B8C7DB]">Permit <strong className="block text-white">{asset.permitStatus}</strong></div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
            {teamRows.map(row => row.anchor && (
              <Polyline key={`${row.assignment.id}-route`} positions={[row.position, [row.anchor.lat, row.anchor.lng]]} pathOptions={{ color: teamMarkerColor(row.assignment.status), dashArray: '6 8', opacity: 0.75, weight: 2 }} />
            ))}
            {teamRows.map(row => (
              <CircleMarker
                key={row.assignment.id}
                center={row.position}
                radius={13}
                pathOptions={{ color: '#F8FAFC', fillColor: teamMarkerColor(row.assignment.status), fillOpacity: 0.9, weight: 2 }}
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
              </CircleMarker>
            ))}
          </MapContainer>
          <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2 rounded-lg border border-white/10 bg-[#07111F]/88 p-2 text-[11px] font-bold text-[#B8C7DB] shadow-xl backdrop-blur">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />Ready assets</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-300" />Needs proof</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-300" />Issue</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-300" />Field team</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Assets', String(assets.length), 'Registered OOH units'],
              ['Field Teams', String(teamRows.length), 'Active survey crews'],
              ['Proof Gaps', String(proofGapAssets.length), 'Need review or capture'],
              ['Permit Watch', String(permitAttentionAssets.length), 'Needs compliance action'],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#7A94B4]">{label}</p>
                <p className="mt-1 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
                <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{detail}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-[#07111F] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7A94B4]">Teams on field</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[#B8C7DB]">{surveyDueAssets.length} survey target{surveyDueAssets.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-3 space-y-2">
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
            <div className="mt-3 space-y-2">
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
    </section>
  );
}

function AssetProfile({ asset, onPatch, onAssignSurvey }: { asset: OOHAsset; onPatch: (updates: Partial<OOHAsset>) => void; onAssignSurvey: () => void }) {
  const attributeRows = [
    ['Format', asset.format],
    ['Dimensions', asset.dimensions],
    ['Market', asset.market],
    ['Route', asset.route],
    ['Owner/Site', asset.owner],
    ['Buyer', asset.buyerContact ?? 'Client contact pending'],
    ['Permit expiry', formatDate(asset.permitExpiry)],
    ['Install SLA', asset.installSla ?? 'SLA pending'],
    ['Proof SLA', asset.proofSla ?? 'Evidence review pending'],
    ['Power', asset.powerStatus],
    ['Player', asset.playerStatus],
    ['Uptime', `${asset.playerUptime ?? 100}%`],
    ['Illumination', asset.illumination],
    ['GPS', `${asset.lat.toFixed(4)}, ${asset.lng.toFixed(4)}`],
  ];

  return (
    <aside className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7A94B4]">{asset.id}</p>
          <h3 className="mt-1 text-xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{asset.name}</h3>
          <p className="mt-2 text-sm text-[#9DB4D0]">{asset.address}</p>
        </div>
        <div className={`rounded-lg px-3 py-2 text-center ${scoreTone(asset.healthScore)} bg-white/5`}>
          <div className="text-2xl font-black">{asset.healthScore}</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Health</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pill>{asset.status}</Pill>
        <Pill>{asset.evidenceStatus}</Pill>
        <Pill>{asset.permitStatus}</Pill>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
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

      <div className="mt-5 grid grid-cols-2 gap-2">
        {attributeRows.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
            <p className="mt-1 text-sm font-bold text-[#EEF3FA]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-[#07111F] p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Audience and location reference</p>
        <p className="mt-1 text-sm leading-5 text-[#B8C7DB]">{asset.audienceReference ?? 'GIS/GPS verified OOH unit with market and route attributes.'}</p>
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">Lifecycle</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="rounded-lg bg-emerald-400/12 px-3 py-2 text-sm font-bold text-emerald-100" onClick={() => onPatch({ status: 'Live', installStatus: 'Installed', evidenceStatus: 'Ready' })}>
            Mark Installed
          </button>
          <button className="rounded-lg bg-red-400/12 px-3 py-2 text-sm font-bold text-red-100" onClick={() => onPatch({ status: 'Issue', installStatus: 'Needs Visit', evidenceStatus: 'Rejected' })}>
            Flag Issue
          </button>
          <button className="rounded-lg bg-blue-400/12 px-3 py-2 text-sm font-bold text-blue-100" onClick={onAssignSurvey}>
            Assign Survey
          </button>
          <button className="rounded-lg bg-white/8 px-3 py-2 text-sm font-bold text-white" onClick={() => onPatch({ permitStatus: 'Valid', permitExpiry: new Date(Date.now() + 365 * 86400000).toISOString() })}>
            Renew Permit
          </button>
        </div>
      </div>
    </aside>
  );
}

export function OOHOperatorApp() {
  const [data, setData] = useState<OOHBootstrap>(fallbackOOHBootstrap);
  const [activeTab, setActiveTab] = useState<OOHTab>('Command');
  const [selectedAssetId, setSelectedAssetId] = useState(fallbackOOHBootstrap.assets[0]?.id ?? '');
  const [assetForm, setAssetForm] = useState<AssetForm>(buildNewAssetForm);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(buildAssignmentForm(fallbackOOHBootstrap.assets[0]?.id ?? ''));
  const [searchTerm, setSearchTerm] = useState('');
  const [marketFilter, setMarketFilter] = useState('All markets');
  const [busy, setBusy] = useState(false);
  const [activeMetricId, setActiveMetricId] = useState('proof-gap');
  const [metricModalId, setMetricModalId] = useState<string | null>(null);
  const [highlightSubmissionId, setHighlightSubmissionId] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchOOHBootstrap().then(store => {
      if (!mounted) return;
      setData(store);
      const firstAssetId = store.assets[0]?.id ?? '';
      setSelectedAssetId(current => store.assets.some(asset => asset.id === current) ? current : firstAssetId);
      setAssignmentForm(current => ({ ...current, assetId: current.assetId || firstAssetId }));
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!metricModalId) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMetricModalId(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [metricModalId]);

  const selectedAsset = data.assets.find(asset => asset.id === selectedAssetId) ?? data.assets[0];
  const filteredAssets = useMemo(() => data.assets.filter(asset => {
    const matchesMarket = marketFilter === 'All markets' || asset.market === marketFilter;
    const haystack = `${asset.id} ${asset.name} ${asset.format} ${asset.route} ${asset.client} ${asset.campaign}`.toLowerCase();
    return matchesMarket && haystack.includes(searchTerm.toLowerCase());
  }), [data.assets, marketFilter, searchTerm]);

  const pendingSubmissions = data.submissions.filter(submission => submission.status === 'Pending Review');
  const actionBlockers = data.assets.filter(assetNeedsAction).length;
  const metricInsights = useMemo<MetricInsight[]>(() => {
    const totalAssets = data.assets.length;
    const now = Date.now();
    const proofGapAssets = data.assets.filter(asset => asset.evidenceStatus !== 'Ready');
    const firstProofGapSubmission = pendingSubmissions.find(submission => proofGapAssets.some(asset => asset.id === submission.assetId));
    const surveyCurrentAssets = data.assets.filter(asset => Number.isFinite(Date.parse(asset.nextSurveyDue)) && Date.parse(asset.nextSurveyDue) >= now);
    const surveyAttentionAssets = data.assets
      .filter(asset => !Number.isFinite(Date.parse(asset.nextSurveyDue)) || Date.parse(asset.nextSurveyDue) <= now + 3 * 86400000)
      .sort((a, b) => Date.parse(a.nextSurveyDue) - Date.parse(b.nextSurveyDue));
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
        label: 'Survey Freshness',
        value: `${percent(surveyCurrentAssets.length, totalAssets)}%`,
        note: `${surveyCurrentAssets.length}/${totalAssets} assets are not overdue for their next inspection.`,
        icon: ClipboardCheck,
        tone: surveyCurrentAssets.length === totalAssets ? 'green' : 'amber',
        formula: `Assets with next survey due today or later, divided by total assets. Current calculation: ${surveyCurrentAssets.length} / ${totalAssets}.`,
        deepDive: 'This tells the operator whether the network is being inspected often enough over time. It is more useful than a generic health average because it exposes stale sites before the client asks for fresh evidence.',
        painPoint: 'Stale inspections create blind spots: damage, creative mismatch, player failure, or missing proof can sit unnoticed until the client asks for fresh evidence.',
        rootCause: 'Recurring survey coverage is too close to the due window or not scheduled far enough ahead for some assets.',
        solutionSteps: ['Open the survey queue and assign recurring inspections for due assets.', 'Prioritize assets tied to active campaigns or client proof pages.', 'Use QR, GPS, photo categories and signature rules so every visit produces usable evidence.'],
        signals: ['asset.lastSurveyAt', 'asset.nextSurveyDue', 'survey recurrence', 'assignment status'],
        records: surveyAttentionAssets.slice(0, 9).map(asset => assetMetricRecord(
          asset,
          `Next survey ${formatDate(asset.nextSurveyDue)}`,
          'Surveys',
          'Assign Recurring Survey',
          undefined,
          {
            urgency: Date.parse(asset.nextSurveyDue) < now ? 'Critical' : 'Attention',
            painPoint: Date.parse(asset.nextSurveyDue) < now
              ? 'The next inspection is overdue, so the latest condition and proof evidence may be stale.'
              : 'The next inspection is inside the action window and should be scheduled before proof freshness drops.',
            solution: 'Assign a recurring survey with QR scan, GPS lock, required photo evidence and reviewer ownership.',
          },
        )),
        action: 'Open Surveys and assign recurring inspections for assets due now or due in the next three days.',
        actionLabel: 'Assign Recurring Survey',
        actionAssetId: surveyAttentionAssets[0]?.id,
        tab: 'Surveys',
      },
      {
        id: 'client-evidence-coverage',
        label: 'Client Evidence Coverage',
        value: `${percent(clientEvidenceAssets.length, totalAssets)}%`,
        note: `${clientEvidenceAssets.length}/${totalAssets} assets have approved captured proof or a client-share trace.`,
        icon: Globe2,
        tone: clientEvidenceAssets.length === totalAssets ? 'green' : 'blue',
        formula: `Assets with approved survey proof, or Ready assets with a live evidence page or client view trace, divided by total assets. Current calculation: ${clientEvidenceAssets.length} / ${totalAssets}.`,
        deepDive: 'This separates internal proof readiness from client-facing evidence coverage. An asset only counts when approved evidence can be shared or traced through a secure client page.',
        painPoint: 'Internal proof is not enough if the client cannot access it. Account teams lose time sending manual screenshots, files, and status updates.',
        rootCause: 'Some assets either do not have approved evidence yet or have not been added to a live client evidence page with access trace.',
        solutionSteps: ['Approve pending evidence before publishing.', 'Generate or update the secure client page for the campaign.', 'Check that only approved evidence is visible and that expiry/access controls are set.'],
        signals: ['asset.evidenceStatus', 'approved submissions', 'live client pages', 'last client view'],
        records: clientGapAssets.slice(0, 9).map(asset => assetMetricRecord(
          asset,
          `${asset.evidenceStatus}, client view ${getLastClientView(asset)}`,
          'Client Pages',
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
        action: 'Open Client Pages to publish approved proof, or approve pending evidence first if the asset is not ready.',
        actionLabel: 'Prepare Client Evidence Page',
        actionAssetId: clientGapAssets[0]?.id ?? clientEvidenceAssets[0]?.id,
        tab: 'Client Pages',
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

  const handleCreateAsset = () => {
    void runMutation(async () => createOOHAsset({
      ...assetForm,
      lat: Number(assetForm.lat),
      lng: Number(assetForm.lng),
      status: 'Install Due',
      permitStatus: 'Pending',
      installStatus: 'Scheduled',
      evidenceStatus: 'Missing',
      healthScore: 88,
      owner: 'OOH Assets',
      buyerContact: 'Client media buyer',
      bookedFrom: new Date().toISOString(),
      bookedTo: new Date(Date.now() + 30 * 86400000).toISOString(),
      installSla: 'Install proof required before go-live',
      proofSla: 'Awaiting first evidence review',
      playerUptime: assetForm.format === 'Digital screen' ? 99.1 : 100,
      audienceReference: `${assetForm.route} GIS point with field survey pending`,
      illumination: assetForm.format === 'Digital screen' ? 'Digital' : 'Front-lit',
      powerStatus: 'Online',
      playerStatus: assetForm.format === 'Digital screen' ? 'Online' : 'Not Installed',
      attributes: ['Imported into 4C360', 'Awaiting first field survey'],
    }));
    setActiveTab('GIS');
  };

  const handleImportSample = () => {
    void runMutation(async () => createOOHAsset({
      name: 'Imported City Walk Smart Panel',
      format: 'Street furniture',
      dimensions: '1.8m x 1.2m digital panel',
      market: 'Dubai',
      route: 'City Walk pedestrian spine',
      address: 'City Walk block B, Dubai',
      lat: 25.2061,
      lng: 55.2628,
      client: 'CityPay',
      campaign: 'Tap and Go',
      owner: 'OOH Assets',
      status: 'Install Due',
      permitStatus: 'Valid',
      installStatus: 'Scheduled',
      evidenceStatus: 'Missing',
      illumination: 'Digital',
      powerStatus: 'Online',
      playerStatus: 'Online',
      healthScore: 90,
      buyerContact: 'Mina Kapoor, Growth',
      bookedFrom: new Date().toISOString(),
      bookedTo: new Date(Date.now() + 30 * 86400000).toISOString(),
      installSla: 'Install scheduled for campaign flight',
      proofSla: 'Evidence due within 24h',
      playerUptime: 99.2,
      audienceReference: 'Pedestrian spine with digital screen exposure',
      attributes: ['Bulk import', 'Street furniture', 'Digital player'],
    }));
    setActiveTab('Assets');
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
    setActiveTab('Client Pages');
  };

  const copyLink = async (path: string) => {
    try {
      await navigator.clipboard.writeText(absolutePath(path));
    } catch {
      // Clipboard may be blocked by the browser.
    }
  };

  const focusAssetForSurvey = () => {
    if (!selectedAsset) return;
    setAssignmentForm(current => ({ ...current, assetId: selectedAsset.id, name: `${selectedAsset.name} proof and condition survey` }));
    setActiveTab('Surveys');
  };

  return (
    <div className="min-h-screen bg-[#07111F] text-[#EEF3FA]">
      <div className="flex min-h-screen">
        <OOHSideNav activeTab={activeTab} onChange={setActiveTab} />
        <div className="min-w-0 flex-1">
          <header className="border-b border-white/10 bg-[#081426]/95 px-4 py-4 backdrop-blur">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#7EB8F7]">4C360 OOH Asset Intelligence</p>
                <h1 className="mt-1 text-2xl font-black text-white md:text-4xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Proof and Control Center</h1>
                <p className="mt-2 max-w-3xl text-sm text-[#B8C7DB]">One operating flow for OOH inventory, installation evidence, field surveys, approvals and secure client proof pages.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={() => setActiveTab('Assets')}>
                  <Plus size={16} /> Add Asset
                </button>
                <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={handleImportSample}>
                  <UploadCloud size={16} /> Import Assets
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
            <div className="grid gap-3 lg:grid-cols-3">
              {metricInsights.slice(0, 3).map(metric => (
                <MetricCard key={metric.id} metric={metric} selected={selectedMetric.id === metric.id} onOpen={handleMetricExplain} />
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {metricInsights.slice(3).map(metric => (
                <MetricCard key={metric.id} metric={metric} selected={selectedMetric.id === metric.id} onOpen={handleMetricExplain} />
              ))}
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[1.45fr_0.75fr]">
              <LiveOperationsGisPanel
                assets={data.assets}
                assignments={data.assignments}
                submissions={data.submissions}
                selectedAssetId={selectedAssetId}
                onSelectAsset={setSelectedAssetId}
                onOpenGIS={() => setActiveTab('GIS')}
                onOpenSurveys={() => setActiveTab('Surveys')}
                onOpenEvidence={() => setActiveTab('Evidence')}
              />

              {selectedAsset && <AssetProfile asset={selectedAsset} onPatch={handleAssetPatch} onAssignSurvey={focusAssetForSurvey} />}
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7A94B4]">AI priority queue</p>
                  <h2 className="mt-1 text-lg font-black text-white">What to fix before the next client share</h2>
                </div>
                <Pill tone="border-blue-300/20 bg-blue-300/10 text-blue-100">{`${actionBlockers} action blocker${actionBlockers === 1 ? '' : 's'}`}</Pill>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-3">
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

            <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
              <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-white">GIS Proof and Compliance Snapshot</h2>
                    <p className="mt-1 text-sm text-[#9DB4D0]">Every marker carries format, permit, proof, campaign and operational context.</p>
                  </div>
                  <button className="text-sm font-bold text-[#7EB8F7]" onClick={() => setActiveTab('GIS')}>Open GIS</button>
                </div>
                <OOHMap assets={data.assets} submissions={data.submissions} selectedAssetId={selectedAssetId} onSelect={setSelectedAssetId} />
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {marketClusters.map(cluster => (
                    <button key={cluster.market} className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-left" onClick={() => { setMarketFilter(cluster.market); setActiveTab('GIS'); }}>
                      <p className="text-sm font-black text-white">{cluster.market}</p>
                      <p className="mt-1 text-xs text-[#9DB4D0]">{cluster.assets.length} asset{cluster.assets.length === 1 ? '' : 's'} - {cluster.proofReady} proof ready</p>
                      <p className="mt-2 text-xs font-bold text-amber-100">{cluster.blockers} action blocker{cluster.blockers === 1 ? '' : 's'}</p>
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
              <div className="mt-4 grid gap-3 lg:grid-cols-5">
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
          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
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

              <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
                <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                  <thead className="bg-[#07111F] text-[11px] uppercase tracking-wide text-[#7A94B4]">
                    <tr>
                      <th className="px-3 py-3">Asset</th>
                      <th className="px-3 py-3">Market</th>
                      <th className="px-3 py-3">Campaign</th>
                      <th className="px-3 py-3">Readiness</th>
                      <th className="px-3 py-3">Permit</th>
                      <th className="px-3 py-3">Evidence</th>
                      <th className="px-3 py-3">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map(asset => (
                      <tr key={asset.id} className={`border-t border-white/10 hover:bg-white/5 ${asset.id === selectedAssetId ? 'bg-[#2E7FFF]/8' : ''}`} onClick={() => setSelectedAssetId(asset.id)}>
                        <td className="px-3 py-3">
                          <button className="text-left">
                            <span className="block font-black text-white">{asset.name}</span>
                            <span className="text-xs text-[#7A94B4]">{asset.id} - {asset.format} - {asset.dimensions}</span>
                          </button>
                        </td>
                        <td className="px-3 py-3 text-[#B8C7DB]">{asset.market}</td>
                        <td className="px-3 py-3">
                          <span className="block font-bold text-white">{asset.campaign}</span>
                          <span className="text-xs text-[#7A94B4]">{asset.client}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="block font-bold text-white">{assetFlight(asset)}</span>
                          <span className={assetNeedsAction(asset) ? 'text-xs font-bold text-red-200' : 'text-xs font-bold text-emerald-200'}>{actionState(asset)}</span>
                        </td>
                        <td className="px-3 py-3"><Pill>{asset.permitStatus}</Pill></td>
                        <td className="px-3 py-3"><Pill>{asset.evidenceStatus}</Pill></td>
                        <td className={`px-3 py-3 text-lg font-black ${scoreTone(asset.healthScore)}`}>{asset.healthScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                <h2 className="text-xl font-black text-white">Add or Import OOH Asset</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Asset name<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.name} onChange={event => setAssetForm({ ...assetForm, name: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Format<select className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.format} onChange={event => setAssetForm({ ...assetForm, format: event.target.value })}>{assetFormatOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Dimensions<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.dimensions} onChange={event => setAssetForm({ ...assetForm, dimensions: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Market<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.market} onChange={event => setAssetForm({ ...assetForm, market: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Route<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.route} onChange={event => setAssetForm({ ...assetForm, route: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4] md:col-span-2">Address<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.address} onChange={event => setAssetForm({ ...assetForm, address: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">GPS lat<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.lat} onChange={event => setAssetForm({ ...assetForm, lat: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">GPS lng<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.lng} onChange={event => setAssetForm({ ...assetForm, lng: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Client<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.client} onChange={event => setAssetForm({ ...assetForm, client: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">Campaign<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#07111F] px-3 text-sm normal-case tracking-normal text-white outline-none" value={assetForm.campaign} onChange={event => setAssetForm({ ...assetForm, campaign: event.target.value })} /></label>
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="inline-flex items-center gap-2 rounded-lg bg-[#E11D2E] px-4 py-2 text-sm font-bold text-white" onClick={handleCreateAsset} disabled={busy}>
                    <Plus size={16} /> Add Asset
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white" onClick={handleImportSample} disabled={busy}>
                    <UploadCloud size={16} /> Import Sample
                  </button>
                </div>
              </div>

              {selectedAsset && <AssetProfile asset={selectedAsset} onPatch={handleAssetPatch} onAssignSurvey={focusAssetForSurvey} />}
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
            {selectedAsset && <AssetProfile asset={selectedAsset} onPatch={handleAssetPatch} onAssignSurvey={focusAssetForSurvey} />}
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
                          <Copy size={14} /> Copy Link
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

        {activeTab === 'Client Pages' && (
          <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-black text-white">Secure Client Evidence Pages</h2>
                <button className="inline-flex items-center gap-2 rounded-lg bg-[#E11D2E] px-3 py-2 text-sm font-bold text-white" onClick={handleCreateClientPage} disabled={!selectedAsset || busy}>
                  <Link2 size={16} /> Generate Page
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                {data.clientPages.map(page => {
                  const path = `/ooh/client/${page.token}`;
                  return (
                    <div key={page.token} className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-[#7A94B4]">{page.client}</p>
                          <h3 className="mt-1 text-lg font-black text-white">{page.title}</h3>
                          <p className="mt-1 text-sm text-[#9DB4D0]">{page.assetIds.length} assets - expires {formatDate(page.expiresAt)}</p>
                        </div>
                        <Pill>{page.status}</Pill>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-3">
                        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Proof ready</p><p className="mt-1 text-xl font-black text-white">{page.proofReady}</p></div>
                        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Survey score</p><p className="mt-1 text-xl font-black text-white">{page.surveyScore}</p></div>
                        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Open items</p><p className="mt-1 text-xl font-black text-white">{page.openItems}</p></div>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Viewer count</p><p className="mt-1 text-sm font-black text-white">{page.viewerCount ?? 0}</p></div>
                        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Last viewed</p><p className="mt-1 text-sm font-black text-white">{page.lastViewedAt ? formatDate(page.lastViewedAt) : 'Awaiting client'}</p></div>
                        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Access</p><p className="mt-1 text-sm font-black text-white">{page.accessState ?? 'Active'}</p></div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <a className="inline-flex items-center gap-2 rounded-lg bg-[#2E7FFF] px-3 py-2 text-xs font-bold text-white" href={path}>
                          <Eye size={14} /> Open Client Page
                        </a>
                        <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white" onClick={() => void copyLink(path)}>
                          <Copy size={14} /> Copy Link
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <h2 className="text-xl font-black text-white">Client Share Controls</h2>
              <div className="mt-4 grid gap-3">
                {[
                  ['Secure token', 'Share links are tokenized and can be regenerated per campaign.'],
                  ['Expiry window', 'Every evidence page carries access expiry and client scope.'],
                  ['Published proof only', 'Client pages show approved evidence and keep internal rework hidden.'],
                  ['Access log', 'Viewer count, last-viewed timestamp and export history support dispute prevention.'],
                  ['Evidence timeline', 'Clients see installation proof, survey events and resolved exceptions.'],
                  ['Export pack', 'Operators can download a campaign proof pack from reports.'],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                    <p className="text-sm font-black text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#9DB4D0]">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'Reports' && (
          <section className="grid gap-5 xl:grid-cols-3">
            {reportCards.map(({ title, text, icon: Icon }) => (
              <div key={title} className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-400/10 text-blue-100">
                  <Icon size={22} />
                </div>
                <h2 className="mt-4 text-lg font-black text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#9DB4D0]">{text}</p>
                <button className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white">
                  <Download size={15} /> Export
                </button>
              </div>
            ))}
          </section>
        )}
          </main>
        </div>
      </div>
      <MetricInsightModal
        metric={modalMetric}
        onRunAction={runMetricAction}
        onRunRecord={runMetricRecordAction}
        onClose={() => setMetricModalId(null)}
      />
    </div>
  );
}
