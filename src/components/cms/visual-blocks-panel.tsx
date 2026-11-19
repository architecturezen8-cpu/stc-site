"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Check,
  Eye,
  EyeOff,
  LayoutTemplate,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";

type BlockFieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "image" | "url" | "color";
};

type BlockDefLite = {
  type: string;
  label: string;
  description: string;
  category: string;
  fields: BlockFieldDef[];
};

type BlockRow = {
  id: number;
  blockType: string;
  draftData: Record<string, string>;
  publishedData: Record<string, string>;
  draftHidden: boolean;
  position: string;
  sortOrder: number;
};

type BlockPosition = "top" | "bottom";

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

const POSITION_LABEL: Record<BlockPosition, string> = {
  top: "Top of page",
  bottom: "Bottom of page",
};

/** Framer-style component library + page block manager for the visual editor. */
export function VisualBlocksPanel({
  pathname,
  notify,
  onPendingBlocks,
  refreshSignal = 0,
}: {
  pathname: string;
  notify: (message: string) => void;
  /** v2.8.98.0 — reports the dirty-block count so the editor's Publish
      button (and its badge) covers block drafts, not just element patches. */
  onPendingBlocks?: (count: number) => void;
  /** Bumped by the editor after Publish — makes the panel reload its list. */
  refreshSignal?: number;
}) {
  const router = useRouter();
  const [defs, setDefs] = useState<BlockDefLite[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  /* v2.8.98.0 — the owner chooses WHERE a new block lands: right under the
     navbar or above the footer (default: bottom, the classic behaviour). */
  const [addPosition, setAddPosition] = useState<BlockPosition>("bottom");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/admin/visual-blocks?path=${encodeURIComponent(pathname)}`,
      { cache: "no-store" },
    );
    const json = await res.json();
    if (res.ok) {
      setBlocks(json.blocks ?? []);
      setDefs(json.definitions ?? []);
      onPendingBlocks?.(
        (json.blocks ?? []).filter(
          (block: BlockRow) =>
            JSON.stringify(block.draftData ?? {}) !==
            JSON.stringify(block.publishedData ?? {}),
        ).length,
      );
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    /* Initial/pathname load: every state change lands in the fetch
       continuation — the effect body never sets state synchronously.
       (Event handlers may keep calling `load`, whose sync spinner is fine
       there.) */
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/admin/visual-blocks?path=${encodeURIComponent(pathname)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (cancelled) return;
      if (res.ok) {
        setBlocks(json.blocks ?? []);
        setDefs(json.definitions ?? []);
        onPendingBlocks?.(
          (json.blocks ?? []).filter(
            (block: BlockRow) =>
              JSON.stringify(block.draftData ?? {}) !==
              JSON.stringify(block.publishedData ?? {}),
          ).length,
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* v2.8.98.0 — the editor bumps refreshSignal after Publish (blocks are
     promoted server-side); reload so the Live/Draft badges tell the truth. */
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    void load();
  }, [refreshSignal, load]);

  const defOf = (type: string) => defs.find((def) => def.type === type);
  const isDirty = (block: BlockRow) =>
    JSON.stringify(block.draftData ?? {}) !== JSON.stringify(block.publishedData ?? {});

  const addBlock = async (type: string) => {
    setBusy(`add-${type}`);
    const res = await fetch("/api/admin/visual-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagePath: pathname, blockType: type, position: addPosition }),
    });
    const json = await res.json();
    if (res.ok) {
      await load();
      setEditingId(json.block.id);
      setDraft(json.block.draftData ?? {});
      // Draft blocks render on the page (draft-aware pages) — refresh the
      // RSC so the new block appears immediately, no manual reload.
      router.refresh();
      notify(
        `Block added to ${POSITION_LABEL[addPosition].toLowerCase()} — edit it below, then Publish to go live`,
      );
    } else notify(json.error || "Unable to add block");
    setBusy(null);
  };

  const saveBlock = async () => {
    if (!editingId) return;
    setBusy(`save-${editingId}`);
    const res = await fetch("/api/admin/visual-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, data: draft }),
    });
    const json = await res.json();
    if (res.ok) {
      await load();
      setEditingId(null);
      notify("Block draft saved — press Publish to make it live");
      router.refresh();
    } else notify(json.error || "Unable to save block");
    setBusy(null);
  };

  const toggleHidden = async (block: BlockRow) => {
    setBusy(`hide-${block.id}`);
    await fetch("/api/admin/visual-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: block.id, hidden: !block.draftHidden }),
    });
    await load();
    router.refresh();
    notify(block.draftHidden ? "Block restored" : "Block will hide on publish");
    setBusy(null);
  };

  /* v2.8.98.0 — move a block between the two page positions (takes effect
     immediately; only content + visibility are drafted). */
  const movePosition = async (block: BlockRow, position: BlockPosition) => {
    if ((block.position ?? "bottom") === position) return;
    setBusy(`pos-${block.id}`);
    await fetch("/api/admin/visual-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: block.id, position }),
    });
    await load();
    router.refresh();
    notify(`Block moved to ${POSITION_LABEL[position].toLowerCase()}`);
    setBusy(null);
  };

  const moveBlock = async (
    group: BlockPosition,
    index: number,
    direction: -1 | 1,
  ) => {
    const list = blocks.filter((block) => (block.position ?? "bottom") === group);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    // Optimistic reorder inside the group.
    const orderById = new Map(next.map((block, i) => [block.id, (i + 1) * 10]));
    setBlocks((current) =>
      current.map((block) =>
        orderById.has(block.id)
          ? { ...block, sortOrder: orderById.get(block.id) as number }
          : block,
      ),
    );
    await Promise.all(
      next.map((block, i) =>
        fetch("/api/admin/visual-blocks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: block.id, sortOrder: (i + 1) * 10 }),
        }),
      ),
    );
    notify("Block order saved");
  };

  const removeBlock = async (block: BlockRow) => {
    if (!window.confirm("Delete this block from the page?")) return;
    setBusy(`del-${block.id}`);
    await fetch("/api/admin/visual-blocks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: block.id }),
    });
    await load();
    router.refresh();
    notify("Block deleted");
    setBusy(null);
  };

  const categories = Array.from(new Set(defs.map((def) => def.category)));
  const topBlocks = blocks.filter((block) => (block.position ?? "bottom") === "top");
  const bottomBlocks = blocks.filter((block) => (block.position ?? "bottom") === "bottom");

  const renderGroup = (group: BlockPosition, list: BlockRow[]) => (
    <div className="mb-4">
      <p className="mb-2 px-1 text-[8.5px] uppercase tracking-[0.2em] text-white/30">
        {POSITION_LABEL[group]} · {list.length}
      </p>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[10px] leading-relaxed text-white/25">
          No blocks here yet — set the landing spot above and add one.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((block, index) => {
            const def = defOf(block.blockType);
            const editing = editingId === block.id;
            const blockPosition: BlockPosition =
              (block.position ?? "bottom") === "top" ? "top" : "bottom";
            return (
              <div
                key={block.id}
                className={`rounded-xl border p-3 ${
                  block.draftHidden ? "border-amber-400/30" : "border-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold">
                      {def?.label ?? block.blockType}
                      {block.draftHidden && (
                        <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.1em] text-amber-300">
                          Hidden
                        </span>
                      )}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[7.5px] font-bold uppercase tracking-[0.1em] ${
                      isDirty(block)
                        ? "bg-amber-400/15 text-amber-300"
                        : "bg-emerald-400/15 text-emerald-300"
                    }`}
                  >
                    {isDirty(block) ? "Draft" : "Live"}
                  </span>
                  <button
                    onClick={() => void moveBlock(group, index, -1)}
                    disabled={index === 0}
                    className="grid h-7 w-7 place-items-center rounded-lg text-white/35 hover:bg-white/10 hover:text-white disabled:opacity-20"
                    aria-label="Move up"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    onClick={() => void moveBlock(group, index, 1)}
                    disabled={index === list.length - 1}
                    className="grid h-7 w-7 place-items-center rounded-lg text-white/35 hover:bg-white/10 hover:text-white disabled:opacity-20"
                    aria-label="Move down"
                  >
                    <ArrowDown size={11} />
                  </button>
                  <button
                    onClick={() => void toggleHidden(block)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-white/35 hover:bg-white/10 hover:text-white"
                    aria-label={block.draftHidden ? "Restore" : "Hide"}
                  >
                    {block.draftHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(editing ? null : block.id);
                      setDraft(block.draftData ?? {});
                    }}
                    className={`rounded-lg px-2.5 py-1.5 text-[9px] font-semibold ${
                      editing ? "bg-[#ffd444] text-[#0b0b0a]" : "bg-white/10 text-white/60 hover:text-white"
                    }`}
                  >
                    {editing ? "Done" : "Edit"}
                  </button>
                  <button
                    onClick={() => void removeBlock(block)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-white/30 hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Delete block"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => void movePosition(block, blockPosition === "top" ? "bottom" : "top")}
                    disabled={busy === `pos-${block.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[8.5px] font-medium text-white/45 transition-colors hover:border-[#ffd444]/45 hover:text-[#ffd444] disabled:opacity-40"
                    title={
                      blockPosition === "top"
                        ? "Move this block to the bottom of the page"
                        : "Move this block to the top of the page"
                    }
                  >
                    {blockPosition === "top" ? (
                      <ArrowDownToLine size={10} />
                    ) : (
                      <ArrowUpToLine size={10} />
                    )}
                    {blockPosition === "top"
                      ? "Move to bottom"
                      : "Move to top"}
                  </button>
                </div>

                {editing && def && (
                  <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                    {def.fields.map((field) => (
                      <div key={field.key}>
                        <span className="mb-1.5 flex items-center justify-between text-[8.5px] uppercase tracking-[0.16em] text-white/35">
                          {field.label}
                          {field.type === "image" && (
                            <MediaLibraryButton
                              preferFolder="site-assets"
                              onSelect={(picked) =>
                                setDraft((data) => ({ ...data, [field.key]: picked.url }))
                              }
                            />
                          )}
                        </span>
                        {field.type === "textarea" ? (
                          <textarea
                            rows={3}
                            value={draft[field.key] ?? ""}
                            onChange={(e) =>
                              setDraft((data) => ({ ...data, [field.key]: e.target.value }))
                            }
                            className={`${input} resize-y py-2.5 text-[12px] leading-relaxed`}
                          />
                        ) : (
                          <input
                            value={draft[field.key] ?? ""}
                            onChange={(e) =>
                              setDraft((data) => ({ ...data, [field.key]: e.target.value }))
                            }
                            className={`${input} h-10 text-[12px]`}
                          />
                        )}
                        {field.type === "image" && draft[field.key] && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={draft[field.key]}
                            alt=""
                            className="mt-2 aspect-video w-full rounded-lg border border-white/10 object-cover"
                          />
                        )}
                      </div>
                    ))}
                    <button
                      onClick={saveBlock}
                      disabled={busy === `save-${block.id}`}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#ffd444] text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
                    >
                      {busy === `save-${block.id}` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      Save block draft
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-5">
      {/* Add new components */}
      <p className="mb-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-[#ffd444]">
        <Plus size={11} /> Add a component
      </p>

      {/* v2.8.98.0 — landing-spot chooser for the next added block. */}
      <div className="mb-4 rounded-xl border border-white/10 p-3">
        <p className="mb-2 text-[8.5px] uppercase tracking-[0.18em] text-white/35">
          Where should it appear?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["top", "bottom"] as BlockPosition[]).map((spot) => (
            <button
              key={spot}
              onClick={() => setAddPosition(spot)}
              className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition-colors ${
                addPosition === spot
                  ? "bg-[#ffd444] text-[#0b0b0a]"
                  : "border border-white/10 text-white/50 hover:text-white"
              }`}
            >
              {spot === "top" ? "Top of page" : "Bottom of page"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-white/30">
          {addPosition === "top"
            ? "Inserts right under the menu, above the page content."
            : "Inserts above the footer, after the page content."}
        </p>
      </div>

      {categories.map((category) => (
        <div key={category} className="mb-5">
          <p className="mb-2 px-1 text-[8.5px] uppercase tracking-[0.2em] text-white/30">
            {category}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {defs
              .filter((def) => def.category === category)
              .map((def) => (
                <button
                  key={def.type}
                  onClick={() => void addBlock(def.type)}
                  disabled={busy === `add-${def.type}`}
                  className="rounded-xl border border-white/10 p-3 text-left transition-colors hover:border-[#ffd444]/55 hover:bg-[#ffd444]/5 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2 text-[11px] font-semibold">
                    {busy === `add-${def.type}` ? (
                      <Loader2 size={12} className="animate-spin text-[#ffd444]" />
                    ) : (
                      <LayoutTemplate size={12} className="text-[#ffd444]" />
                    )}
                    {def.label}
                  </span>
                  <span className="mt-1 block text-[9.5px] leading-snug text-white/35">
                    {def.description}
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}

      {/* Existing blocks */}
      <p className="mb-3 mt-8 text-[9px] uppercase tracking-[0.2em] text-[#ffd444]">
        Blocks on this page · {blocks.length}
      </p>
      {loading ? (
        <div className="grid h-24 place-items-center">
          <Loader2 size={16} className="animate-spin text-white/40" />
        </div>
      ) : blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 py-10 text-center text-[11px] leading-relaxed text-white/35">
          No blocks yet. Pick a spot above, add your first section —
          <br />
          it appears on the page straight away in the editor.
        </div>
      ) : (
        <>
          {renderGroup("top", topBlocks)}
          {renderGroup("bottom", bottomBlocks)}
        </>
      )}
    </div>
  );
}
