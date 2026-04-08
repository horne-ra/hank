type Props = {
  title: string;
  items: string[];
};

export function SummarySection({ title, items }: Props) {
  if (items.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3 font-bold">
        {title}
      </h2>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={`${item}-${i}`}
            className="text-neutral-200 text-sm pl-4 border-l-2 border-amber-500"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
