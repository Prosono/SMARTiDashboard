import {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { Search, Settings } from "lucide-react";

type Editor = {
  id: string;
  ready: boolean;
  editing: boolean;
  busy: boolean;
  begin: () => void;
};
type SearchToolbar = { id: string; expanded: boolean; toggle: () => void };
type Tools = {
  setEditor: Dispatch<SetStateAction<Editor | null>>;
  setSearch: Dispatch<SetStateAction<SearchToolbar | null>>;
  editButton: RefObject<HTMLButtonElement | null>;
  searchButton: RefObject<HTMLButtonElement | null>;
  configureHome?: Dispatch<SetStateAction<boolean>>;
};

/** A Home page registers its own controls; reusable Devices views remain independent. */
export const HomePageTools = createContext<Tools | null>(null);

export function useHomePageTools(configureHome?: Tools["configureHome"]) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState<SearchToolbar | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const context = useMemo(
    () => ({ setEditor, setSearch, editButton, searchButton, configureHome }),
    [configureHome],
  );
  return { context, editor, search };
}

export function HomePageToolButtons({
  tools,
  lang,
  fallback,
}: {
  tools: ReturnType<typeof useHomePageTools>;
  lang: string;
  fallback?: () => void;
}) {
  const { editor, search, context } = tools;
  const returnFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || (returnFocus.current && returnFocus.current !== editor.id))
      returnFocus.current = null;
    if (editor?.editing) returnFocus.current = editor.id;
    else if (returnFocus.current && editor?.ready && !editor.busy) {
      context.editButton.current?.focus();
      returnFocus.current = null;
    }
  }, [editor, context]);
  const en = lang === "en";
  const searchLabel = en
    ? search?.expanded
      ? "Hide search and filters"
      : "Show search and filters"
    : search?.expanded
      ? "Skjul søk og filtre"
      : "Vis søk og filtre";
  const editLabel = editor
    ? en
      ? "Edit layout"
      : "Rediger oppsett"
    : en
      ? "Personalize Home"
      : "Tilpass Hjem";
  return (
    <>
      {search && (
        <button
          className="home-toolbar-tool home-search-tool"
          ref={context.searchButton}
          aria-label={searchLabel}
          title={searchLabel}
          aria-expanded={search.expanded}
          aria-controls={search.id}
          onClick={search.toggle}
        >
          <Search size={20} aria-hidden="true" />
        </button>
      )}
      {(editor || fallback) && (
        <button
          className="home-toolbar-tool home-customize home-customize-icon"
          ref={context.editButton}
          aria-label={editLabel}
          title={editLabel}
          aria-pressed={editor ? editor.editing : undefined}
          aria-controls={editor?.id}
          disabled={editor ? !editor.ready || editor.busy : false}
          onClick={() =>
            editor ? !editor.editing && editor.begin() : fallback?.()
          }
        >
          <Settings size={20} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
