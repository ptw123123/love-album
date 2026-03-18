"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "登录失败，请重试");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 font-sans">
      <main className="love-card love-grid w-full max-w-sm rounded-[2.5rem] border-4 border-pink-100/60 bg-white/90 p-6 shadow-[0_10px_0_rgba(154,208,245,0.6)] sm:p-8">
        <div className="space-y-4 text-center">
          <span className="love-badge inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            Little Sea-side Love Album
          </span>
          <h1 className="text-2xl font-semibold text-zinc-900">
            登录 · 小小相册
          </h1>
          <p className="text-sm text-zinc-600">
            输入你的名字进入相册
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-left text-xs font-medium text-sky-800">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full rounded-2xl border-2 border-sky-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-sky-400"
              placeholder="请输入你的名字"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="love-pill-button mt-2 disabled:opacity-70"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </main>
    </div>
  );
}
