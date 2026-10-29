import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };
function lamp(paths: ReactNode) {
  return function LampIcon({ size = 24, strokeWidth = 2, ...props }: IconProps) {
    return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths}</svg>;
  };
}
// Shared vector artwork for the picker, room rows and device details.
export const LightDefault = lamp(<><circle cx="24" cy="24" r="10"/><path d="M24 3v5m0 32v5M3 24h5m32 0h5M9 9l4 4m22 22 4 4M9 39l4-4m22-22 4-4"/></>);
export const LightBulb = lamp(<><path d="M18 33c0-8-8-10-8-19a14 14 0 0 1 28 0c0 9-8 11-8 19Z" transform="translate(0 4) scale(1 .85)"/><path d="M18 37h12m-10 5h8"/></>);
export const LightPendant = lamp(<><path d="M24 3v13m-4 0h8v4M5 34c1-9 9-14 19-14s18 5 19 14Z"/><path d="M18 34v2a6 6 0 0 0 12 0v-2"/></>);
export const LightFloor = lamp(<><path d="m17 5-6 16h26L31 5ZM24 21v22M15 43h18"/></>);
export const LightDesk = lamp(<><path d="m24 10-17 17m1 3 9 12m-8 3h20c0-5-3-6-6-6h-8c-3 0-6 1-6 6Z"/><circle cx="6" cy="27" r="3"/><circle cx="26" cy="8" r="3"/><path d="M30 7c6 1 10 5 14 10L27 27c-3-7-4-12-1-16"/></>);
export const LightCeiling = lamp(<><path d="M4 14h40M9 14v5m30-5v5"/><path d="M24 18C12 18 5 21 5 25s8 12 19 12 19-8 19-12-7-7-19-7Z"/></>);
export const LightStrip = lamp(<><path d="M6 24h27c5 0 9-3 12-10 2 13-5 23-17 23H6a6.5 6.5 0 0 1 0-13Z"/><path d="M8 28h4v5H8zm12 0h4v5h-4zm12-1h4v5h-4z"/></>);
export const LightSpot = lamp(<><path d="M10 4h18v5H10zm7 5v6m6-6v8M17 16c-4 1-7 5-6 10l13 12 11-13-13-10Z"/><ellipse cx="29.5" cy="31.5" rx="8" ry="3.5" transform="rotate(-50 29.5 31.5)"/><path d="m39 30 6 4m-11 7 4 5"/></>);
export const LightOutdoor = lamp(<><path d="M5 7h6v24H5zm6 6h19v5m-7 0-6 18h25l-6-18ZM29 41v5"/></>);
