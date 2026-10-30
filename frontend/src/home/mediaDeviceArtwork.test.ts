import { describe, expect, it } from "vitest";
import type { Control } from "../types";
import { mediaArtworkKind } from "./mediaDeviceArtwork";

const player = (
  name: string,
  attributes: Record<string, unknown> = {},
  integration: string | null = null,
) =>
  ({
    name,
    entity_id: "media_player.example",
    attributes,
    integration,
    domain: "media_player",
  }) as Control;

describe("media device pictures", () => {
  it("identifies supported devices from names, classes and registry details", () => {
    expect(mediaArtworkKind(player("TV Stue", { device_class: "tv" }))).toBe(
      "tv",
    );
    expect(
      mediaArtworkKind(
        player("Soverom", { smarti_device_model: "Chromecast" }),
      ),
    ).toBe("streamer");
    expect(
      mediaArtworkKind(player("Bad", { smarti_device_manufacturer: "Sonos" })),
    ).toBe("sonos");
    expect(mediaArtworkKind(player("HomePod mini"))).toBe("mini");
    expect(mediaArtworkKind(player("SMARTi Voice Stue"))).toBe("mini");
    expect(mediaArtworkKind(player("Min iPhone"))).toBe("phone");
    expect(mediaArtworkKind(player("iPad"))).toBe("tablet");
    expect(mediaArtworkKind(player("Hjemmekino"))).toBe("home-cinema");
    expect(mediaArtworkKind(player("Sonos Beam"))).toBe("soundbar");
    expect(mediaArtworkKind(player("Apple TV"))).toBe("box");
    expect(mediaArtworkKind(player("Projektor"))).toBe("projector");
    expect(mediaArtworkKind(player("Sonos hvit"))).toBe("speaker-white");
    expect(mediaArtworkKind(player("AirPods"))).toBe("headphones");
    expect(mediaArtworkKind(player("Uknyttet spiller"))).toBeNull();
  });
  it("honors the user's chosen type, including types without a generated image", () => {
    expect(
      mediaArtworkKind(player("TV Stue", { smarti_icon: "homepod_mini" })),
    ).toBe("mini");
    expect(mediaArtworkKind(player("TV Stue", { smarti_icon: "phone" }))).toBe(
      "phone",
    );
    expect(
      mediaArtworkKind(player("TV Stue", { smarti_icon: "radio" })),
    ).toBeNull();
  });
});
