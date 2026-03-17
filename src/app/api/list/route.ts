import COS from "cos-nodejs-sdk-v5";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const cos = new COS({
  SecretId: process.env.TENCENT_COS_SECRET_ID,
  SecretKey: process.env.TENCENT_COS_SECRET_KEY,
});

const COS_BUCKET = process.env.TENCENT_COS_BUCKET;
const COS_REGION = process.env.TENCENT_COS_REGION;

async function readCoversNames(): Promise<string[]> {
  try {
    const data = await new Promise<COS.GetObjectResult>((resolve, reject) => {
      cos.getObject(
        {
          Bucket: COS_BUCKET!,
          Region: COS_REGION!,
          Key: "uploads/_covers.json",
        },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });
    const body = data.Body as Buffer;
    if (!body || body.length === 0) return [];
    const json = JSON.parse(body.toString("utf-8") || "{}") as Record<
      string,
      unknown
    >;
    return Object.keys(json);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!COS_BUCKET || !COS_REGION) {
      return NextResponse.json(
        { error: "COS 配置缺失，请检查环境变量。" },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const rawSection = url.searchParams.get("section");
    // 这里拿到的是已经解码后的分区名字（比如 “测试1”）
    const sectionName = rawSection ? rawSection.trim() : "";
    const encodedSlug = sectionName ? encodeURIComponent(sectionName) : "";

    const basePrefix = "uploads/";

    const getBucket = () =>
      new Promise<COS.GetBucketResult>((resolve, reject) => {
        cos.getBucket(
          {
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Prefix: basePrefix,
          },
          (err, data) => {
            if (err) reject(err);
            else resolve(data);
          }
        );
      });

    const data = await getBucket();

    // 如果指定了某个分区，返回该分区里的照片列表
    if (sectionName) {
      const rawPrefix = `uploads/${sectionName}/`;
      const encodedPrefix = encodedSlug ? `uploads/${encodedSlug}/` : null;
      const photos =
        data.Contents?.filter(
          (item) =>
            item.Key &&
            (item.Key.startsWith(rawPrefix) ||
              (encodedPrefix ? item.Key.startsWith(encodedPrefix) : false))
        )
          .sort((a, b) => {
            const at = new Date(a.LastModified || "").getTime();
            const bt = new Date(b.LastModified || "").getTime();
            return bt - at;
          })
          .map((item) => {
            const key = item.Key!;
            const publicKey = encodeURI(key);
            return {
              key,
              url: `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${publicKey}`,
            };
          }) ?? [];

      return NextResponse.json({ photos, section: sectionName });
    }

    // 未指定分区时，返回所有分区汇总（用于首页展示分区卡片）
    const albumMap = new Map<string, { count: number }>();

    for (const item of data.Contents ?? []) {
      const key = item.Key;
      if (!key || !key.startsWith("uploads/")) continue;

      const rest = key.slice("uploads/".length);
      // 像 "_covers.json" 这种没有 "/" 的，不是分区，直接跳过
      if (!rest.includes("/")) continue;

      const [firstSegment] = rest.split("/");
      if (!firstSegment) continue;

      // 兼容旧的“编码过的文件夹名”和新的“直接中文文件夹名”
      const decodedName = decodeURIComponent(firstSegment);
      const current = albumMap.get(decodedName) ?? { count: 0 };

      const fileName = rest.split("/")[1] ?? "";
      const isPlaceholder = fileName === ".keep";

      albumMap.set(decodedName, {
        count: isPlaceholder ? current.count : current.count + 1,
      });
    }

    // 还要把封面配置里出现过、但还没有照片的分区也加进去（用于“先建分区，后上传”）
    const coverNames = await readCoversNames();
    for (const name of coverNames) {
      if (!albumMap.has(name)) {
        albumMap.set(name, { count: 0 });
      }
    }

    const sections = Array.from(albumMap.entries())
      .map(([name, value]) => ({ name, count: value.count }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    return NextResponse.json({ sections });
  } catch (error) {
    console.error("COS list error:", error);
    return NextResponse.json(
      { error: "获取相册列表失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

