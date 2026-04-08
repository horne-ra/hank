export function HankLogo({ centered = false }: { centered?: boolean }) {
  return (
    <div className={`flex flex-col ${centered ? "items-center" : "items-start"}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <div className="w-4 h-4 bg-amber-500" />
        <h1 className="text-xl font-bold tracking-tight text-white">Hank</h1>
      </div>
      <p className="text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-bold">
        Ask the old man.
      </p>
    </div>
  );
}
