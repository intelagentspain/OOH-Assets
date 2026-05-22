import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, Globe2, MapPin, ShieldCheck, Timer, TriangleAlert } from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchOOHClientPage } from './api';
import { fallbackOOHBootstrap } from './seedData';
import type { OOHAsset, OOHClientPagePayload } from './types';

function fmt(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
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

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof CheckCircle2 }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
      <Icon size={20} className="text-[#7EB8F7]" />
      <p className="mt-3 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
    </div>
  );
}

export function OOHClientPage({ token }: { token: string }) {
  const [payload, setPayload] = useState<OOHClientPagePayload>({
    page: fallbackOOHBootstrap.clientPages[0],
    assets: fallbackOOHBootstrap.assets.slice(0, 2),
    submissions: fallbackOOHBootstrap.submissions,
  });
  const [notice, setNotice] = useState('Loading secure evidence page...');

  useEffect(() => {
    let mounted = true;
    fetchOOHClientPage(token).then(result => {
      if (!mounted) return;
      setPayload(result);
      setNotice('Evidence page is live.');
    });
    return () => {
      mounted = false;
    };
  }, [token]);

  const { page, assets, submissions } = payload;
  const publishedSubmissions = submissions.filter(submission => submission.status === 'Approved' && submission.clientPublishStatus !== 'Blocked');
  const pendingItems = assets.filter(asset => asset.evidenceStatus !== 'Ready').length;

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
        <div className="mb-5 rounded-lg border border-blue-400/15 bg-[#0B172A] p-3 text-sm text-[#B8C7DB]">{notice}</div>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Campaign Assets" value={assets.length} icon={MapPin} />
          <Metric label="Proof Ready" value={page.proofReady} icon={CheckCircle2} />
          <Metric label="Survey Score" value={`${page.surveyScore}%`} icon={FileCheck2} />
          <Metric label="Open Items" value={pendingItems} icon={pendingItems ? TriangleAlert : ShieldCheck} />
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Access state</p>
            <p className="mt-2 text-lg font-black text-white">{page.accessState ?? 'Active'}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Viewer count</p>
            <p className="mt-2 text-lg font-black text-white">{page.viewerCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Last viewed</p>
            <p className="mt-2 text-lg font-black text-white">{page.lastViewedAt ? fmt(page.lastViewedAt) : 'First client view'}</p>
          </div>
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-100">Published evidence</p>
            <p className="mt-2 text-lg font-black text-white">Approved only</p>
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-black text-white">Assets and Proof Status</h2>
            <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white" onClick={() => setNotice('Campaign evidence pack prepared for export.')}>
              <Download size={15} /> Export Evidence Pack
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {assets.map(asset => (
              <div key={asset.id} className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-[#7A94B4]">{asset.id}</p>
                    <h3 className="mt-1 text-lg font-black text-white">{asset.name}</h3>
                    <p className="mt-1 text-sm text-[#9DB4D0]">{asset.format} - {asset.dimensions}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${pillClass(asset.evidenceStatus)}`}>{asset.evidenceStatus}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Location</p><p className="mt-1 text-sm font-bold text-white">{asset.market}</p></div>
                  <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Health</p><p className="mt-1 text-sm font-bold text-white">{asset.healthScore}%</p></div>
                  <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Last survey</p><p className="mt-1 text-sm font-bold text-white">{fmt(asset.lastSurveyAt)}</p></div>
                  <div className="rounded-lg border border-white/10 bg-[#0B172A] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Permit</p><p className="mt-1 text-sm font-bold text-white">{asset.permitStatus}</p></div>
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-[#0B172A] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Audience / location reference</p>
                  <p className="mt-1 text-sm leading-5 text-[#B8C7DB]">{asset.audienceReference ?? 'GIS/GPS verified OOH asset with route and market attributes.'}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-white/10 bg-[#0B172A] p-4">
          <div className="flex items-center gap-2">
            <Globe2 size={18} className="text-[#7EB8F7]" />
            <h2 className="text-xl font-black text-white">Survey Results</h2>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-[#07111F] text-[11px] uppercase tracking-wide text-[#7A94B4]">
                <tr>
                  <th className="px-3 py-3">Submission</th>
                  <th className="px-3 py-3">Asset</th>
                  <th className="px-3 py-3">Score</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {publishedSubmissions.map(submission => (
                  <tr key={submission.id} className="border-t border-white/10">
                    <td className="px-3 py-3 font-mono text-xs text-[#B8C7DB]">{submission.id}</td>
                    <td className="px-3 py-3 text-white">{assets.find(asset => asset.id === submission.assetId)?.name ?? submission.assetId}</td>
                    <td className="px-3 py-3 font-black text-white">{submission.score}</td>
                    <td className="px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${pillClass(submission.status)}`}>{submission.status}</span></td>
                    <td className="px-3 py-3 text-[#B8C7DB]">{submission.evidence.filter(item => item.clientPublishStatus !== 'Blocked').length} files</td>
                  </tr>
                ))}
                {publishedSubmissions.length === 0 && (
                  <tr className="border-t border-white/10">
                    <td colSpan={5} className="px-3 py-6 text-center text-[#9DB4D0]">No survey submissions have been published to this client page yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#7A94B4]">{publishedSubmissions.length} approved submissions are included in this secure campaign view.</p>
        </section>

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
