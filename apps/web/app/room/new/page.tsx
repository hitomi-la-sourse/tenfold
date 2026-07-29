import { RoomEntry } from "@/components/room-entry";

export const metadata = { title: "ルームを作る" };

export default function NewRoomPage() {
  return <RoomEntry mode="create" />;
}
