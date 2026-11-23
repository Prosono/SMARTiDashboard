import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import {
  updateCounts,
  type AppOperation,
  type AppUpdate,
  type Update,
  type UpdateCounts,
} from "./updateModel";

/** Read-only checks; app inventory is never requested outside advanced admin mode. */
export function useUpdateCounts(admin: boolean, advanced: boolean): UpdateCounts {
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
  // The Apps view already fetches activity. Subscribe without starting a poll.
  const operations = useQuery<AppOperation[]>({
    queryKey: ["app-operations"],
    enabled: false,
  });
  return admin
    ? updateCounts(
        updates.isError ? [] : updates.data || [],
        self.isError ? undefined : self.data,
        advanced && !apps.isError ? apps.data || [] : [],
        operations.isError ? [] : operations.data,
      )
    : { smarti: 0, extensions: 0, apps: 0 };
}
