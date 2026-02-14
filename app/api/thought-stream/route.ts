import { thoughtEmitter, type ThoughtEvent } from "@/lib/thought-stream/emitter";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send history first
      const history = thoughtEmitter.getHistory();
      for (const event of history) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }

      // Listen for new thoughts
      const onThought = (event: ThoughtEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Stream closed
          thoughtEmitter.off("thought", onThought);
        }
      };

      thoughtEmitter.on("thought", onThought);

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          thoughtEmitter.off("thought", onThought);
        }
      }, 15000);

      // Cleanup when client disconnects (via AbortSignal)
      // The controller.close will be called when the response is cancelled
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
