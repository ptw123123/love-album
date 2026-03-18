import COS from "cos-nodejs-sdk-v5";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
// 延长超时，避免大图上传被平台提前中断（如 Vercel 默认 10s）
export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB，超过则拒绝（部署在 Vercel 时建议单张 < 4MB）

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

    const formData = await request.formData();
    const file = formData.get("file");
    const rawSection = formData.get("section");

    const sectionName =
      typeof rawSection === "string" && rawSection.trim().length > 0
        ? rawSection.trim()
        : "默认分区";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "未收到文件。" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `照片过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请压缩后重试，单张建议不超过 10MB。` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = file.name.split(".").pop() || "dat";
    const key = `uploads/${sectionName}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const putObject = () =>
      new Promise<COS.PutObjectResult>((resolve, reject) => {
        cos.putObject(
          {
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Key: key,
            Body: buffer,
          },
          (err, data) => {
            if (err) reject(err);
            else resolve(data);
          }
        );
      });

    await putObject();

    const publicKey = encodeURI(key);
    const url = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${publicKey}`;

    return NextResponse.json({ url, section: sectionName });
  } catch (error: unknown) {
    console.error("COS upload error:", error);
    const message =
      error instanceof Error ? error.message : "上传失败，请稍后重试。";
    const isNetworkOrTimeout =
      typeof message === "string" &&
      (message.includes("timeout") || message.includes("ETIMEDOUT") || message.includes("ECONNRESET"));
    return NextResponse.json(
      {
        error: isNetworkOrTimeout
          ? "上传超时或网络中断，请检查网络后重试。"
          : "上传失败，请稍后重试。",
      },
      { status: 500 }
    );
  }
}

