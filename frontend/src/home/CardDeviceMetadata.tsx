import { useContext } from "react";
import { BatteryLow, BatteryMedium } from "lucide-react";
import type { Control, Home } from "../types";
import { CardPresentation } from "./CardPresentation";
import { deviceBattery, deviceName, isLowBattery } from "./deviceMetadata";
import "./cardDeviceMetadata.css";

export function CardDeviceMetadata({
  control,
  home,
  lang,
  available,
  visibleTitle,
  fallbackName,
  id,
}: {
  control: Control;
  home: Home;
  lang: string;
  available: boolean;
  visibleTitle?: string;
  fallbackName?: string;
  id?: string;
}) {
  const { title } = useContext(CardPresentation);
  const name = deviceName(control, home) || fallbackName?.trim();
  const shownTitle = visibleTitle ?? (title || control.name);
  const showName =
    name && name.toLocaleLowerCase() !== shownTitle.trim().toLocaleLowerCase();
  const battery =
    available &&
    !(
      control.domain === "sensor" &&
      control.attributes.device_class === "battery"
    )
      ? deviceBattery(control, home)
      : null;
  if (!showName && battery === null) return id ? <span id={id} hidden /> : null;
  const low = battery !== null && isLowBattery(battery);
  const Battery = low ? BatteryLow : BatteryMedium;
  return (
    <span className="card-device-metadata" id={id}>
      {showName && (
        <span className="card-device-label" title={name}>
          {name}
        </span>
      )}
      {battery !== null && (
        <span className="card-device-battery" data-low={low || undefined}>
          <Battery size={14} aria-hidden="true" />
          <span className="card-device-metadata-description">
            {lang === "en" ? "Battery level" : "Batterinivå"}{" "}
          </span>
          {battery.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
            maximumFractionDigits: 1,
          })}{" "}
          %
        </span>
      )}
    </span>
  );
}
