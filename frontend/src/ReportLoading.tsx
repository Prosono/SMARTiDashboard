import "./reportLoading.css";

export function ReportLoading({ lang = "nb" }: { lang?: string }) {
  return (
    <div className="report-loading" role="status" aria-live="polite">
      <div className="report-loading-mark" aria-hidden="true">
        <span />
        <img src="./brand/smarti-logo.png" alt="" width="52" height="52" />
      </div>
      <strong>
        {lang === "en" ? "Preparing your report…" : "Lager rapporten din…"}
      </strong>
      <p>
        {lang === "en"
          ? "Collecting history and bringing the results together."
          : "Vi samler historikken og setter sammen oversikten."}
      </p>
    </div>
  );
}
