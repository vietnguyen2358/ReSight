import { NextRequest, NextResponse } from "next/server";
import {
  getPendingQuestion,
  answerQuestion,
} from "@/lib/agents/clarification";

// GET — poll for pending question
export async function GET() {
  const pending = getPendingQuestion();
  if (!pending) {
    return NextResponse.json({ question: null });
  }
  return NextResponse.json(pending);
}

// POST — submit answer to pending question
export async function POST(req: NextRequest) {
  const { answer } = await req.json();
  if (!answer) {
    return NextResponse.json({ error: "answer is required" }, { status: 400 });
  }
  const resolved = answerQuestion(answer);
  return NextResponse.json({ ok: resolved });
}
