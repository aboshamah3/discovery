"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, List, Search as SearchIcon, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProductCardGrid } from "@/components/store/product-card-grid";
import { ProductCardList } from "@/components/store/product-card-list";
import { QuickViewDialog } from "@/components/store/quick-view-dialog";
import {
  fetchSearch,
  SORT_OPTIONS,
  DEFAULT_SORT,
  type ProductCardDto,
  type SortValue,
} from "@/lib/search-client";

type ViewMode = "card" | "list";
type Status = "loading" | "loadingMore" | "ready" | "error";

const DEBOUNCE_MS = 250;

/**
 * Product discovery surface (Spec 007) — the adopted Metronic `SearchResults`
 * behaviour, wired to the live /api/search contract: debounced as-you-type
 * search, API-backed sort, grid/list toggle, and infinite scroll. Cart, filter
 * sheet, and period toggle are intentionally absent (out of scope).
 */
export function SearchResults() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<SortValue>(DEFAULT_SORT);
  const [mode, setMode] = useState<ViewMode>("card");

  const [items, setItems] = useState<ProductCardDto[]>([]);
  const [found, setFound] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [quickViewId, setQuickViewId] = useState<string | null>(null);

  // Monotonic generation guard: stale responses from a superseded query/sort
  // are dropped even if their request wasn't aborted in time.
  const genRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounce the raw input into the value that actually drives fetches.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Fresh search whenever the debounced query or sort changes (resets to page 1).
  useEffect(() => {
    const gen = ++genRef.current;
    const controller = new AbortController();
    setStatus("loading");
    fetchSearch({ q: debounced, page: 1, sort, signal: controller.signal })
      .then((res) => {
        if (gen !== genRef.current) return;
        setItems(res.results);
        setFound(res.found);
        setPage(res.page);
        setHasMore(res.hasMore);
        setStatus("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted || gen !== genRef.current) return;
        console.error("search failed", err);
        setStatus("error");
      });
    return () => controller.abort();
  }, [debounced, sort]);

  // Append the next page for infinite scroll.
  const loadMore = useCallback(() => {
    if (status !== "ready" || !hasMore) return;
    const gen = genRef.current;
    const controller = new AbortController();
    const next = page + 1;
    setStatus("loadingMore");
    fetchSearch({ q: debounced, page: next, sort, signal: controller.signal })
      .then((res) => {
        if (gen !== genRef.current) return;
        setItems((prev) => [...prev, ...res.results]);
        setPage(res.page);
        setHasMore(res.hasMore);
        setStatus("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted || gen !== genRef.current) return;
        console.error("load more failed", err);
        setStatus("error");
      });
  }, [status, hasMore, page, debounced, sort]);

  // Observe the sentinel; fire loadMore as it scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const isInitialLoading = status === "loading";
  const isEmpty = status === "ready" && items.length === 0;

  return (
    <div className="flex flex-col items-stretch gap-7">
      {/* Search bar */}
      <div className="relative flex items-center w-full">
        <label htmlFor="search-input" className="sr-only">
          Search products
        </label>
        <SearchIcon
          className="absolute start-4 text-muted-foreground"
          size={16}
          aria-hidden
        />
        <Input
          id="search-input"
          type="search"
          value={query}
          placeholder="Search products…"
          aria-label="Search products"
          onChange={(e) => setQuery(e.target.value)}
          className="ps-9 pe-4 w-full h-11"
          autoComplete="off"
        />
      </div>

      {/* Result summary + controls. On mobile the controls sit on top and the
          result count below (flex-col-reverse); desktop keeps count-left /
          controls-right. */}
      <div className="flex flex-col-reverse items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h3 className="text-sm text-mono font-medium" aria-live="polite">
          {isInitialLoading ? (
            "Searching…"
          ) : found > 0 ? (
            <>
              1 – {items.length} of {found.toLocaleString()} results
              {debounced && (
                <>
                  {" "}
                  for <span className="text-primary">{debounced}</span>
                </>
              )}
            </>
          ) : (
            "No results"
          )}
        </h3>

        <div className="flex items-center gap-2.5">
          <Select value={sort} onValueChange={(v) => setSort(v as SortValue)}>
            <SelectTrigger className="w-[180px]" aria-label="Sort results">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(v) => {
              if (v === "card" || v === "list") setMode(v);
            }}
          >
            <ToggleGroupItem value="card" aria-label="Grid view">
              <LayoutGrid size={16} />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List size={16} />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Results */}
      <div
        role="region"
        aria-label="Search results"
        aria-busy={isInitialLoading || status === "loadingMore"}
      >
      {status === "error" && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <p className="text-sm text-destructive">Something went wrong.</p>
          <p className="text-sm text-secondary-foreground">
            Please adjust your search and try again.
          </p>
        </div>
      ) : isInitialLoading ? (
        <SkeletonGrid mode={mode} />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <SearchX className="text-muted-foreground" size={32} />
          <p className="text-sm text-mono font-medium">No products found</p>
          <p className="text-sm text-secondary-foreground">
            Try a different search term.
          </p>
        </div>
      ) : (
        <>
          <div
            className={
              mode === "card"
                ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5"
                : "grid grid-cols-1 gap-4"
            }
          >
            {items.map((product) =>
              mode === "card" ? (
                <ProductCardGrid
                  key={product.id}
                  product={product}
                  onOpen={setQuickViewId}
                />
              ) : (
                <ProductCardList
                  key={product.id}
                  product={product}
                  onOpen={setQuickViewId}
                />
              ),
            )}
          </div>

          {status === "loadingMore" && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Loading more…
            </p>
          )}

          {/* Infinite-scroll sentinel */}
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}
        </>
      )}
      </div>

      <QuickViewDialog
        productId={quickViewId}
        onClose={() => setQuickViewId(null)}
      />
    </div>
  );
}

function SkeletonGrid({ mode }: { mode: ViewMode }) {
  const count = mode === "card" ? 8 : 6;
  return (
    <div
      className={
        mode === "card"
          ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5"
          : "grid grid-cols-1 gap-4"
      }
    >
      {Array.from({ length: count }).map((_, i) =>
        mode === "card" ? (
          <div key={i} className="flex flex-col gap-3 border border-border rounded-lg p-2.5">
            <Skeleton className="h-[180px] w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex justify-between">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-4 w-14" />
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-center gap-3.5 border border-border rounded-lg p-2">
            <Skeleton className="h-[70px] w-[90px] rounded-lg shrink-0" />
            <div className="flex flex-col gap-2 grow">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
        ),
      )}
    </div>
  );
}
