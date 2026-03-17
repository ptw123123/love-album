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

export async function GET() {
  if (!COS_BUCKET || !COS_REGION) {
    return NextResponse.json(
      { error: "COS 配置缺失" },
      { status: 500 }
    );
  }

  const covers = await readCovers();
  return NextResponse.json({ covers });
}

export async function POST(req: NextRequest) {
  try {
    if (!COS_BUCKET || !COS_REGION) {
      return NextResponse.json(
        { error: "COS 配置缺失" },
        { status: 500 }
      );
    }

    const { section, urls } = (await req.json()) as {
      section?: string;
      urls?: string[];
    };

    if (!section || !Array.isArray(urls)) {
      return NextResponse.json(
        { error: "参数错误" },
        { status: 400 }
      );
    }

    const covers = await readCovers();
    covers[section] = urls.slice(0, 2);
    await writeCovers(covers);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("covers save error", error);
    return NextResponse.json(
      { error: "保存封面失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

