import { RoomClient } from "@/components/room-client";

export default async function RoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  return <RoomClient code={roomCode.toUpperCase()} />;
}
