import { RoomEntry } from "@/components/room-entry";

export const metadata = { title: "ルームへ参加" };

export default function JoinRoomPage() {
  return <RoomEntry mode="join" />;
}
