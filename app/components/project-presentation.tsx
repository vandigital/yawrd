/** Shared with the Creation Builder; the existing gradient is the cover fallback. */
export function ProjectCover({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`preview-art border-b border-white/[0.08] ${className}`} />;
}

export function ProjectHeading({ name, description, variant = "preview" }: {
  name: string;
  description: string;
  variant?: "preview" | "public";
}) {
  const titleClass = "text-[clamp(1.9rem,3vw,3rem)] leading-[1.08] font-medium tracking-[-0.06em] text-[#e7f2ed]";
  return <>
    {variant === "public"
      ? <h1 className={`${titleClass} break-words sm:text-6xl`}>{name}</h1>
      : <p className={titleClass}>{name}</p>}
    <p className={`mt-3 text-sm leading-7 text-[#a8c0b8] ${variant === "public" ? "break-words sm:text-base" : ""}`}>{description}</p>
  </>;
}
