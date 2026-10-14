export function ProtocolLogo({
  provider,
  className = "",
  label,
}: {
  provider: string;
  className?: string;
  label?: string;
}) {
  const zigbee = provider === "zigbee2mqtt";
  return (
    <img
      className={`protocol-logo ${className}`}
      src={
        new URL(
          `brand/${zigbee ? "zigbee-logo.jpg" : "zwave-logo.png"}`,
          document.baseURI,
        ).href
      }
      alt={label ?? (zigbee ? "Zigbee" : "Z-Wave")}
    />
  );
}
