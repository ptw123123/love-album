import AlbumSectionClient from "./AlbumSectionClient";

export default async function AlbumSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const resolved = await params;
  const decodedSectionName = decodeURIComponent(resolved.section);

  return <AlbumSectionClient section={decodedSectionName} />;
}

