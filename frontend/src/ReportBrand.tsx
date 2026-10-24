export function ReportBrand({ title }: { title: string }) {
  return (
    <div className="report-brand">
      <div>
        <img src="./brand/smarti-logo.png" alt="" width="32" height="32" />
        <strong>SMARTi</strong>
      </div>
      <span>{title}</span>
    </div>
  );
}
