import type { SVGProps } from "react";

export function RobotVacuumIcon({
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="9" r="2.3" />
      <path d="M6.5 16.5a7 7 0 0 0 11 0M9 19h6M3.8 18.3l-1.5 2M20.2 18.3l1.5 2" />
      <path d="M8 5.3h.01M16 5.3h.01" strokeWidth="2.5" />
    </svg>
  );
}
