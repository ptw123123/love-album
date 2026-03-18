"use client";

import Link from "next/link";
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
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!file) {
      setError("请先选择一张图片。");
      return;
    }

    const effectiveSection = selectedSection.trim();
    if (!effectiveSection) {
      setError("请先选择一个分区，再上传照片。");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("照片过大（单张建议不超过 10MB），请压缩后重试。");
      return;
    }

    setUploading(true);
    setError(null);
    setUploadedUrl(null);

    const UPLOAD_TIMEOUT_MS = 120 * 1000; // 直传 120 秒

    try {
      // 1. 优先直传 COS：向本服务器要签名，再由浏览器直接 POST 到腾讯云，文件不经过服务器
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
          cosForm.append("success_action_status", "200");
          cosForm.append("policy", token.policy);
          cosForm.append("q-sign-algorithm", token["q-sign-algorithm"] ?? "sha1");
          cosForm.append("q-ak", token["q-ak"] ?? "");
          cosForm.append("q-key-time", token["q-key-time"] ?? "");
          cosForm.append("q-signature", token["q-signature"]);
          cosForm.append("file", file);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
          const cosRes = await fetch(token.postUrl, {
            method: "POST",
            body: cosForm,
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId));

          if (cosRes.ok || cosRes.status === 204) {
            const baseUrl = token.postUrl!.replace(/\/?$/, "");
            const url = `${baseUrl}/${encodeURI(token.key)}`;
            setUploadedUrl(url);
            void fetchSections();
            setUploading(false);
            return;
          }
        }
      }

      // 2. 直传失败则回退：经本服务器转发到 COS
      const formData = new FormData();
      formData.append("file", file);
      formData.append("section", effectiveSection);
      if (mood) formData.append("mood", mood);
      if (moodNote) formData.append("moodNote", moodNote);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "上传失败，请稍后重试。");
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        setUploadedUrl(data.url);
        void fetchSections();
      } else {
        throw new Error("上传成功但未返回链接。");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setError("上传超时，请检查网络或换一张较小的照片后重试。");
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
                  选择一张照片
                </label>
                <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-[2.5rem] border-4 border-amber-300 bg-[#fffef7] shadow-sm sm:ml-auto sm:max-w-none">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="预览"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-amber-700">
                      <span className="text-3xl">📷</span>
                      <span className="text-xs font-medium">
                        点下面按钮选择一张照片
                      </span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 cursor-pointer opacity-0"
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
                    建议单张 &lt; 4MB，避免上传超时或失败
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

            {/* 右侧方形卡片里已经有预览，这里就不要重复展示了 */}

            {uploadedUrl && (
              <div className="mt-2 flex flex-col gap-2 rounded-[1.75rem] bg-amber-50/90 p-3 text-sm text-sky-900">
                <span>上传成功！这是这张照片的专属链接：</span>
                <a
                  href={uploadedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-xs font-medium text-pink-700 underline underline-offset-2"
                >
                  {uploadedUrl}
                </a>
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
