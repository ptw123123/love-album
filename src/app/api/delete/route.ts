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

    const { key } = (await request.json()) as { key?: string };

    if (!key || !key.startsWith("uploads/")) {
      return NextResponse.json({ error: "无效的删除目标。" }, { status: 400 });
    }

    const deleteObject = () =>
      new Promise<COS.DeleteObjectResult>((resolve, reject) => {
        cos.deleteObject(
          {
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Key: key,
          },
          (err, data) => {
            if (err) reject(err);
            else resolve(data);
          }
        );
      });

    await deleteObject();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("COS delete error:", error);
    return NextResponse.json(
      { error: "删除失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

