import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, FileSignature, MapPin, QrCode, Send, ShieldCheck } from 'lucide-react';
import { fetchOOHBootstrap, submitOOHSurvey } from './api';
import { fallbackOOHBootstrap } from './seedData';
import type { OOHBootstrap, OOHSurveyQuestion } from './types';

type PhotoCategory = 'Wide' | 'Close-up' | 'Angle' | 'Player' | 'Permit' | 'Exception';

const photoCategories: PhotoCategory[] = ['Wide', 'Close-up', 'Angle', 'Player', 'Permit', 'Exception'];

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function defaultAnswer(question: OOHSurveyQuestion): string {
  if (question.type === 'pass_fail') return 'Pass';
  if (question.type === 'yes_no') return 'Yes';
  if (question.type === 'gps') return 'GPS captured';
  if (question.type === 'photo') return 'Photo uploaded';
  if (question.type === 'signature') return 'Signature captured';
  if (question.type === 'single_choice') return question.options?.[0] ?? 'Completed';
  return question.id === 'qr' ? 'QR verified' : 'Completed';
}

function supportsQuestionPhoto(question: OOHSurveyQuestion): boolean {
  return question.type !== 'photo' && (question.evidenceRequired || question.type === 'pass_fail' || question.type === 'single_choice');
}

function defaultPhotoCategory(question: OOHSurveyQuestion): PhotoCategory {
  if (question.id === 'lighting') return 'Player';
  if (question.id === 'condition') return 'Close-up';
  if (question.id === 'creative') return 'Wide';
  return 'Angle';
}

export function OOHFieldCapture({ assignmentId }: { assignmentId: string }) {
  const [data, setData] = useState<OOHBootstrap>(fallbackOOHBootstrap);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photoLabel, setPhotoLabel] = useState('Wide, close-up and angle photos ready');
  const [photoCategory, setPhotoCategory] = useState<PhotoCategory>('Wide');
  const [questionPhotoLabels, setQuestionPhotoLabels] = useState<Record<string, string>>({});
  const [questionPhotoCategories, setQuestionPhotoCategories] = useState<Record<string, PhotoCategory>>({});
  const [signature, setSignature] = useState('Rashid Khan');
  const [notice, setNotice] = useState('');
  const [qrVerified, setQrVerified] = useState(true);
  const [offlineCaptured, setOfflineCaptured] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'Synced' | 'Queued' | 'Offline'>('Synced');
  const [issueFlag, setIssueFlag] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchOOHBootstrap().then(store => {
      if (mounted) setData(store);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const assignment = useMemo(() => data.assignments.find(item => item.id === assignmentId) ?? data.assignments[0], [assignmentId, data.assignments]);
  const asset = useMemo(() => data.assets.find(item => item.id === assignment?.assetIds[0]) ?? data.assets[0], [assignment, data.assets]);
  const questions = assignment?.questions ?? [];
  const requiredQuestions = questions.filter(question => question.required);
  const completed = requiredQuestions.filter(question => {
    if (question.type === 'photo') return photoLabel.trim().length > 0;
    if (question.type === 'signature') return signature.trim().length > 0;
    return (answers[question.id] ?? defaultAnswer(question)).trim().length > 0;
  }).length;
  const progress = requiredQuestions.length ? Math.round((completed / requiredQuestions.length) * 100) : 100;
  const issueCount = Object.values(answers).filter(answer => /fail|no|attention|blocked|damaged|missing/i.test(answer)).length + (issueFlag ? 1 : 0);
  const score = Math.max(58, 96 - issueCount * 14);

  const getQuestionPhotoLabel = (question: OOHSurveyQuestion) => questionPhotoLabels[question.id] ?? `${question.label} photo evidence ready`;
  const getQuestionPhotoCategory = (question: OOHSurveyQuestion) => questionPhotoCategories[question.id] ?? defaultPhotoCategory(question);

  const updateAnswer = (question: OOHSurveyQuestion, value: string) => {
    setAnswers(current => ({ ...current, [question.id]: value }));
    setNotice('');
  };

  const setQuestionPhotoLabel = (question: OOHSurveyQuestion, label: string) => {
    setQuestionPhotoLabels(current => ({ ...current, [question.id]: label }));
    setNotice('');
  };

  const setQuestionPhotoCategory = (question: OOHSurveyQuestion, category: PhotoCategory) => {
    setQuestionPhotoCategories(current => ({ ...current, [question.id]: category }));
    setNotice('');
  };

  const submit = async () => {
    if (!assignment || !asset || submitting) return;
    if (progress < 100) {
      setNotice('Complete the required checklist, photo proof and signature before submitting.');
      return;
    }

    setSubmitting(true);
    const submittedAt = new Date().toISOString();
    const issues = issueCount ? ['One or more checklist answers require reviewer attention'] : [];
    const questionPhotoEvidence = questions.filter(supportsQuestionPhoto).map((question, index) => ({
      id: `QPH-${Date.now().toString().slice(-8)}-${index}`,
      type: 'photo' as const,
      label: `${question.label}: ${getQuestionPhotoLabel(question)}`,
      capturedAt: submittedAt,
      capturedBy: signature,
      gps: { lat: asset.lat, lng: asset.lng },
      notes: `Answer: ${answers[question.id] ?? defaultAnswer(question)}`,
      photoCategory: getQuestionPhotoCategory(question),
      qrVerified,
      gpsAccuracyMeters: gpsAccuracy,
      offlineCaptured,
      syncStatus,
      clientPublishStatus: 'Internal Only' as const,
      status: 'Pending Review' as const,
    }));
    const evidence = [
      {
        id: `EVD-${Date.now().toString().slice(-8)}`,
        type: 'photo' as const,
        label: photoLabel,
        capturedAt: submittedAt,
        capturedBy: signature,
        gps: { lat: asset.lat, lng: asset.lng },
        photoCategory,
        qrVerified,
        gpsAccuracyMeters: gpsAccuracy,
        offlineCaptured,
        syncStatus,
        clientPublishStatus: 'Internal Only' as const,
        status: 'Pending Review' as const,
      },
      ...questionPhotoEvidence,
      {
        id: `GPS-${Date.now().toString().slice(-8)}`,
        type: 'gps' as const,
        label: `GPS confirmed at ${asset.lat.toFixed(4)}, ${asset.lng.toFixed(4)}`,
        capturedAt: submittedAt,
        capturedBy: signature,
        gps: { lat: asset.lat, lng: asset.lng },
        qrVerified,
        gpsAccuracyMeters: gpsAccuracy,
        offlineCaptured,
        syncStatus,
        clientPublishStatus: 'Internal Only' as const,
        status: 'Pending Review' as const,
      },
      {
        id: `SIG-${Date.now().toString().slice(-8)}`,
        type: 'signature' as const,
        label: `Signed by ${signature}`,
        capturedAt: submittedAt,
        capturedBy: signature,
        gps: { lat: asset.lat, lng: asset.lng },
        qrVerified,
        gpsAccuracyMeters: gpsAccuracy,
        offlineCaptured,
        syncStatus,
        clientPublishStatus: 'Internal Only' as const,
        status: 'Pending Review' as const,
      },
    ];

    try {
      const store = await submitOOHSurvey(assignment.id, {
        assetId: asset.id,
        submittedBy: signature,
        submittedAt,
        gps: { lat: asset.lat, lng: asset.lng, label: asset.address },
        score,
        status: 'Pending Review',
        issues,
        qrVerified,
        gpsAccuracyMeters: gpsAccuracy,
        photoCategories: [photoCategory, ...questionPhotoEvidence.map(item => item.photoCategory)],
        offlineCaptured,
        syncStatus,
        reviewerNotes: issueCount ? 'Field issue flagged for reviewer attention.' : 'Ready for proof review.',
        clientPublishStatus: 'Internal Only',
        reviewer: assignment.reviewer,
        evidence,
        answers: questions.map(question => ({
          questionId: question.id,
          question: question.label,
          answer: question.type === 'photo' ? photoLabel : question.type === 'signature' ? signature : answers[question.id] ?? defaultAnswer(question),
        })),
      });
      setData(store);
      setSubmittedId(store.submissions[0]?.id ?? 'SUBMITTED');
      setNotice('Synced to OOH evidence review.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The submission could not be synced.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!assignment || !asset) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07111F] p-4 text-[#EEF3FA]">
        <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#0B172A] p-6 text-center">
          <a className="mb-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-[#D8E9FF] hover:bg-white/10" href="/ooh/surveys">
            <ArrowLeft size={14} /> Back to Surveys
          </a>
          <h1 className="text-xl font-black">Assignment unavailable</h1>
          <p className="mt-2 text-sm text-[#9DB4D0]">The OOH field assignment could not be found.</p>
        </div>
      </div>
    );
  }

  if (submittedId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07111F] p-4 text-[#EEF3FA]">
        <div className="w-full max-w-sm rounded-lg border border-emerald-400/25 bg-[#0B172A] p-6 text-center shadow-2xl shadow-black/30">
          <a className="mb-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-[#D8E9FF] hover:bg-white/10" href="/ooh/surveys">
            <ArrowLeft size={14} /> Back to Surveys
          </a>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-200">
            <CheckCircle2 size={36} />
          </div>
          <h1 className="mt-5 text-2xl font-black" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Evidence Submitted</h1>
          <p className="mt-2 text-sm leading-6 text-[#B8C7DB]">{notice}</p>
          <div className="mt-5 rounded-lg border border-white/10 bg-[#07111F] p-4 text-left">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Submission ID</p>
            <p className="mt-1 font-mono text-sm font-bold text-white">{submittedId}</p>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Reviewer</p>
            <p className="mt-1 text-sm font-bold text-emerald-200">{assignment.reviewer}</p>
          </div>
          <a className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#E11D2E] text-sm font-bold text-white" href="/ooh">Return to command center</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111F] px-4 py-5 text-[#EEF3FA]">
      <div className="mx-auto max-w-md overflow-hidden rounded-lg border border-white/10 bg-[#0B172A] shadow-2xl shadow-black/30">
        <header className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(225,29,46,0.16),rgba(46,127,255,0.08))] p-5">
          <a className="mb-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#07111F]/70 px-3 py-2 text-xs font-black text-[#D8E9FF] hover:bg-white/10" href="/ooh/surveys">
            <ArrowLeft size={14} /> Back to Surveys
          </a>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#FFB4BC]">4C360 OOH Field Survey</p>
          <h1 className="mt-2 text-xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{assignment.name}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-[#B8C7DB]"><MapPin size={13} /> {asset.name} - {asset.market}</p>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#112040]">
              <div className="h-full rounded-full bg-[#E11D2E]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </header>

        <div className="space-y-3 p-4">
          <div className="rounded-lg border border-white/10 bg-[#07111F] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-[#7A94B4]">Asset</p>
            <p className="mt-1 text-sm font-black text-white">{asset.id}</p>
            <p className="mt-1 text-xs text-[#9DB4D0]">{asset.address}</p>
          </div>

          <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-blue-100">Evidence lock</p>
                <p className="mt-1 text-sm font-black text-white">QR, GPS, timestamp and sync state</p>
              </div>
              <button className={`rounded-lg px-3 py-2 text-xs font-black ${qrVerified ? 'bg-emerald-400/15 text-emerald-100' : 'bg-red-400/15 text-red-100'}`} onClick={() => setQrVerified(current => !current)}>
                {qrVerified ? 'QR Verified' : 'QR Missing'}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-center">
                <MapPin size={17} className="mx-auto text-[#7EB8F7]" />
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">GPS</p>
                <p className="text-xs font-black text-white">{gpsAccuracy}m</p>
              </div>
              <button className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-center" onClick={() => {
                setOfflineCaptured(current => !current);
                setSyncStatus(offlineCaptured ? 'Synced' : 'Queued');
              }}>
                <ShieldCheck size={17} className="mx-auto text-emerald-200" />
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Mode</p>
                <p className="text-xs font-black text-white">{offlineCaptured ? 'Offline' : 'Live'}</p>
              </button>
              <div className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-center">
                <QrCode size={17} className="mx-auto text-amber-100" />
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Sync</p>
                <p className="text-xs font-black text-white">{syncStatus}</p>
              </div>
            </div>
          </div>

          {questions.map(question => {
            const value = answers[question.id] ?? defaultAnswer(question);
            return (
              <div key={question.id} className="rounded-lg border border-white/10 bg-[#07111F] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{question.label}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">{question.type.replace('_', ' ')}</p>
                  </div>
                  {question.required && <span className="rounded-full bg-[#E11D2E]/12 px-2 py-1 text-[9px] font-bold text-red-100">Required</span>}
                </div>

                {question.type === 'pass_fail' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {['Pass', 'Fail'].map(option => (
                      <button key={option} className={`h-10 rounded-lg border text-sm font-bold ${value === option ? 'border-[#2E7FFF] bg-[#2E7FFF]/18 text-white' : 'border-white/10 bg-white/5 text-[#B8C7DB]'}`} onClick={() => updateAnswer(question, option)}>
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {question.type === 'single_choice' && (
                  <div className="mt-3 grid gap-2">
                    {(question.options ?? ['Online', 'Needs attention']).map(option => (
                      <button key={option} className={`h-10 rounded-lg border text-sm font-bold ${value === option ? 'border-[#2E7FFF] bg-[#2E7FFF]/18 text-white' : 'border-white/10 bg-white/5 text-[#B8C7DB]'}`} onClick={() => updateAnswer(question, option)}>
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {question.type === 'text' && (
                  <input className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-[#0B172A] px-3 text-sm text-white outline-none" value={value} onChange={event => updateAnswer(question, event.target.value)} />
                )}

                {question.type === 'gps' && (
                  <button className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/10 text-sm font-bold text-blue-100" onClick={() => {
                    setGpsAccuracy(4);
                    updateAnswer(question, `GPS captured: ${asset.lat.toFixed(4)}, ${asset.lng.toFixed(4)} within 4m`);
                  }}>
                    <MapPin size={16} /> Capture GPS
                  </button>
                )}

                {question.type === 'photo' && (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      {photoCategories.map(category => (
                        <button key={category} className={`h-9 rounded-lg border text-[11px] font-bold ${photoCategory === category ? 'border-[#2E7FFF] bg-[#2E7FFF]/18 text-white' : 'border-white/10 bg-white/5 text-[#B8C7DB]'}`} onClick={() => setPhotoCategory(category)}>
                          {category}
                        </button>
                      ))}
                    </div>
                    <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/10 text-sm font-bold text-blue-100">
                      <Camera size={16} /> Photo Evidence
                      <input className="hidden" type="file" accept="image/*" capture="environment" onChange={event => setPhotoLabel(event.target.files?.[0]?.name ?? photoLabel)} />
                    </label>
                    <p className="rounded-lg border border-white/10 bg-[#0B172A] p-2 text-xs text-[#B8C7DB]">{photoLabel}</p>
                  </div>
                )}

                {supportsQuestionPhoto(question) && (
                  <div className="mt-3 space-y-2 rounded-lg border border-blue-400/15 bg-blue-400/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#7EB8F7]">Question photo evidence</p>
                      {question.evidenceRequired && <span className="rounded-full bg-[#E11D2E]/12 px-2 py-1 text-[9px] font-bold text-red-100">Evidence Required</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {photoCategories.map(category => (
                        <button
                          key={category}
                          className={`h-9 rounded-lg border text-[11px] font-bold ${getQuestionPhotoCategory(question) === category ? 'border-[#2E7FFF] bg-[#2E7FFF]/18 text-white' : 'border-white/10 bg-white/5 text-[#B8C7DB]'}`}
                          onClick={() => setQuestionPhotoCategory(question, category)}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                    <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/10 text-sm font-bold text-blue-100">
                      <Camera size={16} /> Photo Evidence
                      <input className="hidden" type="file" accept="image/*" capture="environment" onChange={event => setQuestionPhotoLabel(question, event.target.files?.[0]?.name ?? getQuestionPhotoLabel(question))} />
                    </label>
                    <p className="rounded-lg border border-white/10 bg-[#0B172A] p-2 text-xs text-[#B8C7DB]">{getQuestionPhotoLabel(question)}</p>
                  </div>
                )}

                {question.type === 'signature' && (
                  <label className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-[#0B172A] px-3 py-2">
                    <FileSignature size={16} className="text-[#7EB8F7]" />
                    <input className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" value={signature} onChange={event => setSignature(event.target.value)} />
                  </label>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-center">
              <QrCode size={18} className="mx-auto text-[#7EB8F7]" />
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">QR</p>
              <p className="text-xs font-black text-white">{qrVerified ? 'Verified' : 'Missing'}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-center">
              <ShieldCheck size={18} className="mx-auto text-emerald-200" />
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Due</p>
              <p className="text-xs font-black text-white">{shortDate(assignment.dueDate)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#07111F] p-3 text-center">
              <Camera size={18} className="mx-auto text-amber-100" />
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#7A94B4]">Score</p>
              <p className="text-xs font-black text-white">{score}</p>
            </div>
          </div>

          <button className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-black ${issueFlag ? 'border-red-400/25 bg-red-400/12 text-red-100' : 'border-white/10 bg-white/5 text-[#B8C7DB]'}`} onClick={() => setIssueFlag(current => !current)}>
            <ShieldCheck size={16} /> {issueFlag ? 'Issue Flagged For Reviewer' : 'No Exceptions Found'}
          </button>

          {notice && <p className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">{notice}</p>}

          <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#E11D2E] text-sm font-black text-white disabled:opacity-60" onClick={() => void submit()} disabled={submitting}>
            <Send size={17} /> {submitting ? 'Submitting...' : 'Submit Evidence'}
          </button>
        </div>
      </div>
    </div>
  );
}
