"use client";

import { motion } from "framer-motion";

export function Visualizer({ isActive }: { isActive: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-[200px] h-[200px]">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute border border-amber-500/30 rounded-full"
          initial={{ width: 40 + i * 30, height: 40 + i * 30 }}
          animate={
            isActive
              ? {
                  scale: [1, 1.05 + i * 0.02, 1],
                  opacity: [0.3, 0.6, 0.3],
                  borderWidth: [1, 2, 1],
                }
              : {}
          }
          transition={{
            duration: 2 + i * 0.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      <div className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.8)]" />
    </div>
  );
}
