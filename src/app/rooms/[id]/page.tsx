import { getCurrentUser } from "@/services/supabase/lib/getCurrentUser";
import { createAdminClient } from "@/services/supabase/server";
import { notFound } from "next/navigation";
import { RoomClient } from "./_client";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const [room, user, messages] = await Promise.all([getRoom(id), getUser(), getMessages(id)]);

	if (room == null || user == null) return notFound();

	return <RoomClient room={room} user={user} messages={messages} />;
}

async function getRoom(id: string) {
	const user = await getCurrentUser();
	if (user == null) return null;

	const supabase = await createAdminClient();
	const { data: room, error } = await supabase
		.from("chat_room")
		.select("id, name, chat_room_member!inner ()")
		.eq("id", id)
		.eq("chat_room_member.member_id", user.id)
		.single();

	if (error) return null;
	return room;
}

async function getUser() {
	const user = await getCurrentUser();
	const supabase = await createAdminClient();
	if (user == null) return null;

	const { data, error } = await supabase
		.from("user_profile")
		.select("id, name, image_url")
		.eq("id", user.id)
		.single();

	if (error) return null;
	return data;
}

async function getMessages(roomId: string) {
	const user = await getCurrentUser();
	if (!user) return [];

	// 1. Check if the user is a member of this room first
	// Reuse your existing getRoom logic to verify membership
	const room = await getRoom(roomId);

	if (!room) {
		// User is either not logged in or not a member of the room
		return [];
	}

	const supabase = await createAdminClient();

	// 2. Fetch messages only after verification
	const { data, error } = await supabase
		.from("messages")
		.select("id, text, created_at, author_id, author:user_profile!inner (name, image_url)")
		.eq("chat_room_id", roomId)
		.order("created_at", { ascending: false })
		.limit(10);

	if (error) {
		console.error("Error fetching messages:", error);
		return [];
	}

	return data;
}
