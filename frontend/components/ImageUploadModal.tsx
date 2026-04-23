"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  uploading: boolean;
  onDismiss: () => void;
  onSend: (file: File) => Promise<void>;
};

export function ImageUploadModal({
  open,
  uploading,
  onDismiss,
  onSend,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [open]);

  function handleClose() {
    if (uploading) return;
    onDismiss();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;
    setError(null);
    try {
      await onSend(file);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Upload failed. Try again.";
      setError(msg);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-auto max-w-[min(100vw-2rem,28rem)] w-full rounded-xl border border-[#262626] bg-[#0a0a0a] p-0 text-white shadow-xl backdrop:bg-black/70 open:flex open:flex-col"
      onClose={() => {
        setFile(null);
        setError(null);
      }}
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Share a photo</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Hank will take a look and help you from there
          </p>
        </div>

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="text-sm text-neutral-300 file:mr-3 file:rounded-full file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-xs file:font-bold file:text-black"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setError(null);
          }}
        />

        {previewUrl ? (
          <div className="overflow-hidden rounded-lg border border-[#262626] bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              className="max-h-48 w-full object-contain"
            />
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            className="rounded-full border border-[#404040] px-5 py-2 text-xs font-bold uppercase tracking-wider text-neutral-300 transition-colors hover:bg-white/5 disabled:opacity-50"
            disabled={uploading}
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-5 py-2 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_16px_rgba(245,158,11,0.35)] transition-opacity disabled:opacity-50"
            disabled={uploading || !file}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Send
          </button>
        </div>
      </form>
    </dialog>
  );
}
