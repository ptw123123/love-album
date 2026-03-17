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
  } catch (error) {
    console.error("COS upload error:", error);
    return NextResponse.json(
      { error: "上传失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

