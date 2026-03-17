import COS from "cos-nodejs-sdk-v5";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const cos = new COS({
  SecretId: process.env.TENCENT_COS_SECRET_ID,
  SecretKey: process.env.TENCENT_COS_SECRET_KEY,
});

const COS_BUCKET = process.env.TENCENT_COS_BUCKET;
const COS_REGION = process.env.TENCENT_COS_REGION;
const COVERS_KEY = "uploads/_covers.json";

type CoversMap = Record<string, string[]>;

async function readCovers(): Promise<CoversMap> {
  if (!COS_BUCKET || !COS_REGION) return {};

  try {
    const data = await new Promise<COS.GetObjectResult>((resolve, reject) => {
      cos.getObject(
        {
          Bucket: COS_BUCKET!,
          Region: COS_REGION!,
          Key: COVERS_KEY,
        },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    const body = data.Body as Buffer;
    if (!body || body.length === 0) return {};
    return JSON.parse(body.toString("utf-8") || "{}");
  } catch {
    return {};
  }
}

async function writeCovers(covers: CoversMap) {
  if (!COS_BUCKET || !COS_REGION) return;

  const body = Buffer.from(JSON.stringify(covers));

  await new Promise<COS.PutObjectResult>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: COS_BUCKET!,
        Region: COS_REGION!,
        Key: COVERS_KEY,
        Body: body,
        ContentType: "application/json",
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });
}

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
          if (key.startsWith(rawPrefix) || key.startsWith(encodedPrefix)) {
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

    // 同步删除封面配置里的这个分区，避免首页继续显示一个空的分区
    try {
      const covers = await readCovers();
      if (covers[sectionName]) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete covers[sectionName];
        await writeCovers(covers);
      }
    } catch (coversError) {
      console.error("section delete covers sync error:", coversError);
      // 封面配置更新失败不影响主流程
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("COS section delete error:", error);
    return NextResponse.json(
      { error: "删除分区失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

