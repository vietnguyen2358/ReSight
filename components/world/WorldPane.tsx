"use client";

import LiveFeed from "./LiveFeed";
import { useGideon } from "@/components/providers/GideonProvider";

export default function WorldPane() {
  const { activeAgent } = useGideon();

  return (
    <div className="flex flex-col h-full bg-gideon-dark relative">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-gideon-gray flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-gideon-green animate-pulse" />
          <span className="text-gideon-green text-xs font-mono uppercase tracking-widest">
            Ghost Mode — Live Feed
          </span>
        </div>
        <span className="text-gideon-cyan text-xs font-mono uppercase tracking-widest">
          Agent: {activeAgent || "None"}
        </span>
      </div>

      {/* Feed */}
      <div className="flex-1 relative overflow-hidden">
        <LiveFeed />
        <div className="scanlines" />
      </div>

      {/* Status bar */}
      <div className="flex-none px-4 py-2 border-t border-gideon-gray flex items-center justify-between">
        <span className="text-gideon-muted text-xs font-mono">
          Live capture stream
        </span>
        <span className="text-gideon-muted text-xs font-mono">
          Stagehand Browser Session
        </span>
      </div>
    </div>
  );
}
