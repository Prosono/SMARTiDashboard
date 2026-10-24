import "./reportLoading.css";

export function ReportLoading() {
  return (
    <div className="report-loading" role="status" aria-live="polite">
      <div className="report-loading-mark" aria-hidden="true">
        <span />
        <img src="./brand/smarti-logo.png" alt="" width="52" height="52" />
      </div>
      <strong>Lager rapporten din…</strong>
      <p>Vi samler historikken og setter sammen oversikten.</p>
    </div>
  );
}
