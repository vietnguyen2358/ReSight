"use client";

import MindPane from "@/components/mind/MindPane";
import WorldPane from "@/components/world/WorldPane";

export default function SplitLayout() {
  return (
    <div className="flex h-screen w-screen">
      <div className="w-1/2 h-full border-r border-gideon-gray">
        <MindPane />
      </div>
      <div className="w-1/2 h-full">
        <WorldPane />
      </div>
    </div>
  );
}
