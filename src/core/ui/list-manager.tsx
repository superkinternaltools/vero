"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Input } from "@/core/ui/input";
import { Button } from "@/core/ui/button";

type Item = { id: string; name: string };
type Result = { error?: string };

export function ListManager({
  title,
  items,
  addPlaceholder,
  onCreate,
  onRename,
  onDelete,
}: {
  title: string;
  items: Item[];
  addPlaceholder?: string;
  onCreate: (name: string) => Promise<Result>;
  onRename: (id: string, name: string) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!newName.trim()) return;
    start(async () => {
      const r = await onCreate(newName);
      if (r?.error) setError(r.error);
      else {
        setNewName("");
        setError(null);
        router.refresh();
      }
    });
  }

  function saveEdit() {
    if (editingId === null) return;
    start(async () => {
      const r = await onRename(editingId, editName);
      if (r?.error) setError(r.error);
      else {
        setEditingId(null);
        setError(null);
        router.refresh();
      }
    });
  }

  function del(id: string) {
    if (!window.confirm("Delete this item?")) return;
    start(async () => {
      const r = await onDelete(id);
      if (r?.error) setError(r.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") add();
  };

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>

      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 px-5 py-2.5">
            {editingId === it.id ? (
              <>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="py-2" />
                <button type="button" onClick={saveEdit} aria-label="Save" className="rounded-lg p-2 text-success hover:bg-muted">
                  <Check className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel" className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-foreground">{it.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(it.id);
                    setEditName(it.name);
                    setError(null);
                  }}
                  aria-label="Edit"
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => del(it.id)} aria-label="Delete" className="rounded-lg p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-muted-foreground">Nothing yet.</li>
        )}
      </ul>

      <div className="flex items-center gap-2 border-t border-border px-5 py-3">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={onAddKey} placeholder={addPlaceholder ?? "New item"} className="py-2" />
        <Button size="md" onClick={add} disabled={pending}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {error && <p className="px-5 pb-3 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
