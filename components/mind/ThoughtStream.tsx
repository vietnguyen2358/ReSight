"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReSight } from "@/components/providers/ReSightProvider";

export default function ThoughtStream() {
  const { thoughts } = useReSight();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thoughts]);

  return (
    <div className="h-full overflow-y-auto px-2 py-2 font-mono text-sm">
      <div className="text-resight-muted text-xs uppercase tracking-widest mb-2">
        Thought Stream
      </div>

      <AnimatePresence mode="popLayout">
        {thoughts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-1 leading-relaxed"
          >
            <span className="text-resight-cyan">[{t.agent}]</span>{" "}
            <span className="text-resight-yellow">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>

      <div ref={bottomRef} />
    </div>
  );
}
