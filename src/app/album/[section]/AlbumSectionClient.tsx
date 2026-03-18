"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Photo = {
  key: string;
  url: string;
};

export default function AlbumSectionClient({ section }: { section: string }) {
  const decodedSectionName = section;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [deletingSection, setDeletingSection] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const photosRes = await fetch(
          `/api/list?section=${encodeURIComponent(decodedSectionName)}`
        );
        if (photosRes.ok) {
          const data = (await photosRes.json()) as { photos?: Photo[] };
          setPhotos(data.photos ?? []);
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [decodedSectionName]);

  const handleDelete = async (photo: Photo) => {
    if (!window.confirm("确定要删除这张照片吗？删除后就找不回来了哦。")) {
      return;
    }
    try {
      setDeletingKey(photo.key);
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: photo.key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "删除失败，请稍后重试。");
      }
      setPhotos((prev) => prev.filter((p) => p.key !== photo.key));
    } catch (err: any) {
      alert(err.message || "删除失败，请稍后重试。");
    } finally {
      setDeletingKey(null);
    }
  };

  const handleClearSection = async () => {
    if (
      !window.confirm(
        `确定要清空分区「${decodedSectionName}」里的所有照片吗？分区本身会保留。`
      )
    ) {
      return;
    }
    try {
      setClearing(true);
      const res = await fetch("/api/section-clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ section: decodedSectionName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "清空分区失败，请稍后重试。");
      }
      setPhotos([]);
    } catch (err: any) {
      alert(err.message || "清空分区失败，请稍后重试。");
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteSection = async () => {
    if (
      !window.confirm(
        `确定要删除整个分区「${decodedSectionName}」吗？分区里的所有照片也会被一起删除。`
      )
    ) {
      return;
    }
    try {
      setDeletingSection(true);
      const res = await fetch("/api/section-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ section: decodedSectionName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "删除分区失败，请稍后重试。");
      }
      // 删除分区后直接返回首页
      window.location.href = "/";
    } catch (err: any) {
      alert(err.message || "删除分区失败，请稍后重试。");
    } finally {
      setDeletingSection(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-3 py-6 font-sans">
      <main className="love-card love-grid flex min-h-[560px] w-full max-w-6xl flex-col gap-6 border-pink-100/60 px-6 py-6 sm:gap-8 sm:px-10 sm:py-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="love-badge">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              我们的小分区 · {decodedSectionName}
            </p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              {decodedSectionName}
            </h1>
            <p className="max-w-xl text-sm text-sky-900">
              这里是关于「{decodedSectionName}」的所有照片，你可以点开大图，或者删掉不想留的回忆。
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleClearSection()}
              className="love-pill-button-secondary text-xs"
              disabled={clearing || deletingSection}
            >
              {clearing ? "清空中..." : "清空这个分区的照片"}
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteSection()}
              className="love-pill-button-secondary text-xs text-red-600"
              disabled={clearing || deletingSection}
            >
              {deletingSection ? "删除分区中..." : "🗑 删除整个分区"}
            </button>
            <Link
              href="/"
              className="love-pill-button-secondary inline-flex items-center gap-1"
            >
              ← 回到首页
            </Link>
          </div>
        </header>

        {loading && (
          <p className="text-sm text-sky-800">载入中，小波浪正在把照片送过来…</p>
        )}

        {!loading && photos.length === 0 && (
          <p className="text-sm text-sky-800">
            这个分区里暂时还没有照片，可以回到首页，在上传时选择分区「{decodedSectionName}
            」来添加。
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.key}
              className="group relative overflow-hidden rounded-[2rem] border-4 border-sky-100 bg-[#e0f2fe] shadow-sm transition hover:-translate-y-1 hover:border-sky-300 hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => setPreviewUrl(photo.url)}
                className="block w-full cursor-zoom-in"
              >
                <img
                  src={photo.url}
                  alt="我们的一张照片"
                  className="aspect-[4/3] w-full object-cover transition group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 opacity-0 transition group-hover:opacity-100" />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(photo)}
                className="absolute right-2 top-2 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm transition hover:bg-black/55 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                disabled={deletingKey === photo.key}
              >
                {deletingKey === photo.key ? "删除中..." : "删除"}
              </button>
            </div>
          ))}
        </div>
        {previewUrl && (
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4"
          >
            <img
              src={previewUrl}
              alt="预览大图"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/40 shadow-2xl"
            />
          </button>
        )}
      </main>
    </div>
  );
}

