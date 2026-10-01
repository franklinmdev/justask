/**
 * The largest body a handler reads, in bytes: room for the longest request
 * with every character escaped, and its time zone. Past it the handler stops
 * reading, so no body can hold the server's memory.
 */
export const MAX_BODY_BYTES = 16 * 1024;

/**
 * The body as text, or null past MAX_BODY_BYTES: refused on its declared
 * length before a byte is read, else read no further than the cap. Rejects
 * when the stream fails, as when the connection drops mid upload. Shared by
 * the handler and the demo's policy, which reads a clone (#250).
 */
export async function readCapped(request: Request): Promise<string | null> {
	if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
		return null;
	}
	if (!request.body) return "";
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();
		size += value.byteLength;
		if (size > MAX_BODY_BYTES) {
			// Not awaited: a clone's cancel settles only once the other branch is cancelled too.
			reader.cancel().catch(() => {});
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
}
