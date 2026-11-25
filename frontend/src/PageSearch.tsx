import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PageSearchAction = {
  label: string;
  open: () => void;
  active?: boolean;
  controls?: string;
  expanded?: boolean;
  popup?: "dialog";
};

type RegisterPageSearch = (search: PageSearchAction) => () => void;

const PageSearchContext = createContext<RegisterPageSearch | null>(null);

export function PageSearchMain({
  register,
  children,
}: {
  register: RegisterPageSearch;
  children: ReactNode;
}) {
  return (
    <PageSearchContext.Provider value={register}>
      <main>{children}</main>
    </PageSearchContext.Provider>
  );
}

export function usePageSearchControl() {
  const [search, setSearch] = useState<PageSearchAction | null>(null);
  const register = useCallback<RegisterPageSearch>((action) => {
    setSearch(action);
    return () => setSearch((current) => (current === action ? null : current));
  }, []);
  return { search, register };
}

/** The current page can open its own search without changing routes. */
export function usePageSearch(search: PageSearchAction | null) {
  const register = useContext(PageSearchContext);
  const current = useRef(search);
  useLayoutEffect(() => {
    current.current = search;
  });
  const { label, controls, expanded, popup } = search ?? {};
  const active = !!search && search.active !== false;
  useLayoutEffect(() => {
    if (register && active && label) {
      return register({
        label,
        controls,
        expanded,
        popup,
        open: () => current.current?.open(),
      });
    }
  }, [register, active, label, controls, expanded, popup]);
}
