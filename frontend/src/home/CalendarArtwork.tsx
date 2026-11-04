import { useState } from "react";
import "./calendarArtwork.css";

/** The picture is timeless; its day always comes from the actual calendar. */
export function CalendarArtwork({ day }: { day: string | number }) {
  const [failed, fail] = useState(false);
  return (
    <span className="calendar-artwork" data-failed={failed || undefined}>
      {!failed && (
        <img
          src={new URL("home/equipment/calendar.webp", document.baseURI).href}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => fail(true)}
        />
      )}
      <strong>{day}</strong>
    </span>
  );
}
