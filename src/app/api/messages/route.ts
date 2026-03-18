import COS from "cos-nodejs-sdk-v5";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const cos = new COS({
  SecretId: process.env.TENCENT_COS_SECRET_ID,
  SecretKey: process.env.TENCENT_COS_SECRET_KEY,
});

const COS_BUCKET = process.env.TENCENT_COS_BUCKET;
const COS_REGION = process.env.TENCENT_COS_REGION;
const MESSAGES_KEY = "uploads/_messages.json";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type DiaryMessage = {
  text: string;
  time: string;
  createdAt: number;
};

type MessagesData = {
  boyMessages: DiaryMessage[];
  girlMessages: DiaryMessage[];
};

async function readMessages(): Promise<MessagesData> {
  if (!COS_BUCKET || !COS_REGION) return { boyMessages: [], girlMessages: [] };

  try {
    const data = await new Promise<COS.GetObjectResult>((resolve, reject) => {
      cos.getObject(
        {
          Bucket: COS_BUCKET,
          Region: COS_REGION,
          Key: MESSAGES_KEY,
        },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    const body = data.Body as Buffer;
    if (!body || body.length === 0) return { boyMessages: [], girlMessages: [] };

    const raw = JSON.parse(body.toString("utf-8") || "{}") as MessagesData;
    return {
      boyMessages: Array.isArray(raw.boyMessages) ? raw.boyMessages : [],
      girlMessages: Array.isArray(raw.girlMessages) ? raw.girlMessages : [],
    };
  } catch {
    return { boyMessages: [], girlMessages: [] };
  }
}

async function writeMessages(data: MessagesData) {
  if (!COS_BUCKET || !COS_REGION) return;

  const body = Buffer.from(JSON.stringify(data));

  await new Promise<COS.PutObjectResult>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: MESSAGES_KEY,
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

function filterLast24h(list: DiaryMessage[]): DiaryMessage[] {
  const now = Date.now();
  return list.filter(
    (m) => typeof m.createdAt === "number" && now - m.createdAt < ONE_DAY_MS
  );
}

/** GET：拉取「他说的话 / 她说的话」，只返回 24 小时内的 */
export async function GET() {
  if (!COS_BUCKET || !COS_REGION) {
    return NextResponse.json(
      { error: "COS 配置缺失" },
      { status: 500 }
    );
  }

  const data = await readMessages();
  return NextResponse.json({
    boyMessages: filterLast24h(data.boyMessages),
    girlMessages: filterLast24h(data.girlMessages),
  });
}

/** POST：追加一条留言，body: { role: 'boy' | 'girl', text: string } */
export async function POST(req: NextRequest) {
  try {
    if (!COS_BUCKET || !COS_REGION) {
      return NextResponse.json(
        { error: "COS 配置缺失" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as { role?: string; text?: string };
    const role = body.role === "boy" ? "boy" : body.role === "girl" ? "girl" : null;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!role || !text) {
      return NextResponse.json(
        { error: "参数错误：需要 role（boy/girl）和 text" },
        { status: 400 }
      );
    }

    if (text.length > 120) {
      return NextResponse.json(
        { error: "留言最多 120 字" },
        { status: 400 }
      );
    }

    const data = await readMessages();
    const time = new Date().toLocaleString("zh-CN", { hour12: false });
    const item: DiaryMessage = { text, time, createdAt: Date.now() };

    if (role === "boy") {
      data.boyMessages = [item, ...data.boyMessages].slice(0, 200);
    } else {
      data.girlMessages = [item, ...data.girlMessages].slice(0, 200);
    }

    await writeMessages(data);

    return NextResponse.json({
      ok: true,
      boyMessages: filterLast24h(data.boyMessages),
      girlMessages: filterLast24h(data.girlMessages),
    });
  } catch (error) {
    console.error("messages POST error:", error);
    return NextResponse.json(
      { error: "提交失败，请稍后重试。" },
      { status: 500 }
    );
  }
}
