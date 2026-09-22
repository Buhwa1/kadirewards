import { readTillSession } from "@/lib/till-session";
import TillLogin from "./TillLogin";
import TillApp from "./TillApp";
import RegisterSW from "./RegisterSW";

export const dynamic = "force-dynamic";

export default async function TillPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const { shop } = await searchParams;
  const session = await readTillSession();
  return (
    <>
      <RegisterSW />
      {session ? <TillApp session={session} /> : <TillLogin defaultSlug={shop ?? ""} />}
    </>
  );
}
