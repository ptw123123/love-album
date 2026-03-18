"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Section = {
  name: string;
  count: number;
};

type DiaryMessage = {
  text: string;
  time: string;
  createdAt: number;
};

export default function Home() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successSection, setSuccessSection] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [newSectionName, setNewSectionName] = useState("");
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [mood, setMood] = useState<string>("");
  const [moodNote, setMoodNote] = useState<string>("");
  const [activeMoodKey, setActiveMoodKey] = useState<string | null>(null);
  const [boyInput, setBoyInput] = useState<string>("");
  const [girlInput, setGirlInput] = useState<string>("");
  const [boyMessages, setBoyMessages] = useState<DiaryMessage[]>([]);
  const [girlMessages, setGirlMessages] = useState<DiaryMessage[]>([]);

  const fetchSections = async () => {
    try {
      setLoadingSections(true);
      const res = await fetch("/api/list");
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as { sections?: Section[] };
      setSections(data.sections ?? []);
    } catch {
      // 忽略相册列表的错误，保持页面可用
    } finally {
      setLoadingSections(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) return;
      const data = (await res.json()) as {
        boyMessages?: DiaryMessage[];
        girlMessages?: DiaryMessage[];
      };
      if (Array.isArray(data.boyMessages)) setBoyMessages(data.boyMessages);
      if (Array.isArray(data.girlMessages)) setGirlMessages(data.girlMessages);
    } catch {
      // 接口失败时从本地恢复（例如未配置 COS）
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const now = Date.now();
      try {
        const boyRaw = window.localStorage.getItem("loveAlbum_boyMessages");
        if (boyRaw) {
          const parsed = JSON.parse(boyRaw) as DiaryMessage[];
          const valid = parsed.filter(
            (m) => typeof m.createdAt === "number" && now - m.createdAt < ONE_DAY
          );
          setBoyMessages(valid);
        }
        const girlRaw = window.localStorage.getItem("loveAlbum_girlMessages");
        if (girlRaw) {
          const parsed = JSON.parse(girlRaw) as DiaryMessage[];
          const valid = parsed.filter(
            (m) => typeof m.createdAt === "number" && now - m.createdAt < ONE_DAY
          );
          setGirlMessages(valid);
        }
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    void fetchSections();
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => setIsLoggedIn(d.ok === true))
      .catch(() => setIsLoggedIn(false));
  }, []);

  // 从云端拉取「他说的话 / 她说的话」，双方都能看到对方的留言
  useEffect(() => {
    void fetchMessages();
  }, []);

  // 云端拉取成功后，同步到本地以便接口不可用时仍能本地展示
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "loveAlbum_boyMessages",
        JSON.stringify(boyMessages)
      );
    } catch {
      // ignore
    }
  }, [boyMessages]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "loveAlbum_girlMessages",
        JSON.stringify(girlMessages)
      );
    } catch {
      // ignore
    }
  }, [girlMessages]);

  const uploadOneFile = async (
    file: File,
    effectiveSection: string,
    timeoutMs: number
  ): Promise<boolean> => {
    const tokenRes = await fetch("/api/upload-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: effectiveSection,
        filename: file.name,
      }),
    });

    if (tokenRes.ok) {
      const token = (await tokenRes.json()) as {
        postUrl?: string;
        key?: string;
        policy?: string;
        "q-sign-algorithm"?: string;
        "q-ak"?: string;
        "q-key-time"?: string;
        "q-signature"?: string;
      };
      if (
        token.postUrl &&
        token.key &&
        token.policy &&
        token["q-signature"]
      ) {
        const cosForm = new FormData();
        cosForm.append("key", token.key);
        cosForm.append("acl", "default");
        cosForm.append("policy", token.policy);
        cosForm.append("q-sign-algorithm", token["q-sign-algorithm"] ?? "sha1");
        cosForm.append("q-ak", token["q-ak"] ?? "");
        cosForm.append("q-key-time", token["q-key-time"] ?? "");
        cosForm.append("q-signature", token["q-signature"]);
        cosForm.append("file", file);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const cosRes = await fetch(token.postUrl, {
          method: "POST",
          body: cosForm,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (cosRes.ok || cosRes.status === 204) return true;
      }
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("section", effectiveSection);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) return false;
    const data = (await res.json()) as { url?: string };
    return !!data.url;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (files.length === 0) {
      setError("请先选择至少一张图片。");
      return;
    }

    const effectiveSection = selectedSection.trim();
    if (!effectiveSection) {
      setError("请先选择一个分区，再上传照片。");
      return;
    }

    const MAX_SINGLE_MB = 50;
    const maxBytes = MAX_SINGLE_MB * 1024 * 1024;
    const toUpload = files.filter((f) => f.size <= maxBytes);
    if (toUpload.length === 0) {
      setError(`照片过大（单张不超过 ${MAX_SINGLE_MB}MB），请压缩后重试。`);
      return;
    }
    if (toUpload.length < files.length) {
      setError(`有 ${files.length - toUpload.length} 张超过 ${MAX_SINGLE_MB}MB 已跳过，将上传其余 ${toUpload.length} 张。`);
    }

    setUploading(true);
    setError(null);

    const UPLOAD_TIMEOUT_MS = 120 * 1000;
    let successCount = 0;

    try {
      for (const file of toUpload) {
        const ok = await uploadOneFile(file, effectiveSection, UPLOAD_TIMEOUT_MS);
        if (ok) successCount += 1;
      }

      if (successCount > 0) {
        setError(null);
        void fetchSections();
        setFiles([]);
        setPreviewUrl(null);
        setSuccessSection(effectiveSection);
        setSuccessCount(successCount);
        setSuccessDialogOpen(true);
      } else {
        setError("上传失败，请稍后重试。");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setError("上传超时，请检查网络或换较小的照片后重试。");
        } else {
          setError(err.message || "上传出错，请稍后重试。");
        }
      } else {
        setError("上传出错，请稍后重试。");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-3 py-6 font-sans">
      <main className="love-card love-grid flex min-h-[560px] w-full max-w-6xl flex-col items-center justify-start gap-8 border-pink-100/60 px-6 py-6 sm:gap-10 sm:px-10 sm:py-10">
        <header className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-3 text-center sm:text-left">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <span className="love-badge">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                Little Sea-side Love Album
              </span>
            </div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              Love Album · 小小相册
            </h1>
            <p className="max-w-xl text-sm text-zinc-600 sm:text-base">
              上传照片，出发预备站，装满小小回忆～ฅ^•ﻌ•^ฅ
            </p>
          </div>
          {isLoggedIn === true && (
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
                router.refresh();
              }}
              className="love-pill-button-secondary text-xs"
            >
              退出登录
            </button>
          )}
        </header>

        <div className="flex w-full flex-col gap-8">
          <form
            onSubmit={handleSubmit}
            className="flex w-full flex-col gap-4 rounded-[2.5rem] border-4 border-white bg-white/85 p-4 shadow-[0_10px_0_rgba(154,208,245,1)] backdrop-blur-sm sm:p-5"
          >
            <h2 className="text-lg font-semibold text-zinc-900">
              先上传一张给 Ta 看的小照片吧
            </h2>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 rounded-full bg-sky-50/80 px-3 py-1 text-[11px] font-semibold text-sky-900">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-300 text-[10px]">
                    ❤
                  </span>
                  给这张照片挑一个小分区
                </label>
                <div className="space-y-2 rounded-3xl bg-sky-50/80 p-3 shadow-inner shadow-white/60">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setSectionPickerOpen((open) => !open)}
                      className="flex w-full items-center justify-between rounded-2xl border border-sky-200 bg-white/90 px-3 py-2 text-left text-sm text-sky-900 shadow-sm outline-none transition hover:border-sky-300 focus:border-sky-400"
                    >
                      <div className="flex flex-col">
                        <span className="text-[11px] text-sky-500">
                          选择分区
                        </span>
                        <span className="text-sm font-semibold">
                          {selectedSection ? selectedSection : "请选择一个分区"}
                        </span>
                      </div>
                      <span className="ml-2 text-sky-500">⌄</span>
                    </button>

                    {sectionPickerOpen && (
                      <div className="absolute z-20 mt-2 w-full rounded-2xl border border-sky-200 bg-white/95 p-1 text-sm text-sky-900 shadow-lg">
                        {sections.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            onClick={() => {
                              setSelectedSection(s.name);
                              setSectionPickerOpen(false);
                            }}
                            className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-sky-50 ${
                              selectedSection === s.name
                                ? "bg-sky-50 font-semibold"
                                : ""
                            }`}
                          >
                            <span>{s.name}</span>
                            <span className="text-[11px] text-sky-500">
                              {s.count} 张
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedSection ? (
                    <div className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-sky-800">
                      <span>📁</span>
                      <span>
                        当前会上传到分区「
                        <span className="font-semibold">{selectedSection}</span>
                        」里
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-sky-700">
                      还没有选择分区，请先在下面「我们的小分区」中新建或选择一个分区。
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-sky-900">
                  选择照片（可多选）
                </label>
                <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-[2.5rem] border-4 border-amber-300 bg-[#fffef7] shadow-sm sm:ml-auto sm:max-w-none">
                  {previewUrl ? (
                    <div className="relative h-full w-full">
                      <img
                        src={previewUrl}
                        alt="预览"
                        className="h-full w-full object-cover"
                      />
                      {files.length > 1 && (
                        <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
                          已选 {files.length} 张
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-amber-700">
                      <span className="text-3xl">📷</span>
                      <span className="text-xs font-medium">
                        点下面按钮选择照片（可多选）
                      </span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="absolute inset-0 cursor-pointer opacity-0"
                    required={files.length === 0}
                    onChange={(event) => {
                      const selected = Array.from(event.target.files ?? []);
                      setFiles(selected);
                      setError(null);
                      if (selected.length > 0) {
                        const url = URL.createObjectURL(selected[0]);
                        setPreviewUrl(url);
                      } else {
                        setPreviewUrl(null);
                      }
                    }}
                  />
                </div>

                <div className="mt-3 flex flex-col items-center gap-2">
                  <button
                    type="submit"
                    className="love-pill-button"
                    disabled={uploading}
                  >
                    {uploading ? "上传中..." : "上传到我们的相册"}
                  </button>
                  <p className="text-[11px] text-zinc-500">
                    单张不超过 50MB，直传更稳
                  </p>
                </div>
              </div>
            </div>

            {/* 心情 + 留言：移动端显示在分区与照片下面，整体在一起 */}
            <div className="mt-3 space-y-2 rounded-2xl bg-sky-50/70 p-3">
              <p className="text-xs font-medium text-sky-900">
                今日的小心情
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "happy", label: "超开心", emoji: "😆" },
                  { key: "warm", label: "被爱着", emoji: "🥰" },
                  { key: "calm", label: "很放松", emoji: "😊" },
                  { key: "miss", label: "有点想你", emoji: "🥺" },
                  { key: "tired", label: "有点累", emoji: "😴" },
                ].map((item) => {
                  const selected = mood === item.label;
                  const bouncing = activeMoodKey === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setMood(selected ? "" : item.label);
                        setActiveMoodKey(item.key);
                        setTimeout(() => setActiveMoodKey(null), 350);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium shadow-sm transition ${
                        selected
                          ? "bg-amber-300 text-sky-900"
                          : "bg-white text-sky-800"
                      } ${bouncing ? "animate-bounce" : ""}`}
                    >
                      <span>{item.emoji}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-sky-500">
                今天是 {new Date().toLocaleDateString("zh-CN")} 。
              </p>
              {/* 想说的话：左右两块，本地预览效果 */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {/* 男生区 */}
                <div className="space-y-2 rounded-2xl bg-white/90 p-3 shadow-sm">
                  <p className="text-[11px] font-semibold text-sky-900">
                    他说的话
                  </p>
                  <textarea
                    value={boyInput}
                    onChange={(e) => setBoyInput(e.target.value)}
                    rows={2}
                    maxLength={120}
                    className="w-full resize-none rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs text-sky-900 outline-none focus:border-sky-400"
                    placeholder="写一句今天想对她说的话～"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const text = boyInput.trim();
                      if (!text) return;
                      setBoyInput("");
                      try {
                        const res = await fetch("/api/messages", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ role: "boy", text }),
                        });
                        const data = await res.json();
                        if (res.ok && data.boyMessages) {
                          setBoyMessages(data.boyMessages);
                          if (data.girlMessages) setGirlMessages(data.girlMessages);
                        } else {
                          const time = new Date().toLocaleString("zh-CN", {
                            hour12: false,
                          });
                          setBoyMessages((prev) => [
                            { text, time, createdAt: Date.now() },
                            ...prev,
                          ]);
                        }
                      } catch {
                        const time = new Date().toLocaleString("zh-CN", {
                          hour12: false,
                        });
                        setBoyMessages((prev) => [
                          { text, time, createdAt: Date.now() },
                          ...prev,
                        ]);
                      }
                    }}
                    className="love-pill-button-secondary text-xs"
                  >
                    男生提交
                  </button>
                  <div className="mt-2 h-28 space-y-1 overflow-y-auto rounded-xl bg-sky-50/80 p-2 text-[11px] text-sky-900">
                    {boyMessages.length === 0 && (
                      <p className="text-[10px] text-sky-400">
                        还没有记录，有什么想说的？
                      </p>
                    )}
                    {boyMessages.map((m, idx) => (
                      <div
                        key={`${m.time}-${idx}`}
                        className="rounded-lg bg-white/80 px-2 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex items-center justify-between text-[10px] text-sky-500">
                          <span>🧑‍🚀</span>
                          <span>{m.time}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-sky-900">
                          {m.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 女生区 */}
                <div className="space-y-2 rounded-2xl bg-white/90 p-3 shadow-sm">
                  <p className="text-[11px] font-semibold text-sky-900">
                    她说的话
                  </p>
                  <textarea
                    value={girlInput}
                    onChange={(e) => setGirlInput(e.target.value)}
                    rows={2}
                    maxLength={120}
                    className="w-full resize-none rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs text-sky-900 outline-none focus:border-sky-400"
                    placeholder="写一句今天想对他说的话～"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const text = girlInput.trim();
                      if (!text) return;
                      setGirlInput("");
                      try {
                        const res = await fetch("/api/messages", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ role: "girl", text }),
                        });
                        const data = await res.json();
                        if (res.ok && data.girlMessages) {
                          setGirlMessages(data.girlMessages);
                          if (data.boyMessages) setBoyMessages(data.boyMessages);
                        } else {
                          const time = new Date().toLocaleString("zh-CN", {
                            hour12: false,
                          });
                          setGirlMessages((prev) => [
                            { text, time, createdAt: Date.now() },
                            ...prev,
                          ]);
                        }
                      } catch {
                        const time = new Date().toLocaleString("zh-CN", {
                          hour12: false,
                        });
                        setGirlMessages((prev) => [
                          { text, time, createdAt: Date.now() },
                          ...prev,
                        ]);
                      }
                    }}
                    className="love-pill-button-secondary text-xs"
                  >
                    女生提交
                  </button>
                  <div className="mt-2 h-28 space-y-1 overflow-y-auto rounded-xl bg-sky-50/80 p-2 text-[11px] text-sky-900">
                    {girlMessages.length === 0 && (
                      <p className="text-[10px] text-sky-400">
                        这里可以写下你今天的小心声。
                      </p>
                    )}
                    {girlMessages.map((m, idx) => (
                      <div
                        key={`${m.time}-${idx}`}
                        className="rounded-lg bg-white/80 px-2 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex items-center justify-between text-[10px] text-sky-500">
                          <span>👩‍🎨</span>
                          <span>{m.time}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-sky-900">
                          {m.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 下面这段是原来的文件选择逻辑，已经移动到上面的右侧 */}
            {/* <input
              type="file"
              accept="image/*"
              className="block w-full cursor-pointer rounded-[2.5rem] border-4 border-amber-300 bg-[#fffef7] px-3 py-2 text-sm text-zinc-700 shadow-sm file:mr-4 file:cursor-pointer file:rounded-3xl file:border-0 file:bg-amber-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-sky-900 hover:file:bg-amber-200"
              required
              onChange={(event) => {
                const selected = event.target.files?.[0];
                setFile(selected || null);
                setUploadedUrl(null);
                setError(null);

                if (selected) {
                  const url = URL.createObjectURL(selected);
                  setPreviewUrl(url);
                } else {
                  setPreviewUrl(null);
                }
              }}
            /> */}
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            {successDialogOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                <div className="w-full max-w-sm rounded-[2rem] border-4 border-sky-200 bg-white p-6 shadow-xl">
                  <p className="text-center text-lg font-semibold text-sky-900">
                    上传成功！
                  </p>
                  <p className="mt-2 text-center text-sm text-sky-700">
                    {successCount > 1
                      ? `已成功上传 ${successCount} 张照片到「${successSection}」`
                      : `已成功上传 1 张照片到「${successSection}」`}
                  </p>
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    {successSection && (
                      <Link
                        href={`/album/${encodeURIComponent(successSection)}`}
                        className="love-pill-button text-center text-sm"
                        onClick={() => setSuccessDialogOpen(false)}
                      >
                        去看看
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setSuccessDialogOpen(false)}
                      className="rounded-full border-2 border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>

          <section className="flex flex-col gap-4 rounded-[2.5rem] bg-sky-50/90 p-4 shadow-[0_10px_0_rgba(2,132,199,0.6)] backdrop-blur-sm sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-zinc-900">
                  分区集合
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void fetchSections()}
                className="love-pill-button-secondary"
                disabled={loadingSections}
              >
                {loadingSections ? "刷新中..." : "点点这里刷新一下"}
              </button>
            </div>

            {sections.length === 0 && !loadingSections && (
              <p className="text-sm text-sky-800">
                目前还没有任何分区，可以先在下面新建一个分区。
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {sections.map((section) => (
                <Link
                  key={section.name}
                  href={`/album/${encodeURIComponent(section.name)}`}
                  className="group relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-[2rem] border-4 border-sky-100 bg-[#e0f2fe] p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-sky-300 hover:shadow-md"
                >
                  <div className="space-y-1">
                    <h3 className="line-clamp-2 text-sm font-semibold text-sky-900">
                      {section.name}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-sky-800">
                      {section.count} 张照片
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* 新建分区表单：放在分区卡片底部 */}
            <form
              className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-sky-100/60 p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = newSectionName.trim();
                if (!name) return;
                try {
                  await fetch("/api/covers", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ section: name, urls: [] }),
                  });
                  setSelectedSection(name);
                  await fetchSections();
                } catch {
                  // 忽略错误，保持页面可用
                }
              }}
            >
              <input
                type="text"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                maxLength={20}
                className="min-w-0 flex-1 rounded-full border border-sky-200 bg-white/90 px-3 py-1.5 text-xs text-sky-900 shadow-sm outline-none focus:border-sky-400"
                placeholder="在这里输入分区名称，例如：日常碎碎念 / 旅行"
              />
              <button
                type="submit"
                className="love-pill-button-secondary text-xs"
              >
                新建分区
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
