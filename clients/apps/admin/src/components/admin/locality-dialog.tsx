import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aarogyaruchi/ui/components/dialog";

import { adminApi, type LocalityRow } from "../../lib/admin";
import { ApiError } from "../../lib/api";
import { findConflict, type Ring } from "../../lib/geometry";
import PerimeterMap from "./perimeter-map";

/**
 * Create/edit modal for a locality: name + city + map-drawn perimeter zones.
 * Overlap with another active locality is flagged live (red) and also
 * enforced by the server with a 409 on save.
 */

type LocalityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "new" creates; otherwise the LocalityRow being edited. */
  target: "new" | LocalityRow;
  localities: LocalityRow[];
};

export function LocalityDialog({
  open,
  onOpenChange,
  target,
  localities,
}: LocalityDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = target !== "new";

  const [name, setName] = useState(target === "new" ? "" : target.name);
  const [city, setCity] = useState(target === "new" ? "" : target.city);
  const [rings, setRings] = useState<Ring[]>(
    target === "new" ? [] : target.perimeters
  );
  const [draft, setDraft] = useState<Ring>([]);
  const [error, setError] = useState("");

  const others = useMemo(
    () => localities.filter((l) => (isEdit ? l.id !== target.id : true)),
    [localities, isEdit, target]
  );

  // Rings that are closed plus the in-progress ring once it could overlap.
  const checkRings = useMemo(
    () => (draft.length >= 3 ? [...rings, draft] : rings),
    [rings, draft]
  );
  const conflict = useMemo(
    () => findConflict(checkRings, others),
    [checkRings, others]
  );

  const addDot = (lat: number, lng: number) => {
    setError("");
    setDraft((d) => [...d, [lat, lng]]);
  };
  const undoDot = () => setDraft((d) => d.slice(0, -1));
  const finishZone = () => {
    if (draft.length < 3) return;
    setRings((r) => [...r, draft]);
    setDraft([]);
  };
  const deleteZone = (i: number) =>
    setRings((r) => r.filter((_, idx) => idx !== i));

  const save = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return adminApi.updateLocality(target.id, {
          name: name.trim(),
          city: city.trim() || undefined,
          is_active: target.is_active,
          perimeters: rings,
        });
      }
      return adminApi.createLocality({
        name: name.trim(),
        city: city.trim() || undefined,
        perimeters: rings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-localities"] });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "Failed to save locality"
      );
    },
  });

  const canSave = name.trim().length > 0 && !conflict && !save.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (save.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${target.name}` : "Add locality"}
          </DialogTitle>
          <DialogDescription>
            Draw the delivery zone on the map: click to drop dots around the
            area, then close the zone. Zones must not overlap another active
            locality.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <label className="text-xs">
                <span className="mb-1 block text-neutral-500">Name *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Bachupally"
                  aria-label="Locality name"
                  className="w-44 border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-neutral-500">City</span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Hyderabad"
                  aria-label="Locality city"
                  className="w-36 border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="relative border border-neutral-200">
              <PerimeterMap
                others={others}
                rings={rings}
                draft={draft}
                hasConflict={conflict !== null}
                onAddDot={addDot}
                onFinish={finishZone}
              />
              {conflict && (
                <p className="absolute inset-x-0 bottom-0 z-[500] bg-red-600/90 px-3 py-1.5 text-center text-xs text-white">
                  Overlaps active locality “{conflict}” — move the dots apart.
                  Touching edges is fine.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="border border-neutral-200 bg-neutral-50 p-3">
              <p className="mb-2 text-xs font-medium text-neutral-700">
                Drawing zone {rings.length + 1}
                <span className="ml-1 font-normal text-neutral-400">
                  ({draft.length} dots)
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={undoDot}
                  disabled={draft.length === 0}
                  className="border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40"
                >
                  Undo dot
                </button>
                <button
                  type="button"
                  onClick={finishZone}
                  disabled={draft.length < 3}
                  className="bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-40"
                >
                  Finish zone
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-neutral-400">
                Tip: click the green first dot to close a zone. Scroll to zoom.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-700">
                Zones
              </p>
              {rings.length === 0 ? (
                <p className="text-xs text-neutral-400">
                  None yet. A locality without zones can’t auto-assign
                  customers.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-100 border border-neutral-200 bg-white text-xs">
                  {rings.map((ring, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <span>
                        Zone {i + 1} · {ring.length} points
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteZone(i)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!canSave}
            className="bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {save.isPending
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Add locality"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
