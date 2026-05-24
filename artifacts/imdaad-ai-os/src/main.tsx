import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ScanPage } from "./pages/ScanPage";
import { ReportPage } from "./pages/ReportPage";
import { FieldPortal } from "./pages/FieldPortal";
import { FieldJobDeepLink } from "./pages/FieldJobDeepLink";
import { LoginPage } from "./components/auth/LoginPage";
import { FieldOpsCapture } from "./modules/fieldops/FieldOpsCapture";
import { OOHClientPage, OOHFieldCapture, OOHInspectionReport, OOHOperatorApp } from "./modules/ooh";
import { ModuleBrochure } from "./pages/ModuleBrochure";
import { InteractiveDemoWalkthrough } from "./modules/demo";
import { IncidentProvider, useIncidents } from "./context/IncidentContext";
import { NotificationProvider } from "./context/NotificationContext";
import { MemberProfilesProvider } from "./context/MemberProfilesContext";
import { ClientsProvider } from "./context/ClientsContext";
import { VendorsProvider } from "./context/VendorsContext";
import "./index.css";

const ELEVENLABS_AGENT_ID = "agent_1001ksdt92e4e1msfcj96f2p7b75";
const ELEVENLABS_WIDGET_SCRIPT_ID = "elevenlabs-convai-widget-script";
const ELEVENLABS_WIDGET_SCRIPT_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";

function ElevenLabsAgentWidget() {
  useEffect(() => {
    if (document.getElementById(ELEVENLABS_WIDGET_SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = ELEVENLABS_WIDGET_SCRIPT_ID;
    script.src = ELEVENLABS_WIDGET_SCRIPT_SRC;
    script.async = true;
    script.type = "text/javascript";
    document.body.appendChild(script);
  }, []);

  return createElement("elevenlabs-convai", { "agent-id": ELEVENLABS_AGENT_ID });
}

function ScanRoute() {
  const { addIncident } = useIncidents();
  const base = import.meta.env.BASE_URL ?? '/';

  const pathPart = window.location.pathname.replace(base.replace(/\/$/, ''), '');
  const match = pathPart.match(/^\/scan\/([^/]+)\/([^/]+)/);
  const siteId  = match?.[1] ?? 'silicon-oasis';
  const assetId = match?.[2] ?? 'general';

  return (
    <ScanPage
      siteId={siteId}
      assetId={assetId}
      onIncidentCreated={(inc) => {
        addIncident({
          ...inc,
          siteId,
          clientId: 'CLT-001',
          lat: 25.1185,
          lng: 55.3755,
        });
      }}
    />
  );
}

function RoutedApp() {
  const base = import.meta.env.BASE_URL ?? '/';
  const path = window.location.pathname.replace(base.replace(/\/$/, ''), '');
  const isScan = path.startsWith('/scan/');
  const isReport = path === '/report' || path === '/report/';
  const isField = path === '/field' || path === '/field/' || path.startsWith('/field/');
  const fieldOpsCaptureMatch = path.match(/^\/fieldops\/survey\/([^/]+)\/capture/);
  const oohFieldCaptureMatch = path.match(/^\/ooh\/field\/([^/]+)/);
  const oohClientPageMatch = path.match(/^\/ooh\/client\/([^/]+)/);
  const oohInspectionReportMatch = path.match(/^\/ooh\/report\/([^/]+)/);
  const isOoh = path === '/ooh' || path === '/ooh/' || path.startsWith('/ooh/');
  const isLogin = path === '/login' || path === '/login/';
  const isPropertiesDemo = path === '/demo/properties' || path === '/demo/properties/';
  const isBrochuresHost = window.location.hostname === 'brochures.4cgrc.com';
  const isSolutionsHost = window.location.hostname === 'solutions.4c360.com';
  const isSolutionSlug = /^\/(properties|fm|marine|osh)\/?$/.test(path);
  const isProductFamilySolution = path === '/4c360' || path === '/4c360/' || /^\/4c360\/(properties|fm|marine|osh)\/?$/.test(path);
  const isBrochure = path === '/brochure' || path === '/brochure/' || path.startsWith('/brochure/') || isBrochuresHost || isSolutionsHost || isSolutionSlug || isProductFamilySolution;

  if (isLogin) {
    return <LoginPage />;
  }

  if (oohFieldCaptureMatch) {
    return <OOHFieldCapture assignmentId={oohFieldCaptureMatch[1]} />;
  }

  if (oohClientPageMatch) {
    return <OOHClientPage token={oohClientPageMatch[1]} />;
  }

  if (oohInspectionReportMatch) {
    return <OOHInspectionReport submissionId={oohInspectionReportMatch[1]} />;
  }

  if (isOoh) {
    return <OOHOperatorApp />;
  }

  if (isPropertiesDemo) {
    return (
      <VendorsProvider>
        <ClientsProvider>
          <MemberProfilesProvider>
            <NotificationProvider>
              <IncidentProvider>
                <InteractiveDemoWalkthrough />
              </IncidentProvider>
            </NotificationProvider>
          </MemberProfilesProvider>
        </ClientsProvider>
      </VendorsProvider>
    );
  }

  if (isBrochure) {
    return <ModuleBrochure />;
  }

  if (isScan) {
    return (
      <NotificationProvider>
        <IncidentProvider>
          <ScanRoute />
        </IncidentProvider>
      </NotificationProvider>
    );
  }

  if (isReport) {
    const params = new URLSearchParams(window.location.search);
    const memberToken = params.get('member') ?? undefined;
    return <ReportPage memberToken={memberToken} />;
  }

  if (fieldOpsCaptureMatch) {
    return <FieldOpsCapture surveyId={fieldOpsCaptureMatch[1]} />;
  }

  if (isField) {
    // Deep link: /field/job/:jobId — direct entry into a specific job (no PIN required)
    const jobMatch = path.match(/^\/field\/job\/([^/]+)/);
    if (jobMatch) {
      const jobId = jobMatch[1];
      return (
        <NotificationProvider>
          <IncidentProvider>
            <FieldJobDeepLink jobId={jobId} />
          </IncidentProvider>
        </NotificationProvider>
      );
    }

    // Deep link: /field/copilot/:jobId — open job detail with copilot pre-opened
    const copilotMatch = path.match(/^\/field\/copilot\/([^/]+)/);
    if (copilotMatch) {
      const jobId = copilotMatch[1];
      return (
        <NotificationProvider>
          <IncidentProvider>
            <FieldJobDeepLink jobId={jobId} openCopilotImmediately />
          </IncidentProvider>
        </NotificationProvider>
      );
    }

    const woMatch = path.match(/^\/field\/work-orders\/([^/]+)/);
    const initialWorkOrderId = woMatch?.[1] ?? undefined;
    return (
      <NotificationProvider>
        <IncidentProvider>
          <FieldPortal initialWorkOrderId={initialWorkOrderId} />
        </IncidentProvider>
      </NotificationProvider>
    );
  }

  return (
    <VendorsProvider>
      <ClientsProvider>
        <MemberProfilesProvider>
          <NotificationProvider>
            <IncidentProvider>
              <App />
            </IncidentProvider>
          </NotificationProvider>
        </MemberProfilesProvider>
      </ClientsProvider>
    </VendorsProvider>
  );
}

function Root() {
  return (
    <>
      <RoutedApp />
      <ElevenLabsAgentWidget />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
