import { RoomEntry } from "@/components/room-entry";

export const metadata = { title: "ルームへ参加" };

export default async function JoinRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ quick?: string }>;
}) {
  const query = await searchParams;
  return <RoomEntry mode={query.quick === "1" ? "quick" : "join"} />;
}
