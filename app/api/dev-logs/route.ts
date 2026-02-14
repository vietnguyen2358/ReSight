import { NextRequest } from "next/server";
import { devLog, type DevLogEntry } from "@/lib/dev-logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sinceId = Number(searchParams.get("since") || "0");

  // JSON polling mode: return logs since a given ID
  if (searchParams.has("since")) {
    const history = devLog.getHistory();
    const newLogs = sinceId > 0 ? history.filter((e) => e.id > sinceId) : history;
    return Response.json(newLogs, {
      headers: { "Cache-Control": "no-cache" },
    });
  }

  // SSE streaming mode (original)
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const history = devLog.getHistory();
      for (const entry of history) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(entry)}\n\n`)
        );
      }

      const onLog = (entry: DevLogEntry) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(entry)}\n\n`)
          );
        } catch {
          devLog.off("log", onLog);
        }
      };

      devLog.on("log", onLog);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          devLog.off("log", onLog);
        }
      }, 10000);
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

export async function DELETE() {
  devLog.clear();
  return Response.json({ ok: true });
}
