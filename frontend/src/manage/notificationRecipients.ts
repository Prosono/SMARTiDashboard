import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export const notificationActionPrefix = "notify.mobile_app_";

type Recipient = { action: string; name: string; phone: string };

export function notificationRecipientLabel(
  action: string,
  lang: string,
  labels?: ReadonlyMap<string, string>,
) {
  if (action === notificationActionPrefix)
    return lang === "en" ? "Choose phone" : "Velg telefon";
  return (
    labels?.get(action) ??
    (lang === "en" ? "Phone unavailable" : "Telefon utilgjengelig")
  );
}

export function useNotificationRecipients(lang: string, enabled = true) {
  const query = useQuery({
    queryKey: ["notification-recipients"],
    queryFn: ({ signal }) =>
      api<Recipient[]>(
        "manage/notification-recipients",
        "GET",
        undefined,
        signal,
      ),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
  const labels = useMemo(() => {
    const fallback = lang === "en" ? "Phone" : "Telefon";
    const rows = (query.data ?? []).map(({ action, phone, name }) => {
      const device = phone?.trim() || fallback;
      const owner = name?.trim();
      return { action, device, owner };
    });
    const deviceCounts = new Map<string, number>();
    for (const { device } of rows) {
      const key = device.toLowerCase();
      deviceCounts.set(key, (deviceCounts.get(key) ?? 0) + 1);
    }
    const choices = rows.map(({ action, device, owner }) => {
      const key = device.toLowerCase();
      const showOwner =
        (deviceCounts.get(key) ?? 0) > 1 ||
        /^(iphone|ipad|android|phone|telefon)$/i.test(device);
      const label =
        showOwner && owner && owner.toLowerCase() !== key
          ? `${device} · ${owner}`
          : device;
      return { action, label };
    });
    const totals = new Map<string, number>();
    for (const { label } of choices) {
      const key = label.toLowerCase();
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    const indices = new Map<string, number>();
    return new Map(
      choices.map(({ action, label }) => {
        const key = label.toLowerCase();
        const index = (indices.get(key) ?? 0) + 1;
        indices.set(key, index);
        return [
          action,
          (totals.get(key) ?? 0) > 1 ? `${label} (${index})` : label,
        ];
      }),
    );
  }, [lang, query.data]);
  const status = query.isError
    ? "error"
    : query.isPending
      ? "loading"
      : "ready";
  return {
    labels,
    status,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
