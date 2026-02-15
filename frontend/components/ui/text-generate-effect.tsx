"use client";

import { useEffect, useState } from "react";
import { motion, stagger, useAnimate } from "framer-motion";
import { cn } from "./cn";

export function TextGenerateEffect({
  words,
  className,
  filter = true,
  duration = 0.3,
}: {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
}) {
  const [scope, animate] = useAnimate();
  const [rendered, setRendered] = useState(false);
  const wordsArray = words.split(" ");

  useEffect(() => {
    if (rendered) return;
    animate(
      "span",
      {
        opacity: 1,
        filter: filter ? "blur(0px)" : "none",
      },
      {
        duration,
        delay: stagger(0.02),
      }
    );
    setRendered(true);
  }, [animate, rendered, filter, duration]);

  return (
    <div ref={scope} className={cn("", className)}>
      {wordsArray.map((word, idx) => (
        <motion.span
          key={word + idx}
          className="inline-block"
          style={{
            opacity: 0,
            filter: filter ? "blur(8px)" : "none",
          }}
        >
          {word}{" "}
        </motion.span>
      ))}
    </div>
  );
}
