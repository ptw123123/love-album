import COS from "cos-nodejs-sdk-v5";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const cos = new COS({
  SecretId: process.env.TENCENT_COS_SECRET_ID,
  SecretKey: process.env.TENCENT_COS_SECRET_KEY,
});

const COS_BUCKET = process.env.TENCENT_COS_BUCKET;
const COS_REGION = process.env.TENCENT_COS_REGION;

export async function POST(request: NextRequest) {
  try {
    if (!COS_BUCKET || !COS_REGION) {
      return NextResponse.json(
        { error: "COS 配置缺失，请检查环境变量。" },
        { status: 500 }
      );
    }

    const { section } = (await request.json()) as { section?: string };
    const sectionName = section?.trim();

    if (!sectionName) {
      return NextResponse.json({ error: "缺少分区名称。" }, { status: 400 });
    }

    const encodedSlug = encodeURIComponent(sectionName);
    const rawPrefix = `uploads/${sectionName}/`;
    const encodedPrefix = `uploads/${encodedSlug}/`;

    const listAllObjects = async () => {
      const allKeys: string[] = [];
      let marker: string | undefined;

      // 简单分页遍历
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const page = await new Promise<COS.GetBucketResult>((resolve, reject) =>
          cos.getBucket(
            {
              Bucket: COS_BUCKET,
              Region: COS_REGION,
              Prefix: "uploads/",
              Marker: marker,
            },
            (err, data) => {
              if (err) reject(err);
              else resolve(data);
            }
          )
        );

        for (const item of page.Contents ?? []) {
          const key = item.Key;
          if (!key) continue;
          if (
            key.startsWith(rawPrefix) ||
            key.startsWith(encodedPrefix)
          ) {
            // 跳过占位文件
            if (key.endsWith("/.keep")) continue;
            allKeys.push(key);
          }
        }

        if (!page.IsTruncated || !page.NextMarker) {
          break;
        }
        marker = page.NextMarker;
      }

      return allKeys;
    };

    const keysToDelete = await listAllObjects();

    if (keysToDelete.length > 0) {
      const deleteChunks: string[][] = [];
      for (let i = 0; i < keysToDelete.length; i += 1000) {
        deleteChunks.push(keysToDelete.slice(i, i + 1000));
      }

      for (const chunk of deleteChunks) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise<COS.DeleteMultipleObjectResult>(
          (resolve, reject) => {
            cos.deleteMultipleObject(
              {
                Bucket: COS_BUCKET,
                Region: COS_REGION,
                Objects: chunk.map((Key) => ({ Key })),
              },
              (err, data) => {
                if (err) reject(err);
                else resolve(data);
              }
            );
          }
        );
      }
    }

    // 确保分区目录下有一个占位文件，避免分区“消失”
    const placeholderKeyRaw = `${rawPrefix}.keep`;
    const placeholderKeyEncoded = `${encodedPrefix}.keep`;

    const putPlaceholder = (key: string) =>
      new Promise<COS.PutObjectResult>((resolve, reject) => {
        cos.putObject(
          {
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Key: key,
            Body: "",
          },
          (err, data) => {
            if (err) reject(err);
            else resolve(data);
          }
        );
      });

    // 同时尝试写入原始和编码后的两种 key，保证兼容
    await Promise.all([putPlaceholder(placeholderKeyRaw), putPlaceholder(placeholderKeyEncoded)]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("COS section clear error:", error);
    return NextResponse.json(
      { error: "清空分区失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

