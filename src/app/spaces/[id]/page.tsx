import { SpacePageClient } from "./SpacePageClient";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SpacePageClient id={id} />;
}
