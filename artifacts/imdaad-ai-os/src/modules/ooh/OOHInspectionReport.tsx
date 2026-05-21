import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  MapPin,
  QrCode,
  ShieldCheck,
  Signature,
  TriangleAlert,
  Wifi,
} from 'lucide-react';
import { fetchOOHBootstrap } from './api';
import { fallbackOOHBootstrap } from './seedData';
import { evidencePhotoAlt, evidencePhotoObjectPosition, evidencePhotoSrc } from './evidenceVisual';
import type { OOHEvidenceItem, OOHAsset, OOHBootstrap, OOHSubmission } from './types';

function fmt(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function fmtDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusClass(value: string): string {
  if (['Approved', 'Ready', 'Published', 'Synced', 'Valid', 'Online', 'Pass'].includes(value)) return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  if (['Rejected', 'Blocked', 'Offline', 'Fail', 'Expired'].includes(value)) return 'border-red-400/25 bg-red-400/10 text-red-200';
  return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
}

function Pill({ children }: { children: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(children)}`}>{children}</span>;
}

function AssetVisual({ asset }: { asset: OOHAsset }) {
  const isDigital = asset.format.toLowerCase().includes('digital') || asset.playerStatus === 'Online';
  const isStreet = asset.format.toLowerCase().includes('shelter') || asset.format.toLowerCase().includes('furniture') || asset.format.toLowerCase().includes('totem');

  return (
    <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-blue-300/20 bg-[#07111F]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(46,127,255,0.22),rgba(225,29,46,0.14)_45%,rgba(7,17,31,0.92))]" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(180deg,rgba(7,17,31,0),rgba(7,17,31,0.95))]" />
      <div className="absolute bottom-11 left-8 right-8 h-[4px] rounded-full bg-blue-200/20" />
      {isStreet ? (
        <div className="absolute bottom-12 left-12 flex h-36 w-28 items-center justify-center rounded border border-blue-200/50 bg-[#0B172A] shadow-2xl shadow-black/40">
          <div className="h-28 w-20 rounded-sm bg-[linear-gradient(180deg,rgba(126,184,247,0.9),rgba(225,29,46,0.58))]" />
        </div>
      ) : (
        <div className="absolute left-12 top-12 h-28 w-56 rounded-md border border-blue-100/55 bg-[#0B172A] p-2 shadow-2xl shadow-black/40">
          <div className={`flex h-full items-center justify-center rounded ${isDigital ? 'bg-[linear-gradient(135deg,#7EB8F7,#E11D2E)]' : 'bg-[linear-gradient(135deg,#F7FBFF,#7EB8F7)]'}`}>
            <span className="rounded bg-[#07111F]/80 px-3 py-1 text-xs font-black uppercase tracking-wide text-white">{asset.format}</span>
          </div>
          <div className="absolute -bottom-16 left-1/2 h-16 w-2 -translate-x-1/2 bg-blue-100/35" />
        </div>
      )}
      <div className="absolute right-4 top-4 rounded-lg border border-white/10 bg-[#07111F]/85 p-3 text-right backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-wide text-[#7EB8F7]">Asset Visual</p>
        <p className="mt-1 max-w-[190px] text-sm font-black text-white">{asset.campaign}</p>
        <p className="mt-1 text-xs text-[#B8C7DB]">{asset.market}</p>
      </div>
      <div className="absolute bottom-4 left-4 right-4 grid gap-2 sm:grid-cols-3">
        {[asset.id, asset.dimensions, asset.permitStatus].map(item => (
          <div key={item} className="rounded border border-white/10 bg-[#07111F]/80 px-3 py-2 text-xs font-bold text-[#B8C7DB] backdrop-blur">{item}</div>
        ))}
      </div>
    </div>
  );
}

function evidenceIcon(type: OOHEvidenceItem['type']) {
  if (type === 'photo') return Camera;
  if (type === 'gps') return MapPin;
  if (type === 'qr') return QrCode;
  if (type === 'signature') return Signature;
  return FileText;
}

function EvidenceCard({ item, asset }: { item: OOHEvidenceItem; asset?: OOHAsset }) {
  const Icon = evidenceIcon(item.type);

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#07111F]">
      {item.type === 'photo' && (
        <div className="relative h-48 border-b border-white/10 bg-[#0B172A]">
          <img src={evidencePhotoSrc(item, asset)} alt={evidencePhotoAlt(item, asset)} className="h-full w-full object-cover" style={{ objectPosition: evidencePhotoObjectPosition(asset) }} />
          <div className="absolute bottom-3 left-3 right-3 rounded-md border border-white/10 bg-[#07111F]/82 px-3 py-2 backdrop-blur">
            <p className="truncate text-xs font-black uppercase tracking-wide text-[#BFDBFE]">Captured photo evidence</p>
            <p className="mt-0.5 truncate text-sm font-black text-white">{item.label}</p>
          </div>
        </div>
      )}
      <div className="flex items-start gap-3 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-[#7EB8F7]">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-white">{item.label}</p>
            <Pill>{item.status}</Pill>
          </div>
          <p className="mt-1 text-xs text-[#9DB4D0]">{item.photoCategory ?? item.type.toUpperCase()} - {fmtDateTime(item.capturedAt)} - {item.capturedBy}</p>
          <p className="mt-2 text-xs text-[#7A94B4]">
            GPS {item.gps.lat.toFixed(4)}, {item.gps.lng.toFixed(4)}
            {item.gpsAccuracyMeters ? ` - ${item.gpsAccuracyMeters}m accuracy` : ''}
          </p>
          {item.notes && <p className="mt-2 rounded border border-white/10 bg-[#0B172A] px-3 py-2 text-xs text-[#B8C7DB]">{item.notes}</p>}
        </div>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof CheckCircle2 }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
      <Icon size={18} className="text-[#7EB8F7]" />
      <p className="mt-3 text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
    </div>
  );
}

function ReportMissing() {
  return (
    <div className="min-h-screen bg-[#07111F] p-6 text-[#EEF3FA]">
      <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <div className="rounded-lg border border-white/10 bg-[#0B172A] p-6 text-center">
          <TriangleAlert size={34} className="mx-auto text-amber-200" />
          <h1 className="mt-4 text-2xl font-black text-white">Inspection report unavailable</h1>
          <p className="mt-2 text-sm text-[#9DB4D0]">This inspection link does not match a captured OOH survey submission.</p>
          <a className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#2E7FFF] px-4 py-2 text-sm font-black text-white" href="/ooh">
            <ArrowLeft size={16} /> Back to OOH
          </a>
        </div>
      </main>
    </div>
  );
}

export function OOHInspectionReport({ submissionId }: { submissionId: string }) {
  const [data, setData] = useState<OOHBootstrap>(fallbackOOHBootstrap);
  const [notice, setNotice] = useState('Loading latest inspection evidence...');

  useEffect(() => {
    let mounted = true;
    fetchOOHBootstrap().then(result => {
      if (!mounted) return;
      setData(result);
      setNotice('Inspection report loaded from captured survey evidence.');
    });
    return () => {
      mounted = false;
    };
  }, []);

  const submission = data.submissions.find(item => item.id === submissionId);
  const asset = submission ? data.assets.find(item => item.id === submission.assetId) : undefined;
  const assignment = submission ? data.assignments.find(item => item.id === submission.assignmentId) : undefined;
  const photoEvidence = useMemo(() => submission?.evidence.filter(item => item.type === 'photo') ?? [], [submission]);
  const otherEvidence = useMemo(() => submission?.evidence.filter(item => item.type !== 'photo') ?? [], [submission]);

  if (!submission || !asset) {
    return <ReportMissing />;
  }

  const passAnswers = submission.answers.filter(answer => /pass|online|yes|ready|uploaded|signed/i.test(answer.answer)).length;
  const issueAnswers = Math.max(0, submission.answers.length - passAnswers);

  return (
    <div className="min-h-screen bg-[#07111F] text-[#EEF3FA]">
      <header className="border-b border-white/10 bg-[#081426] px-4 py-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <a className="inline-flex items-center gap-2 text-sm font-bold text-[#7EB8F7]" href="/ooh">
                <ArrowLeft size={16} /> Back to OOH control center
              </a>
              <p className="mt-5 text-[11px] font-black uppercase tracking-[0.28em] text-[#7EB8F7]">4C360 Inspection Report</p>
              <h1 className="mt-2 max-w-4xl text-3xl font-black text-white md:text-5xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{asset.name}</h1>
              <p className="mt-3 text-sm text-[#B8C7DB]">{submission.id} - {asset.id} - {fmtDateTime(submission.submittedAt)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
              <div className="flex flex-wrap gap-2">
                <Pill>{submission.status}</Pill>
                <Pill>{submission.syncStatus ?? 'Synced'}</Pill>
                <Pill>{submission.qrVerified ? 'QR verified' : 'QR pending'}</Pill>
              </div>
              <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white" onClick={() => setNotice('Inspection report export prepared.')}>
                <Download size={15} /> Export Report
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-5 rounded-lg border border-blue-400/15 bg-[#0B172A] p-3 text-sm text-[#B8C7DB]">{notice}</div>

        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <AssetVisual asset={asset} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryMetric label="Survey Score" value={`${submission.score}%`} icon={ClipboardCheck} />
            <SummaryMetric label="Photo Evidence" value={photoEvidence.length} icon={Camera} />
            <SummaryMetric label="GPS Accuracy" value={`${submission.gpsAccuracyMeters ?? 8}m`} icon={MapPin} />
            <SummaryMetric label="Checklist Issues" value={issueAnswers + submission.issues.length} icon={issueAnswers || submission.issues.length ? TriangleAlert : CheckCircle2} />
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <h2 className="text-xl font-black text-white">Inspection Summary</h2>
            <div className="mt-4 grid gap-3">
              {[
                ['Submitted by', submission.submittedBy],
                ['Reviewer', submission.reviewer],
                ['Assignment', assignment?.name ?? submission.assignmentId],
                ['Team / vendor', assignment ? `${assignment.team} / ${assignment.vendor}` : 'Field team'],
                ['GPS lock', `${submission.gps.label} (${submission.gps.lat.toFixed(4)}, ${submission.gps.lng.toFixed(4)})`],
                ['Offline status', submission.offlineCaptured ? 'Captured offline, synced later' : 'Captured online'],
                ['Client publish state', submission.clientPublishStatus ?? 'Internal Only'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
                  <p className="mt-1 text-sm font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <h2 className="text-xl font-black text-white">Asset Snapshot</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['Format', asset.format],
                ['Dimensions', asset.dimensions],
                ['Campaign', asset.campaign],
                ['Client', asset.client],
                ['Market', asset.market],
                ['Route', asset.route],
                ['Permit', `${asset.permitStatus} until ${fmt(asset.permitExpiry)}`],
                ['Power / player', `${asset.powerStatus} / ${asset.playerStatus}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-[#07111F] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{label}</p>
                  <p className="mt-1 text-sm font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-[#07111F] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Address</p>
              <p className="mt-1 text-sm font-bold text-white">{asset.address}</p>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-white/10 bg-[#0B172A] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-white">Photo Evidence</h2>
              <p className="mt-1 text-sm text-[#9DB4D0]">Wide, close-up, angle and question-level photos captured through the field survey.</p>
            </div>
            <Pill>{submission.clientPublishStatus ?? 'Internal Only'}</Pill>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {photoEvidence.map(item => <EvidenceCard key={item.id} item={item} asset={asset} />)}
            {photoEvidence.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-4 text-sm text-[#9DB4D0]">No photo evidence is attached to this inspection report yet.</div>
            )}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <h2 className="text-xl font-black text-white">Checklist Results</h2>
            <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-[#07111F] text-[11px] uppercase tracking-wide text-[#7A94B4]">
                  <tr>
                    <th className="px-3 py-3">Question</th>
                    <th className="px-3 py-3">Answer</th>
                    <th className="px-3 py-3">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.answers.map(answer => {
                    const answerEvidence = submission.evidence.filter(item => item.notes?.includes(`Answer: ${answer.answer}`) || item.label.toLowerCase().includes(answer.question.toLowerCase().slice(0, 24)));
                    return (
                      <tr key={answer.questionId} className="border-t border-white/10">
                        <td className="px-3 py-3 text-[#B8C7DB]">{answer.question}</td>
                        <td className="px-3 py-3 font-black text-white">{answer.answer}</td>
                        <td className="px-3 py-3 text-[#9DB4D0]">{answerEvidence.length ? `${answerEvidence.length} file(s)` : 'Summary only'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <h2 className="text-xl font-black text-white">Verification Trail</h2>
            <div className="mt-4 space-y-3">
              {[
                { label: 'QR verification', value: submission.qrVerified ? 'Verified against asset QR' : 'Pending QR confirmation', icon: QrCode },
                { label: 'GPS lock', value: `${submission.gpsAccuracyMeters ?? 8}m accuracy`, icon: MapPin },
                { label: 'Sync state', value: submission.syncStatus ?? 'Synced', icon: Wifi },
                { label: 'Review note', value: submission.reviewerNotes ?? 'Awaiting reviewer notes', icon: ShieldCheck },
              ].map(item => (
                <div key={item.label} className="flex gap-3 rounded-lg border border-white/10 bg-[#07111F] p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-[#7EB8F7]">
                    <item.icon size={17} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">{item.label}</p>
                    <p className="mt-1 text-xs text-[#9DB4D0]">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {submission.issues.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
                <p className="text-sm font-black text-amber-100">Open findings</p>
                <ul className="mt-2 space-y-1 text-xs text-[#FDE68A]">
                  {submission.issues.map(issue => <li key={issue}>{issue}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>

        {otherEvidence.length > 0 && (
          <section className="mt-5 rounded-lg border border-white/10 bg-[#0B172A] p-4">
            <h2 className="text-xl font-black text-white">Supporting Evidence</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {otherEvidence.map(item => <EvidenceCard key={item.id} item={item} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
