This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 相册上传说明

照片上传使用 **腾讯云 COS**。默认采用 **浏览器直传**：先向本站获取签名，再由浏览器直接 POST 到 COS，文件不经过服务器，速度更快、不易超时。直传失败时会自动回退为经服务器转发。

需在项目根目录配置 `.env.local`：

- `TENCENT_COS_SECRET_ID`
- `TENCENT_COS_SECRET_KEY`
- `TENCENT_COS_BUCKET`
- `TENCENT_COS_REGION`

**直传需在 COS 控制台为存储桶配置 CORS**。详细步骤见：[docs/COS-CORS配置教程.md](docs/COS-CORS配置教程.md)。简要：来源填站点域名（如 `https://你的域名.com` 或 `http://localhost:3000`），允许方法 GET/POST/PUT/HEAD，Allow-Headers 填 `*`，Expose-Headers 填 `ETag`。

若仍很慢或失败：检查 COS 配置与网络；单张建议 &lt; 10MB；部署在 Vercel 时也可考虑换用 Vercel Blob 存储。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
