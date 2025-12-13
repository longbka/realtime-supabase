"use server";

import { getCurrentUser } from "../lib/getCurrentUser";
import { createAdminClient } from "../server";

export type Message = {
	id: string;
	text: string;
	created_at: string;
	author_id: string;
	author: {
		name: string;
		image_url: string | null;
	};
};

export async function sendMessage(data: {
    id: string;
	text: string;
	roomId: string;
}): Promise<{ error: false; message: Message } | { error: true; message: string }> {
	const user = await getCurrentUser();
	if (!user) {
		return { error: true, message: "User not logged in" };
	}

	if (!data.text.trim()) {
		return { error: true, message: "Message text cannot be empty" };
	}

	const supabase = await createAdminClient();
	const { data: membership, error: membershipError } = await supabase
		.from("chat_room_member")
		.select("member_id")
		.eq("chat_room_id", data.roomId)
		.eq("member_id", user.id)
		.single();
	if (membershipError || !membership) {
		return { error: true, message: "User is not a member of this room" };
	}

	const { data: message, error } = await supabase
		.from("messages")
		.insert({
            id: data.id,
			text: data.text,
			chat_room_id: data.roomId,
			author_id: user.id,
		})
		.select("id, text, created_at, author_id, author:user_profile!inner (name, image_url)")
		.single();
    console.log(error)
	if (error) {
		return { error: true, message: "Failed to send message" };
	}

	return { error: false, message };
}
