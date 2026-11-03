import type { SVGProps } from "react";

/** Current site brand artwork. Keep the default avatar glyph separate below. */
export function YawrdBrandIcon({ className = "" }: { className?: string }) {
  return <img src="/brand/yawrd-buoy.webp" width={159} height={192} alt="" className={`object-contain ${className}`} />;
}

type BuoyMarkProps = SVGProps<SVGSVGElement> & {
  primary?: string;
  accent?: string;
  title?: string;
};

/** The shared Yawrd buoy glyph, sized by its className or SVG width and height. */
export function BuoyMark({
  primary = "#3d8c8a",
  accent = "#c2dedd",
  title,
  ...props
}: BuoyMarkProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title && <title>{title}</title>}
      <circle cx="24" cy="7" r="4" stroke={accent} strokeWidth="3" />
      <path d="M24 11v4" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      <rect x="11" y="15" width="26" height="29" rx="12" fill={primary} />
      <path d="M13 29c4-2.8 7-2.8 11 0s7 2.8 11 0" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export const avatarVariants = {
  sea: { background: "#183732", primary: "#3d8c8a", accent: "#c2dedd", rim: "#4e827b" },
  tide: { background: "#192f43", primary: "#4e9ab6", accent: "#d3e9ef", rim: "#4c7791" },
  kelp: { background: "#283b2b", primary: "#6f9e72", accent: "#e0edca", rim: "#64856a" },
  coral: { background: "#45302e", primary: "#cf8177", accent: "#f5d4c8", rim: "#a56964" },
  amber: { background: "#43392a", primary: "#c99b58", accent: "#f3e3bc", rim: "#92784b" },
  lilac: { background: "#352e44", primary: "#9f8ac2", accent: "#e8dcf4", rim: "#75658f" },
} as const;

export type AvatarVariant = keyof typeof avatarVariants;

type YawrdAvatarProps = {
  variant: AvatarVariant;
  label: string;
  size?: number;
  className?: string;
};

/** A future user avatar preset; no account or profile state is attached. */
export function YawrdAvatar({ variant, label, size = 40, className }: YawrdAvatarProps) {
  const colors = avatarVariants[variant];

  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border ${className ?? ""}`}
      style={{ width: size, height: size, backgroundColor: colors.background, borderColor: colors.rim }}
    >
      <BuoyMark width="72%" height="72%" primary={colors.primary} accent={colors.accent} />
    </span>
  );
}
