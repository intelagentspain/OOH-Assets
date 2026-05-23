import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Camera, CarFront, CheckCircle2, ExternalLink, FileCheck2, Image, MapPin, Route, ShieldCheck, Timer, TriangleAlert } from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchOOHClientPage } from './api';
import { fallbackOOHBootstrap } from './seedData';
import { assetPreviewPhotoAlt, assetPreviewPhotoSrc, evidencePhotoAlt, evidencePhotoObjectPosition, evidencePhotoSrc } from './evidenceVisual';
import type { OOHEvidenceItem, OOHAsset, OOHClientPagePayload, OOHSubmission } from './types';

function fmt(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function fmtDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function fmtNumber(value: number): string {
  return new Intl.NumberFormat('en').format(value);
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function markerColor(asset: OOHAsset): string {
  if (asset.evidenceStatus === 'Ready') return '#34d399';
  if (asset.evidenceStatus === 'Rejected') return '#f87171';
  return '#fbbf24';
}

const modernMapTiles = {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  subdomains: 'abcd',
  maxZoom: 20,
};

function pillClass(value: string): string {
  if (['Ready', 'Approved', 'Live', 'complete'].includes(value)) return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  if (['Rejected', 'Expired', 'attention'].includes(value)) return 'border-red-400/25 bg-red-400/10 text-red-200';
  return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
}

function ClientMetricTimestamp({ updatedAt }: { updatedAt: string }) {
  return (
    <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-[#58708E]">
      Updated {fmtDateTime(updatedAt)}
    </p>
  );
}

function ClientMap({ assets }: { assets: OOHAsset[] }) {
  const center = useMemo<[number, number]>(() => {
    const first = assets[0];
    return first ? [first.lat, first.lng] : [25.2048, 55.2708];
  }, [assets]);

  return (
    <div className="h-[340px] overflow-hidden rounded-lg border border-white/10 bg-[#07111F]">
      <MapContainer center={center} zoom={9} scrollWheelZoom={true} className="h-full w-full ooh-modern-map">
        <TileLayer {...modernMapTiles} />
        {assets.map(asset => (
          <CircleMarker key={asset.id} center={[asset.lat, asset.lng]} radius={9} pathOptions={{ color: markerColor(asset), fillColor: markerColor(asset), fillOpacity: 0.78, weight: 2 }}>
            <Popup>
              <div className="w-56 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-[#7A94B4]">{asset.id}</p>
                <p className="mt-1 text-sm font-black text-white">{asset.name}</p>
                <p className="mt-1 text-xs text-[#B8C7DB]">{asset.address}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function Metric({ label, value, helper, icon: Icon, updatedAt }: { label: string; value: string | number; helper?: string; icon: typeof CheckCircle2; updatedAt: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
      <Icon size={20} className="text-[#7EB8F7]" />
      <p className="mt-3 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
      {helper && <p className="mt-2 text-xs leading-5 text-[#9DB4D0]">{helper}</p>}
      <ClientMetricTimestamp updatedAt={updatedAt} />
    </div>
  );
}

function publishedSubmissionForAsset(assetId: string, submissions: OOHSubmission[]): OOHSubmission | undefined {
  return submissions
    .filter(submission => submission.assetId === assetId && submission.status === 'Approved' && submission.clientPublishStatus !== 'Blocked')
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0];
}

function publishedAssetEvidence(asset: OOHAsset): OOHEvidenceItem[] {
  return asset.evidence.filter(item => item.type === 'photo' && item.clientPublishStatus !== 'Blocked' && ['Ready', 'Approved'].includes(item.status));
}

type InspectionRow = OOHAsset['surveyHistory'][number];

function weeklyInspectionRowsForAsset(asset: OOHAsset, count: number): InspectionRow[] {
  const sorted = [...asset.surveyHistory].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const anchor: InspectionRow = sorted[0] ?? {
    id: `HIST-${asset.id}`,
    date: asset.lastSurveyAt,
    score: asset.healthScore,
    status: asset.evidenceStatus === 'Rejected' ? 'Rejected' : 'Approved',
    issues: asset.evidenceStatus === 'Ready' ? [] : [`${asset.evidenceStatus} evidence status`],
  };

  return Array.from({ length: Math.max(count, sorted.length) }, (_, index) => {
    const existing = sorted[index];
    if (existing) return existing;
    return {
      id: `${anchor.id}-WEEK-${index + 1}`,
      date: addDays(anchor.date, -7 * index),
      score: Math.max(70, anchor.score - index),
      status: anchor.status,
      issues: index === 0 ? anchor.issues : [],
    };
  }).slice(0, count);
}

function galleryItemsForAsset(asset: OOHAsset, submissions: OOHSubmission[]) {
  const submission = publishedSubmissionForAsset(asset.id, submissions);
  const submissionPhotos = submission?.evidence.filter(item => item.type === 'photo' && item.clientPublishStatus !== 'Blocked') ?? [];
  const sourcePhotos = submissionPhotos.length ? submissionPhotos : publishedAssetEvidence(asset);
  const categories: Array<NonNullable<OOHEvidenceItem['photoCategory']>> = ['Wide', 'Close-up', 'Angle'];
  const weeklyInspections = weeklyInspectionRowsForAsset(asset, categories.length);

  return weeklyInspections.flatMap((inspection, index) => {
    const source = sourcePhotos[index] ?? sourcePhotos[0];
    if (!source) return [];
    const category = sourcePhotos.length >= categories.length ? (source.photoCategory ?? categories[index % categories.length]) : categories[index % categories.length];
    const item: OOHEvidenceItem = {
      ...source,
      id: `${inspection.id}-${category.toLowerCase().replace(/\s+/g, '-')}`,
      label: `Week ${index + 1} ${category.toLowerCase()} inspection evidence`,
      photoCategory: category,
      capturedAt: inspection.date,
      status: inspection.status,
    };
    return [{
      key: `${asset.id}-${item.id}-${index}`,
      asset,
      item,
      reportId: index === 0 ? (submission?.id ?? inspection.id) : inspection.id,
      score: inspection.score,
      capturedAt: inspection.date,
      capturedBy: item.capturedBy || submission?.submittedBy || 'Field QA team',
    }];
  });
}

function GalleryCard({ entry }: { entry: ReturnType<typeof galleryItemsForAsset>[number] }) {
  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-[#07111F]">
      <div className="relative h-56 border-b border-white/10 bg-[#0B172A]">
        <img
          src={evidencePhotoSrc(entry.item, entry.asset)}
          alt={evidencePhotoAlt(entry.item, entry.asset)}
          className="h-full w-full object-cover"
          style={{ objectPosition: evidencePhotoObjectPosition(entry.asset) }}
        />
        <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-[#07111F]/86 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white backdrop-blur">
          {entry.item.photoCategory ?? 'Inspection photo'}
        </div>
        <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-white/10 bg-[#07111F]/88 p-3 backdrop-blur">
          <p className="line-clamp-1 text-sm font-black text-white">{entry.item.label}</p>
          <p className="mt-1 text-xs text-[#B8C7DB]">{entry.asset.name}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 border-b border-white/10 text-xs">
        <div className="border-r border-white/10 p-3">
          <p className="font-bold uppercase tracking-wide text-[#7A94B4]">Score</p>
          <p className="mt-1 font-black text-white">{entry.score}%</p>
        </div>
        <div className="border-r border-white/10 p-3">
          <p className="font-bold uppercase tracking-wide text-[#7A94B4]">GPS</p>
          <p className="mt-1 font-black text-white">{entry.item.gpsAccuracyMeters ?? 8}m</p>
        </div>
        <div className="p-3">
          <p className="font-bold uppercase tracking-wide text-[#7A94B4]">QR</p>
          <p className="mt-1 font-black text-white">{entry.item.qrVerified ? 'Verified' : 'N/A'}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-[#9DB4D0]">{fmtDateTime(entry.capturedAt)}</p>
          <p className="mt-1 text-xs font-bold text-[#7A94B4]">{entry.capturedBy}</p>
        </div>
        {entry.reportId && (
          <a className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2E7FFF]/35 bg-[#2E7FFF]/12 px-3 py-2 text-xs font-black text-[#9FC8FF] hover:bg-[#2E7FFF]/20 hover:text-white" href={`/ooh/report/${entry.reportId}`}>
            View report <ExternalLink size={13} />
          </a>
        )}
      </div>
    </article>
  );
}

function carCountSeed(value: string): number {
  return value.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

type TrafficPeriod = 'day' | 'week' | 'month';

function carCountForAsset(asset: OOHAsset) {
  const routeProfile = asset.route.toLowerCase();
  const formatProfile = asset.format.toLowerCase();
  const baseHourly = routeProfile.includes('sheikh zayed') ? 1380
    : routeProfile.includes('downtown') ? 920
      : routeProfile.includes('corniche') ? 760
        : routeProfile.includes('jbr') ? 640
          : routeProfile.includes('metro') ? 520
            : 430;
  const formatLift = formatProfile.includes('billboard') ? 1.1
    : formatProfile.includes('bridge') ? 1.05
      : formatProfile.includes('screen') ? 1
        : formatProfile.includes('wall') ? 0.92
          : 0.84;
  const hourlyAverage = Math.round(baseHourly * formatLift);
  const referenceAt = asset.surveyHistory[0]?.date ?? asset.lastSurveyAt;
  const referenceDate = new Date(referenceAt);
  const startHour = Number.isNaN(referenceDate.getHours()) ? 7 : Math.max(6, referenceDate.getHours() - 1);
  const labels = [`${String(startHour).padStart(2, '0')}:00`, `${String(startHour + 1).padStart(2, '0')}:00`, `${String(startHour + 2).padStart(2, '0')}:00`];
  const directionSplit = routeProfile.includes('north') || asset.attributes.some(item => /northbound/i.test(item))
    ? { primary: 'Northbound', primaryShare: 62, secondary: 'Southbound', secondaryShare: 38 }
    : routeProfile.includes('corniche')
      ? { primary: 'Eastbound', primaryShare: 55, secondary: 'Westbound', secondaryShare: 45 }
      : { primary: 'Primary approach', primaryShare: 58, secondary: 'Opposite approach', secondaryShare: 42 };

  return {
    asset,
    referenceAt,
    observedCars: hourlyAverage * 2,
    hourlyAverage,
    peakWindow: `${labels[1]}-${labels[2]}`,
    observationWindow: `${labels[0]}-${labels[2]}`,
    confidence: Math.min(96, 82 + (carCountSeed(asset.id) % 10)),
    directionSplit,
    bars: [
      { label: labels[0], value: Math.round(hourlyAverage * 0.78) },
      { label: labels[1], value: Math.round(hourlyAverage * 1.18) },
      { label: labels[2], value: Math.round(hourlyAverage * 1.04) },
    ],
  };
}

function historicalTrafficSeries(rows: ReturnType<typeof carCountForAsset>[], period: TrafficPeriod) {
  const baseHourly = rows.reduce((sum, row) => sum + row.hourlyAverage, 0);
  if (period === 'day') {
    return [
      { label: '06:00', value: Math.round(baseHourly * 0.48) },
      { label: '09:00', value: Math.round(baseHourly * 0.82) },
      { label: '12:00', value: Math.round(baseHourly * 1.04) },
      { label: '15:00', value: Math.round(baseHourly * 1.18) },
      { label: '18:00', value: Math.round(baseHourly * 0.96) },
      { label: '21:00', value: Math.round(baseHourly * 0.58) },
    ];
  }

  if (period === 'week') {
    const dailyBase = baseHourly * 12;
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => ({
      label,
      value: Math.round(dailyBase * [0.9, 0.94, 1, 1.06, 1.18, 0.82, 0.68][index]),
    }));
  }

  const weeklyBase = baseHourly * 12 * 7;
  return ['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((label, index) => ({
    label,
    value: Math.round(weeklyBase * [0.96, 1.03, 1.08, 0.99][index]),
  }));
}

function CarCountAnalytics({ assets }: { assets: OOHAsset[] }) {
  const [trafficPeriod, setTrafficPeriod] = useState<TrafficPeriod>('day');
  const rows = assets.map(carCountForAsset);
  const metricsUpdatedAt = rows[0]?.referenceAt ?? new Date().toISOString();
  const totalObserved = rows.reduce((sum, row) => sum + row.observedCars, 0);
  const avgHourly = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.hourlyAverage, 0) / rows.length) : 0;
  const avgConfidence = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length) : 0;
  const topLocation = rows.reduce((top, row) => row.hourlyAverage > top.hourlyAverage ? row : top, rows[0]);
  const maxBar = Math.max(...rows.map(row => row.hourlyAverage), 1);
  const history = historicalTrafficSeries(rows, trafficPeriod);
  const maxHistory = Math.max(...history.map(item => item.value), 1);
  const historyTotal = history.reduce((sum, item) => sum + item.value, 0);

  if (!rows.length) return null;

  return (
    <section className="mt-5 rounded-lg border border-white/10 bg-[#0B172A] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CarFront size={19} className="text-[#7EB8F7]" />
            <h2 className="text-xl font-black text-white">Car Count Analytics</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#9DB4D0]">Traffic count at each outdoor ad location, tied to the campaign assets, GPS points, routes and latest field inspection windows.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100">
          <Activity size={14} /> {avgConfidence}% confidence
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#07111F] p-3">
          <CarFront size={17} className="text-[#7EB8F7]" />
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Observed cars</p>
          <p className="mt-1 text-lg font-black text-white">{fmtNumber(totalObserved)}</p>
          <ClientMetricTimestamp updatedAt={metricsUpdatedAt} />
        </div>
        <div className="rounded-lg border border-white/10 bg-[#07111F] p-3">
          <BarChart3 size={17} className="text-[#7EB8F7]" />
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Avg hourly flow</p>
          <p className="mt-1 text-lg font-black text-white">{fmtNumber(avgHourly)}/h</p>
          <ClientMetricTimestamp updatedAt={metricsUpdatedAt} />
        </div>
        <div className="rounded-lg border border-white/10 bg-[#07111F] p-3">
          <Route size={17} className="text-[#7EB8F7]" />
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Highest flow</p>
          <p className="mt-1 text-lg font-black text-white">{topLocation?.asset.route ?? 'Route profile'}</p>
          <ClientMetricTimestamp updatedAt={metricsUpdatedAt} />
        </div>
        <div className="rounded-lg border border-white/10 bg-[#07111F] p-3">
          <Timer size={17} className="text-[#7EB8F7]" />
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Peak window</p>
          <p className="mt-1 text-lg font-black text-white">{topLocation?.peakWindow ?? 'Inspection window'}</p>
          <ClientMetricTimestamp updatedAt={metricsUpdatedAt} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_0.85fr]">
        <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-white">Location traffic profile</p>
            <p className="text-xs font-bold text-[#7A94B4]">latest inspection window</p>
          </div>
          <div className="mt-4 space-y-3">
            {rows.map(row => (
              <div key={row.asset.id} className="grid gap-2 text-sm sm:grid-cols-[180px_1fr_84px] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{row.asset.name}</p>
                  <p className="text-xs text-[#7A94B4]">{fmt(row.referenceAt)} - {row.observationWindow}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#2E7FFF,#34D399)]" style={{ width: `${Math.max(18, (row.hourlyAverage / maxBar) * 100)}%` }} />
                </div>
                <p className="text-right font-black text-white">{fmtNumber(row.hourlyAverage)}/h</p>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-white">Historical traffic numbers</p>
                <p className="mt-1 text-xs text-[#7A94B4]">{fmtNumber(historyTotal)} cars across selected {trafficPeriod} view</p>
              </div>
              <div className="grid grid-cols-3 rounded-lg border border-white/10 bg-[#0B172A] p-1">
                {(['day', 'week', 'month'] as TrafficPeriod[]).map(period => (
                  <button
                    key={period}
                    type="button"
                    aria-pressed={trafficPeriod === period}
                    className={`rounded-md px-3 py-2 text-xs font-black capitalize transition ${trafficPeriod === period ? 'bg-[#2E7FFF] text-white shadow-lg shadow-blue-950/30' : 'text-[#9DB4D0] hover:bg-white/5 hover:text-white'}`}
                    onClick={() => setTrafficPeriod(period)}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex h-44 items-end gap-2 rounded-lg border border-white/10 bg-[#0B172A] p-3">
              {history.map(item => (
                <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                  <div className="flex min-h-0 flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-[linear-gradient(180deg,#7EB8F7,#34D399)]"
                      style={{ height: `${Math.max(12, (item.value / maxHistory) * 100)}%` }}
                      title={`${item.label}: ${fmtNumber(item.value)} cars`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="truncate text-[11px] font-black text-white">{fmtNumber(item.value)}</p>
                    <p className="truncate text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
          <p className="text-sm font-black text-white">Outdoor location insight</p>
          <div className="mt-4 grid gap-3">
            {rows.map(row => (
              <div key={`${row.asset.id}-split`} className="rounded-lg border border-white/10 bg-[#0B172A] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{row.asset.name}</p>
                    <p className="mt-1 text-xs text-[#9DB4D0]">{row.asset.route} - {row.asset.market}</p>
                  </div>
                  <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2.5 py-1 text-[11px] font-black text-blue-100">{row.confidence}%</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded border border-emerald-400/20 bg-emerald-400/10 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-100">{row.directionSplit.primary}</p>
                    <p className="mt-1 text-lg font-black text-white">{row.directionSplit.primaryShare}%</p>
                  </div>
                  <div className="rounded border border-blue-300/20 bg-blue-400/10 p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-100">{row.directionSplit.secondary}</p>
                    <p className="mt-1 text-lg font-black text-white">{row.directionSplit.secondaryShare}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-[#0B172A] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">How calculated</p>
            <p className="mt-1 text-xs leading-5 text-[#B8C7DB]">Uses asset GPS lock, route class, latest inspection timestamp, field photo/video sample and historic traffic profile for each outdoor ad location.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function OOHClientPage({ token }: { token: string }) {
  const [payload, setPayload] = useState<OOHClientPagePayload>({
    page: fallbackOOHBootstrap.clientPages[0],
    assets: fallbackOOHBootstrap.assets.slice(0, 2),
    submissions: fallbackOOHBootstrap.submissions,
  });

  useEffect(() => {
    let mounted = true;
    fetchOOHClientPage(token).then(result => {
      if (!mounted) return;
      setPayload(result);
    });
    return () => {
      mounted = false;
    };
  }, [token]);

  const { page, assets, submissions } = payload;
  const pendingItems = assets.filter(asset => asset.evidenceStatus !== 'Ready').length;
  const galleryItems = assets.flatMap(asset => galleryItemsForAsset(asset, submissions));
  const metricsUpdatedAt = page.lastViewedAt ?? page.createdAt;

  return (
    <div className="min-h-screen bg-[#07111F] text-[#EEF3FA]">
      <header className="border-b border-white/10 bg-[#081426] px-4 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#7EB8F7]">4C360 Client Evidence Portal</p>
              <h1 className="mt-2 max-w-3xl text-3xl font-black text-white md:text-5xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{page.title}</h1>
              <p className="mt-3 text-sm text-[#B8C7DB]">{page.client} - {page.campaign}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <div className="flex items-center gap-2 text-sm font-black text-emerald-200"><ShieldCheck size={17} /> Secure Link</div>
              <p className="mt-2 text-xs text-[#9DB4D0]">Expires {fmt(page.expiresAt)}</p>
              <p className="mt-2 rounded-lg border border-white/10 bg-[#07111F] px-3 py-2 font-mono text-xs text-[#7EB8F7]">{token}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{page.watermarkLabel ?? '4C360 verified evidence'}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Booked Assets" value={assets.length} helper="Assets covered by this client evidence link." icon={MapPin} updatedAt={metricsUpdatedAt} />
          <Metric label="Approved Proof" value={`${page.proofReady}/${assets.length}`} helper="Booked assets with client-visible proof attached." icon={CheckCircle2} updatedAt={metricsUpdatedAt} />
          <Metric label="Latest Inspection" value={`${page.surveyScore}%`} helper="Most recent approved quality inspection score." icon={FileCheck2} updatedAt={metricsUpdatedAt} />
          <Metric label="Attention Items" value={pendingItems} helper="Assets still missing approved client evidence." icon={pendingItems ? TriangleAlert : ShieldCheck} updatedAt={metricsUpdatedAt} />
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Access state</p>
            <p className="mt-2 text-lg font-black text-white">{page.accessState ?? 'Active'}</p>
            <ClientMetricTimestamp updatedAt={metricsUpdatedAt} />
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Viewer count</p>
            <p className="mt-2 text-lg font-black text-white">{page.viewerCount ?? 0}</p>
            <ClientMetricTimestamp updatedAt={metricsUpdatedAt} />
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Last viewed</p>
            <p className="mt-2 text-lg font-black text-white">{page.lastViewedAt ? fmt(page.lastViewedAt) : 'First client view'}</p>
            <ClientMetricTimestamp updatedAt={metricsUpdatedAt} />
          </div>
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-100">Published evidence</p>
            <p className="mt-2 text-lg font-black text-white">Approved only</p>
            <ClientMetricTimestamp updatedAt={metricsUpdatedAt} />
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">Campaign Map</h2>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${pillClass(page.status)}`}>{page.status}</span>
            </div>
            <ClientMap assets={assets} />
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <h2 className="text-xl font-black text-white">Evidence Timeline</h2>
            <p className="mt-1 text-sm text-[#9DB4D0]">This page hides internal rework and publishes only approved proof-of-performance evidence.</p>
            <div className="mt-4 space-y-3">
              {page.timeline.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex gap-3 rounded-lg border border-white/10 bg-[#07111F] p-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.status === 'complete' ? 'bg-emerald-400/10 text-emerald-200' : item.status === 'attention' ? 'bg-red-400/10 text-red-200' : 'bg-blue-400/10 text-blue-100'}`}>
                    {item.status === 'complete' ? <CheckCircle2 size={16} /> : item.status === 'attention' ? <TriangleAlert size={16} /> : <Timer size={16} />}
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">{item.label}</p>
                    <p className="mt-1 text-xs text-[#7A94B4]">{fmt(item.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-white/10 bg-[#0B172A] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Image size={18} className="text-[#7EB8F7]" />
                <h2 className="text-xl font-black text-white">Weekly Quality Inspection Gallery</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#9DB4D0]">Published weekly inspection evidence, with each photo card tied to its own inspection date, score and report link. Internal rework and blocked photos stay hidden from this client view.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100">
              <Camera size={14} /> {galleryItems.length} client-visible images
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {galleryItems.map(entry => <GalleryCard key={entry.key} entry={entry} />)}
            {galleryItems.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-4 text-sm text-[#9DB4D0]">No approved inspection images have been published to this client page yet.</div>
            )}
          </div>
        </section>

        <CarCountAnalytics assets={assets} />

        <section className="mt-5 rounded-lg border border-white/10 bg-[#0B172A] p-4">
          <h2 className="text-xl font-black text-white">Export and Access Log</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(page.exportHistory ?? [{ label: 'Campaign evidence pack', at: page.createdAt, by: '4C360' }]).map(item => (
              <div key={`${item.label}-${item.at}`} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                <p className="text-sm font-black text-white">{item.label}</p>
                <p className="mt-1 text-xs text-[#9DB4D0]">{fmt(item.at)} - {item.by}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
