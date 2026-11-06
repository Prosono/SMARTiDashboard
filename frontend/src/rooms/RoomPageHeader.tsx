import type { ReactNode, RefObject } from "react";
import { ArrowLeft, ChevronDown, Search, Settings2 } from "lucide-react";
import type { Home } from "../types";

export function RoomPageHeader({
  title,
  homeName,
  lang,
  art,
  rooms,
  selectedRoom,
  selectRoom,
  back,
  manage,
  searchOpen,
  searchId,
  toggleSearch,
  searchButton,
}: {
  title: string;
  homeName: string;
  lang: string;
  art?: ReactNode;
  rooms?: Home["areas"];
  selectedRoom?: string;
  selectRoom?: (room: string) => void;
  back?: () => void;
  manage?: () => void;
  searchOpen: boolean;
  searchId: string;
  toggleSearch: () => void;
  searchButton: RefObject<HTMLButtonElement | null>;
}) {
  const en = lang === "en";
  return (
    <header className="harmoni-room-header">
      <div className="harmoni-room-home">
        <img
          src={new URL("brand/smarti-logo.png", document.baseURI).href}
          alt=""
          width="25"
          height="25"
        />
        <span>{homeName}</span>
      </div>
      <div className="harmoni-room-heading">
        {back && (
          <button
            className="room-circle room-back"
            onClick={back}
            aria-label={en ? "All rooms" : "Alle rom"}
          >
            <ArrowLeft size={22} />
          </button>
        )}
        {art && (
          <div className="harmoni-room-thumbnail" aria-hidden="true">
            {art}
          </div>
        )}
        <div
          className="harmoni-room-title"
          data-selectable={!!selectRoom || undefined}
        >
          <h1>{title}</h1>
          {rooms && selectRoom && (
            <>
              <ChevronDown size={22} aria-hidden="true" />
              <select
                aria-label={en ? "Choose room" : "Velg rom"}
                value={selectedRoom}
                onChange={(e) => selectRoom(e.target.value)}
              >
                {rooms.map((room) => (
                  <option key={room.area_id} value={room.area_id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
      <div className="harmoni-room-actions">
        <button
          ref={searchButton}
          className="room-circle room-search-toggle"
          aria-label={en ? "Search rooms and devices" : "Søk i rom"}
          aria-expanded={searchOpen}
          aria-controls={searchId}
          onClick={toggleSearch}
        >
          <Search size={23} />
        </button>
        {manage && (
          <button
            className="room-circle"
            aria-label={en ? "Manage rooms" : "Administrer rom"}
            onClick={manage}
          >
            <Settings2 size={22} />
          </button>
        )}
      </div>
    </header>
  );
}
