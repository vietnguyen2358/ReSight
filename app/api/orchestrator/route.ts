import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/agents/orchestrator";

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
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: errorMsg, success: false },
      { status: 500 }
    );
  }
}
