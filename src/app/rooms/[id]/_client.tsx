"use client";

import { ChatInput } from "@/components/chat-input";
import { ChatMessage } from "@/components/chat-message";
import { InviteUserModal } from "@/components/invite-user-modal";
import { Button } from "@/components/ui/button";
import { Message } from "@/services/supabase/actions/messages";
import { createClient } from "@/services/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

export function RoomClient({
	room,
	user,
	messages,
}: {
	room: { id: string; name: string };
	user: { id: string; name: string; image_url: string | null };
	messages: Message[];
}) {
	const {
		messages: oldMessages,
		loadMoreMessages,
		status,
		triggerQueryRef,
	} = useInfiniteScroll({ startingMessage: messages.toReversed(), roomId: room.id });
	const { connectedUsers, messages: realtimeMessages } = useRealtimeChat({ roomId: room.id, userId: user.id });
	const [sentMessages, setSentMessages] = useState<(Message & { status: "pending" | "error" | "success" })[]>([]);
	const showMessages = oldMessages.concat(
		realtimeMessages,
		sentMessages.filter((m) => !realtimeMessages.find((rm) => rm.id === m.id))
	);
	console.log(showMessages);
	return (
		<div className="container mx-auto h-screen-with-header border border-y-0 flex flex-col">
			<div className="p-4 border-b">
				<h1 className="text-2xl font-bold">{room.name}</h1>
				<p className="text-muted-foreground text-sm">
					{connectedUsers} {connectedUsers === 1 ? "user" : "users"} online
				</p>
			</div>
			<InviteUserModal roomId={room.id} />
			<div
				className="grow overflow-y-auto flex flex-col-reverse"
				style={{
					scrollbarWidth: "thin",
					scrollbarColor: "var(--border) transparent",
				}}
			>
				<div>
					{status === "loading" && (
						<p className="text-center text-sm text-muted-foreground py-2">Loading more messages...</p>
					)}
					{status === "error" && (
						<div className="text-center">
							<p className="text-sm text-destructive py-2">Error loading messages.</p>
							<Button onClick={loadMoreMessages} variant="outline">
								Retry
							</Button>
						</div>
					)}
					{showMessages.map((message, index) => (
						<ChatMessage
							key={message.id}
							{...message}
							ref={index === 0 && status === "idle" ? triggerQueryRef : undefined}
						/>
					))}
				</div>
			</div>
			<ChatInput
				roomId={room.id}
				onSend={(message) => {
					setSentMessages((prev) => [
						...prev,
						{
							id: message.id,
							text: message.text,
							created_at: new Date().toISOString(),
							author_id: user.id,
							author: {
								name: user.name,
								image_url: user.image_url,
							},
							status: "pending",
						},
					]);
				}}
				onSuccessfulSend={(message) => {
					setSentMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, status: "success" } : m)));
				}}
				onErrorSend={(id) => {
					setSentMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "error" } : m)));
				}}
			/>
		</div>
	);
}

function useRealtimeChat({ roomId, userId }: { roomId: string; userId: string }) {
	const [connectedUsers, setConnectedUsers] = useState(1);
	const [messages, setMessages] = useState<Message[]>([]);
	useEffect(() => {
		const supabase = createClient();
		let newChannel: RealtimeChannel;
		let cancel = false;
		supabase.realtime.setAuth().then(() => {
			if (cancel) return;
			newChannel = supabase.channel(`room:${roomId}:messages`, {
				config: {
					private: true,
					presence: {
						key: userId,
					},
				},
			});

			newChannel
				.on("presence", { event: "sync" }, () => {
					setConnectedUsers(Object.keys(newChannel.presenceState()).length);
				})
				.on("broadcast", { event: "INSERT" }, (payload) => {
					const record = payload.payload;
					setMessages((prevMessages) => [
						...prevMessages,
						{
							id: record.id,
							text: record.text,
							created_at: record.created_at,
							author_id: record.author_id,
							author: {
								name: record.author_name,
								image_url: record.author_image_url,
							},
						},
					]);
				})
				.subscribe((status) => {
					if (status !== "SUBSCRIBED") return;

					newChannel.track({ userId });
				});
		});
		return () => {
			cancel = true;
			if (!newChannel) return;
			newChannel.untrack();
			newChannel.unsubscribe();
		};
	}, [roomId, userId]);

	return { connectedUsers, messages };
}

function useInfiniteScroll({ startingMessage, roomId }: { startingMessage: Message[]; roomId: string }) {
	const [messages, setMessages] = useState<Message[]>(startingMessage);
	const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">(
		startingMessage.length === 0 ? "done" : "idle"
	);

	async function loadMoreMessages() {
		if (status === "done" || status === "loading") return;
		const supabase = createClient();
		setStatus("loading");
		await new Promise((resolve) => setTimeout(resolve, 2000)); // artificial delay for demo purposes
		const { data, error } = await supabase
			.from("messages")
			.select("id, text, created_at, author_id, author:user_profile (name, image_url)")
			.eq("chat_room_id", roomId)
			.lt("created_at", messages[0].created_at)
			.order("created_at", { ascending: false })
			.limit(10);
		if (error) {
			setStatus("error");
			return;
		}

		setMessages((prev) => [...data.toReversed(), ...prev]);
		setStatus(data.length < 10 ? "done" : "idle");
	}

	function triggerQueryRef(node: HTMLElement | null) {
		if (node == null) return;
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && entry.target === node) {
						observer.unobserve(node);
						loadMoreMessages();
					}
				});
			},
			{
				rootMargin: "50px",
			}
		);

		observer.observe(node);

		return () => {
			observer.disconnect();
		};
	}

	return { messages, loadMoreMessages, status, triggerQueryRef };
}
