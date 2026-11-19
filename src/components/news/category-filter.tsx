import Link from "next/link";

export function CategoryFilter({
  active,
  categories,
}: {
  active: string;
  categories: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {["All", ...categories].map((category) => {
        const isActive =
          category === active || (category === "All" && active === "");
        const href =
          category === "All"
            ? "/news"
            : `/news?category=${encodeURIComponent(category)}`;

        return (
          <Link
            key={category}
            href={href}
            scroll={false}
            className={`rounded-full border px-5 py-2.5 font-sans text-[10px] uppercase tracking-[0.22em] transition-colors duration-300 ${
              isActive
                ? "border-transparent bg-fg text-surface"
                : "border-fg/15 text-fg/60 hover:border-fg hover:text-fg"
            }`}
          >
            {category}
          </Link>
        );
      })}
    </div>
  );
}
