import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { navigatorFallbackAgent } from "@/lib/agents/navigator";
import { thoughtEmitter } from "@/lib/thought-stream/emitter";

function sendThought(agent: string, message: string) {
  thoughtEmitter.sendThought(agent, message);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instruction } = body;

    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json(
        { error: "Missing 'instruction' field" },
        { status: 400 }
      );
    }

    const result = await runOrchestrator(instruction);
    if (!result.success) {
      sendThought("Orchestrator", "Primary orchestration failed, switching to fallback navigation");
      const fallback = await navigatorFallbackAgent(instruction, sendThought);
      return NextResponse.json(fallback, { status: fallback.success ? 200 : 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: errorMsg, success: false },
      { status: 500 }
    );
  }
}
