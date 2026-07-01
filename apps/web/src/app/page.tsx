import { SearchResults } from "@/components/store/search-results";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8">
      <SearchResults />
    </main>
  );
}
