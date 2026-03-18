import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

const COS_BUCKET = process.env.TENCENT_COS_BUCKET;
const COS_REGION = process.env.TENCENT_COS_REGION;
const SECRET_ID = process.env.TENCENT_COS_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_COS_SECRET_KEY;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 生成 COS Post Object 签名，供前端直传 COS（文件不经过本服务器）
 * 文档：https://cloud.tencent.com/document/product/436/14690
 */
export async function POST(req: NextRequest) {
  if (!COS_BUCKET || !COS_REGION || !SECRET_ID || !SECRET_KEY) {
    return NextResponse.json(
      { error: "COS 配置缺失，请检查环境变量。" },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as { section?: string; filename?: string };
    const sectionName =
      typeof body.section === "string" && body.section.trim()
        ? body.section.trim()
        : "默认分区";
    const rawName = typeof body.filename === "string" ? body.filename : "image.jpg";
    const ext = rawName.split(".").pop() || "jpg";
    const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : "jpg";

    const key = `uploads/${sectionName}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${safeExt}`;

    const startTimestamp = Math.floor(Date.now() / 1000);
    const endTimestamp = startTimestamp + 600; // 10 分钟有效
    const keyTime = `${startTimestamp};${endTimestamp}`;
    const expiration = new Date(endTimestamp * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

    const policy = {
      expiration,
      conditions: [
        { acl: "default" },
        { bucket: COS_BUCKET },
        { key },
        { "success_action_status": 200 },
        ["content-length-range", 0, MAX_FILE_SIZE],
        { "q-sign-algorithm": "sha1" },
        { "q-ak": SECRET_ID },
        { "q-sign-time": keyTime },
      ],
    };

    const policyStr = JSON.stringify(policy);
    const policyBase64 = Buffer.from(policyStr).toString("base64");

    const signKey = crypto
      .createHmac("sha1", SECRET_KEY)
      .update(keyTime)
      .digest("hex");
    const stringToSign = crypto.createHash("sha1").update(policyStr).digest("hex");
    const signature = crypto
      .createHmac("sha1", signKey)
      .update(stringToSign)
      .digest("hex");

    const postUrl = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/`;

    return NextResponse.json({
      postUrl,
      key,
      policy: policyBase64,
      "q-sign-algorithm": "sha1",
      "q-ak": SECRET_ID,
      "q-key-time": keyTime,
      "q-signature": signature,
    });
  } catch (e) {
    console.error("upload-token error:", e);
    return NextResponse.json(
      { error: "获取上传凭证失败，请稍后重试。" },
      { status: 500 }
    );
  }
}
