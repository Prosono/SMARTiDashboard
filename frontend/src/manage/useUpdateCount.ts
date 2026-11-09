import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { updateCount, type AppUpdate, type Update } from "./updateModel";

/** Read-only checks; app inventory is never requested outside advanced admin mode. */
export function useUpdateCount(admin: boolean, advanced: boolean) {
  const updates = useQuery({
    queryKey: ["manage", "updates"],
    queryFn: () => api<Update[]>("manage/updates"),
    enabled: admin,
    retry: false,
    staleTime: 30000,
    refetchInterval: admin ? 60000 : false,
  });
  const self = useQuery({
    queryKey: ["manage", "self-update-status"],
    queryFn: () => api<AppUpdate>("manage/apps/self-update"),
    enabled: admin,
    retry: false,
    staleTime: 30000,
    refetchInterval: admin ? 60000 : false,
  });
  const apps = useQuery({
    queryKey: ["apps"],
    queryFn: () => api<AppUpdate[]>("manage/apps"),
    enabled: admin && advanced,
    retry: false,
    staleTime: 30000,
    refetchInterval: admin && advanced ? 60000 : false,
  });
  return admin
    ? updateCount(
        updates.isError ? [] : updates.data || [],
        self.isError ? undefined : self.data,
        advanced && !apps.isError ? apps.data || [] : [],
      )
    : 0;
}
