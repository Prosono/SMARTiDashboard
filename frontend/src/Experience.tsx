import { createContext, useContext, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import "./experience.css";
export type ExperienceMode = "simple" | "normal" | "advanced";
export const Experience = createContext<ExperienceMode>("advanced");
export const useExperience = () => useContext(Experience);
export function useExperiencePreference(enabled: boolean) {
  return useQuery({
    queryKey: ["experience"],
    queryFn: () => api<{ mode: ExperienceMode }>("home/experience"),
    enabled,
  });
}
export function ExperiencePicker({ lang }: { lang: string }) {
  const mode = useExperience();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const en = lang === "en";
  const options: { id: ExperienceMode; title: string; text: string }[] = [
    {
      id: "simple",
      title: en ? "Simple" : "Enkel",
      text: en
        ? "Large controls. One room at a time. Just everyday essentials."
        : "Store knapper. Ett rom om gangen. Det du trenger i hverdagen.",
    },
    {
      id: "normal",
      title: en ? "Normal" : "Normal",
      text: en
        ? "Your home at a glance, with more options when you need them."
        : "God oversikt over hjemmet, med flere valg når du trenger dem.",
    },
    {
      id: "advanced",
      title: en ? "Advanced" : "Avansert",
      text: en
        ? "All views, technical details and administration tools."
        : "Alle visninger, tekniske detaljer og administrasjonsverktøy.",
    },
  ];
  async function choose(next: ExperienceMode) {
    setBusy(true);
    setError("");
    try {
      const value = await api<{ mode: ExperienceMode }>(
        "home/experience",
        "PUT",
        { mode: next },
      );
      qc.setQueryData(["experience"], value);
    } catch {
      setError(
        en
          ? "Could not save. Please try again."
          : "Kunne ikke lagre. Prøv igjen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="experience-picker"
      aria-label={en ? "Experience level" : "Visningsnivå"}
    >
      <h2>{en ? "SMARTi, your way" : "SMARTi, på din måte"}</h2>
      <p>
        {en
          ? "Choose how much you want to see. Your permissions stay the same. You can switch back at any time."
          : "Velg hvor mye du vil se. Tilgangene dine er de samme. Du kan alltid bytte tilbake."}
      </p>
      <div>
        {options.map((o) => (
          <button
            key={o.id}
            disabled={busy}
            aria-pressed={mode === o.id}
            onClick={() => void choose(o.id)}
          >
            <strong>
              {o.title}
              {mode === o.id ? " ✓" : ""}
            </strong>
            <span>{o.text}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
