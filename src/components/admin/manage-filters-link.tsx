import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

/**
 * Small toolbar shortcut that jumps into Admin → Filters & Categories with
 * the matching tab pre-selected — every content manager that has a public
 * filter system links to its own management options here.
 */
export function ManageFiltersLink({ tab }: { tab: string }) {
  return (
    <Link
      href={`/admin/filters?tab=${tab}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-3 text-[10.5px] font-medium text-white/45 transition-colors hover:border-[#ffd444] hover:text-[#ffd444]"
    >
      <SlidersHorizontal size={12} /> Manage filters
    </Link>
  );
}
