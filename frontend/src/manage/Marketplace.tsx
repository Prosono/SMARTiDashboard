import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, Plug, Search } from "lucide-react";
import { api, ApiError } from "../api";
import { IntegrationLogo } from "./IntegrationLogo";
import { LoadError, words } from "./shared";
import "./marketplace.css";

type Repository = {
  full_name: string;
  name: string;
  description: string | null;
  domain: string | null;
  authors: string[] | null;
  topics: string[] | null;
  installed: boolean;
  installed_version: string | null;
  stars: number | null;
};

const pageSize = 36;
const searchText = (value: string) => value.normalize("NFKC").toLowerCase();

export function Marketplace({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(pageSize);
  const catalog = useQuery({
    queryKey: ["manage", "marketplace"],
    queryFn: ({ signal }) =>
      api<Repository[]>("manage/marketplace", "GET", undefined, signal),
    staleTime: 60_000,
    retry: false,
  });
  const entries = useMemo(
    () =>
      [...(catalog.data ?? [])]
        .sort(
          (a, b) =>
            (b.stars ?? 0) - (a.stars ?? 0) ||
            a.name.localeCompare(b.name, lang),
        )
        .map((repository) => ({
          repository,
          search: searchText(
            [
              repository.name,
              repository.full_name,
              repository.description,
              repository.domain,
              ...(repository.authors ?? []),
              ...(repository.topics ?? []),
            ].join(" "),
          ),
        })),
    [catalog.data, lang],
  );
  const terms = searchText(search).trim().split(/\s+/).filter(Boolean);
  const matches = entries.filter((entry) =>
    terms.every((term) => entry.search.includes(term)),
  );
  const unavailable =
    catalog.error instanceof ApiError && catalog.error.status === 404;

  return (
    <section className="marketplace">
      <label className="marketplace-search">
        <Search size={21} aria-hidden="true" />
        <input
          type="search"
          aria-label={t("Søk i markedsplassen", "Search the marketplace")}
          placeholder={t(
            "Søk etter navn, merke eller tjeneste …",
            "Search by name, brand or service …",
          )}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(pageSize);
          }}
        />
      </label>
      {catalog.isPending && (
        <p role="status">
          {t("Henter integrasjoner …", "Loading integrations …")}
        </p>
      )}
      {unavailable ? (
        <div className="quiet-notice" role="status">
          <p>
            {t(
              "Markedsplassen krever Home Assistant 2026.11 eller nyere, og at Markedsplass er aktivert på hjemmesentralen.",
              "Marketplace requires Home Assistant 2026.11 or later with Marketplace enabled on your controller.",
            )}
          </p>
          <button onClick={() => void catalog.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </div>
      ) : catalog.isError ? (
        <LoadError lang={lang} retry={() => void catalog.refetch()} />
      ) : (
        catalog.isSuccess && (
          <>
            <p className="marketplace-count" role="status">
              {matches.length === 1
                ? t("1 integrasjon", "1 integration")
                : t(
                    `${matches.length} integrasjoner`,
                    `${matches.length} integrations`,
                  )}
            </p>
            {matches.length ? (
              <ul className="marketplace-list">
                {matches.slice(0, limit).map(({ repository }) => (
                  <li key={repository.full_name}>
                    <a
                      href={`https://github.com/${repository.full_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t(
                        `${repository.name} på GitHub`,
                        `${repository.name} on GitHub`,
                      )}
                    >
                      <span className="marketplace-icon" aria-hidden="true">
                        {repository.domain ? (
                          <IntegrationLogo domain={repository.domain} />
                        ) : (
                          <Plug size={22} />
                        )}
                      </span>
                      <div className="marketplace-summary">
                        <h3>{repository.name}</h3>
                        <p>{repository.full_name}</p>
                        {repository.description && (
                          <p className="marketplace-description">
                            {repository.description}
                          </p>
                        )}
                        {repository.installed && (
                          <span className="marketplace-installed">
                            <Check size={14} aria-hidden="true" />
                            {t("Installert", "Installed")}
                            {repository.installed_version
                              ? ` · ${repository.installed_version}`
                              : ""}
                          </span>
                        )}
                      </div>
                      <ArrowUpRight
                        size={18}
                        className="marketplace-link"
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="quiet-notice">
                <p>
                  {terms.length
                    ? t(
                        "Ingen treff. Prøv et annet navn eller søkeord.",
                        "No matches. Try another name or search term.",
                      )
                    : t(
                        "Katalogen har ingen integrasjoner ennå. Prøv å hente den på nytt.",
                        "The catalog has no integrations yet. Try reloading it.",
                      )}
                </p>
                {!terms.length && (
                  <button onClick={() => void catalog.refetch()}>
                    {t("Hent på nytt", "Reload")}
                  </button>
                )}
              </div>
            )}
            {matches.length > limit && (
              <button
                className="marketplace-more"
                onClick={() => setLimit((value) => value + pageSize)}
              >
                {t("Vis flere integrasjoner", "Show more integrations")}
              </button>
            )}
          </>
        )
      )}
    </section>
  );
}
