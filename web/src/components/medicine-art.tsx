import { useId } from "react";

/**
 * Drawn medicine illustrations, chosen from the dosage form. A port of the mobile app's
 * painter: same 100×100 design space, same palettes and the same hash, so a medicine has the
 * same picture and colours on the phone and on the web.
 */

export type MedicineForm = "tablet" | "capsule" | "syrup" | "drops" | "injection" | "cream" | "inhaler" | "sachet" | "other";

export function medicineFormOf(dosageForm: string): MedicineForm {
  const f = dosageForm.toLowerCase();
  const has = (words: string[]) => words.some((w) => f.includes(w));
  if (has(["drop"])) return "drops";
  if (has(["capsule"])) return "capsule";
  if (has(["tablet", "caplet", "lozenge"])) return "tablet";
  if (has(["syrup", "suspension", "solution", "liquid", "elixir", "mixture"])) return "syrup";
  if (has(["inject", "vial", "ampoule", "ampule", "infusion"])) return "injection";
  if (has(["cream", "ointment", "gel", "lotion", "paste"])) return "cream";
  if (has(["inhal", "spray", "aerosol", "nebul"])) return "inhaler";
  if (has(["sachet", "powder", "granule"])) return "sachet";
  return "other";
}

export const FORM_ORDER: MedicineForm[] = ["tablet", "capsule", "syrup", "drops", "injection", "cream", "inhaler", "sachet", "other"];

export const formLabel: Record<MedicineForm, string> = {
  tablet: "Tablets",
  capsule: "Capsules",
  syrup: "Syrups",
  drops: "Drops",
  injection: "Injections",
  cream: "Creams",
  inhaler: "Inhalers",
  sachet: "Sachets",
  other: "Other",
};

type Palette = { bgTop: string; bgBottom: string; main: string; deep: string; light: string };

const PALETTES: Palette[] = [
  { bgTop: "#E3F5F1", bgBottom: "#C9ECE4", main: "#14B8A6", deep: "#0F766E", light: "#99F6E4" },
  { bgTop: "#E8F1FF", bgBottom: "#D2E3FF", main: "#3B82F6", deep: "#1D4ED8", light: "#BFDBFE" },
  { bgTop: "#FFEEE8", bgBottom: "#FFDCD0", main: "#F97362", deep: "#C2410C", light: "#FECACA" },
  { bgTop: "#FFF5E0", bgBottom: "#FFE7B8", main: "#F59E0B", deep: "#B45309", light: "#FDE68A" },
  { bgTop: "#F1ECFF", bgBottom: "#E1D8FF", main: "#8B5CF6", deep: "#6D28D9", light: "#DDD6FE" },
  { bgTop: "#FFECF2", bgBottom: "#FFD8E5", main: "#EC4899", deep: "#BE185D", light: "#FBCFE8" },
  { bgTop: "#E9F7EC", bgBottom: "#D1F0D9", main: "#22C55E", deep: "#15803D", light: "#BBF7D0" },
];

function stableHash(s: string) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) & 0x7fffffff) >>> 0;
  return h;
}

export const medicinePalette = (seed: string) => PALETTES[stableHash(seed) % PALETTES.length];

/** The seed both apps use, so colours match everywhere. */
export const artSeed = (p: { name: string; generic_name?: string }) => p.name + (p.generic_name ?? "");

function mix(hex: string, toward: string, t: number) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (n: number, s: number) => (n >> s) & 255;
  const c = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, "0")}`;
}

const WHITE = "#FFFFFF";
const SLATE = "#94A3B8";
const SLATE_LIGHT = "#CBD5E1";
const PAPER = "#F8FAFC";
const PAPER_SHADE = "#E2E8F0";

const DIAG = { x1: 0, y1: 0, x2: 1, y2: 1 };
const DOWN = { x1: 0, y1: 0, x2: 0, y2: 1 };
const ACROSS = { x1: 0, y1: 0, x2: 1, y2: 0 };

export function MedicineArt({
  dosageForm,
  seed,
  className = "",
  rounded = "rounded-2xl",
}: {
  dosageForm: string;
  seed: string;
  className?: string;
  rounded?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const p = medicinePalette(seed);
  const form = medicineFormOf(dosageForm);
  const oblong = stableHash(seed) % 2 === 1;
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  const grad = (name: string, stops: string[], dir: { x1: number; y1: number; x2: number; y2: number } = DIAG) => (
    <linearGradient key={name} id={id(name)} {...dir}>
      {stops.map((c, i) => (
        <stop key={i} offset={stops.length === 1 ? 0 : i / (stops.length - 1)} stopColor={c} />
      ))}
    </linearGradient>
  );

  const plus = (x: number, y: number, size: number, color: string) => {
    const w = size * 0.34;
    return (
      <g fill={color}>
        <rect x={x - w / 2} y={y - size / 2} width={w} height={size} rx={w * 0.3} />
        <rect x={x - size / 2} y={y - w / 2} width={size} height={w} rx={w * 0.3} />
      </g>
    );
  };

  const pill = (x: number, y: number, r: number, key?: string) => {
    const w = oblong ? r * 2.3 : r * 2;
    const h = oblong ? r * 1.25 : r * 2;
    const rx = Math.min(w, h) / 2;
    const d = r * 0.16;
    return (
      <g key={key} filter={url("soft")}>
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={rx} fill={url("pill")} />
        <rect
          x={x - w / 2 + d}
          y={y - h / 2 + d}
          width={w - 2 * d}
          height={h - 2 * d}
          rx={Math.max(rx - d, 0)}
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={r * 0.1}
        />
        <line x1={x} y1={y - h * 0.32} x2={x} y2={y + h * 0.32} stroke={p.deep} strokeOpacity={0.35} strokeWidth={r * 0.12} strokeLinecap="round" />
        <circle cx={x - w * 0.22} cy={y - h * 0.22} r={r * 0.16} fill="rgba(255,255,255,0.75)" />
      </g>
    );
  };

  const capsule = (cx: number, cy: number, len: number, t: number, deg: number) => {
    const half = `M0.6,${-t / 2} H${len / 2 - t / 2} A${t / 2},${t / 2} 0 0 1 ${len / 2 - t / 2},${t / 2} H0.6 Z`;
    return (
      <g transform={`translate(${cx} ${cy}) rotate(${deg})`} filter={url("shadow")}>
        <rect x={-len / 2} y={-t / 2} width={len} height={t} rx={t / 2} fill={url("capColor")} />
        <path d={half} fill={url("capWhite")} />
        <line x1={0.6} y1={-t / 2 + 1} x2={0.6} y2={t / 2 - 1} stroke={p.deep} strokeOpacity={0.35} strokeWidth={0.9} />
        <rect x={-len * 0.36} y={-t * 0.32} width={len * 0.72} height={t * 0.16} rx={t * 0.1} fill="rgba(255,255,255,0.6)" />
      </g>
    );
  };

  const drop = (x: number, y: number, r: number) =>
    `M${x},${y - 1.8 * r} C${x + 0.3 * r},${y - 1.1 * r} ${x + r},${y - 0.5 * r} ${x + r},${y + 0.15 * r} A${r},${r} 0 0 1 ${x - r},${y + 0.15 * r} C${x - r},${y - 0.5 * r} ${x - 0.3 * r},${y - 1.1 * r} ${x},${y - 1.8 * r} Z`;

  const sachetPath = (() => {
    const w = 22, h = 31, tooth = 2.4;
    let d = `M${-w},${-h + tooth}`;
    for (let x = -w; x < w - 0.1; x += 4) d += ` L${x + 2},${-h} L${x + 4},${-h + tooth}`;
    d += ` L${w},${h - tooth}`;
    for (let x = w; x > -w + 0.1; x -= 4) d += ` L${x - 2},${h} L${x - 4},${h - tooth}`;
    return d + " Z";
  })();

  const sachet = (cx: number, cy: number, deg: number, back: boolean) => (
    <g transform={`translate(${cx} ${cy}) rotate(${deg})`}>
      <path d={sachetPath} fill={url(back ? "sachetBack" : "sachetFront")} filter={url("shadow")} />
      <g clipPath={url("sachetClip")}>
        <rect x={-22} y={-31} width={44} height={6} fill="rgba(255,255,255,0.18)" />
        <rect x={-22} y={25} width={44} height={6} fill="rgba(255,255,255,0.18)" />
        <rect x={-19} y={-23} width={3} height={46} fill="rgba(255,255,255,0.2)" />
      </g>
      {!back && (
        <>
          <circle cx={0} cy={2} r={11.5} fill={WHITE} />
          {plus(0, 2, 11, p.main)}
        </>
      )}
    </g>
  );

  const ticks = (xs: number[], y1: number, y2: number, color: string, width: number) =>
    xs.map((x) => <line key={x} x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />);
  const range = (from: number, to: number, step: number) => {
    const out: number[] = [];
    for (let x = from; step > 0 ? x <= to + 1e-6 : x >= to - 1e-6; x += step) out.push(x);
    return out;
  };

  let body: React.ReactNode;
  switch (form) {
    case "tablet":
      body = (
        <>
          <g transform="translate(44 46) rotate(-12.6)">
            <rect x={-25} y={-33} width={50} height={66} rx={8} fill={url("card")} stroke={SLATE_LIGHT} strokeWidth={0.8} filter={url("shadow")} />
            {[0, 1, 2].flatMap((row) =>
              [0, 1].map((col) => {
                const x = col === 0 ? -11.5 : 11.5;
                const y = (row - 1) * 20;
                return (
                  <g key={`${row}-${col}`}>
                    {oblong ? (
                      <rect x={x - 9.5} y={y - 6} width={19} height={12} rx={6} fill={PAPER} stroke={SLATE_LIGHT} strokeWidth={0.7} />
                    ) : (
                      <circle cx={x} cy={y} r={8.5} fill={PAPER} stroke={SLATE_LIGHT} strokeWidth={0.7} />
                    )}
                    {!(row === 2 && col === 1) && pill(x, y, 6.6)}
                  </g>
                );
              }),
            )}
          </g>
          {pill(76, 76, 11)}
        </>
      );
      break;
    case "capsule":
      body = (
        <>
          {capsule(44, 40, 62, 23, -35.5)}
          {capsule(60, 68, 54, 20, 16)}
        </>
      );
      break;
    case "syrup":
      body = (
        <>
          <g filter={url("shadow")}>
            <path d="M62 64 L86 64 L83 90 Q82.5 92 80 92 L68 92 Q65.5 92 65 90 Z" fill="rgba(255,255,255,0.9)" />
          </g>
          <rect x={60} y={76} width={30} height={18} fill={url("liquid")} clipPath={url("cupClip")} />
          <path d="M62 64 L86 64 L83 90 Q82.5 92 80 92 L68 92 Q65.5 92 65 90 Z" fill="none" stroke={SLATE} strokeWidth={0.9} />
          {[70, 75, 80].map((y) => (
            <line key={y} x1={79} y1={y} x2={83} y2={y} stroke={SLATE} strokeWidth={0.8} strokeLinecap="round" />
          ))}
          <g filter={url("shadow")} fill={url("glass")}>
            <rect x={31} y={18} width={16} height={16} rx={3} />
            <path d="M31 30 L47 30 C56 32 60 36 60 44 L60 86 Q60 92 54 92 L24 92 Q18 92 18 86 L18 44 C18 36 22 32 31 30 Z" />
          </g>
          <rect x={22} y={42} width={4} height={44} rx={2} fill="rgba(255,255,255,0.28)" />
          <rect x={28.5} y={8} width={21} height={13} rx={3} fill={url("cap")} />
          {ticks(range(32, 46, 3.5), 10.5, 18.5, "rgba(255,255,255,0.28)", 0.9)}
          <rect x={22} y={52} width={34} height={28} rx={4} fill={WHITE} />
          <rect x={22} y={52} width={34} height={6} fill={p.main} clipPath={url("labelClip")} />
          {plus(39, 68.5, 10, p.main)}
        </>
      );
      break;
    case "drops":
      body = (
        <>
          <path d="M33 38 L38.5 15 Q41 9 43.5 15 L49 38 Z" fill={url("tip")} stroke={SLATE_LIGHT} strokeWidth={0.7} />
          <rect x={28} y={34} width={26} height={12} rx={2.5} fill={url("mainDeep")} />
          <rect x={22} y={44} width={38} height={48} rx={9} fill={url("bodyWhite")} stroke={SLATE_LIGHT} strokeWidth={0.6} filter={url("shadow")} />
          <rect x={22} y={58} width={38} height={22} fill={url("mainDeep")} clipPath={url("dropBodyClip")} />
          {plus(41, 69, 9, WHITE)}
          <rect x={26} y={48} width={3.5} height={40} rx={2} fill="rgba(255,255,255,0.8)" />
          {(
            [
              [74, 30, 6],
              [80, 52, 4.6],
              [73, 70, 3.6],
            ] as const
          ).map(([x, y, r]) => (
            <g key={`${x}`}>
              <path d={drop(x, y, r)} fill={url("drop")} filter={url("soft")} />
              <circle cx={x - r * 0.35} cy={y - r * 0.1} r={r * 0.22} fill="rgba(255,255,255,0.8)" />
            </g>
          ))}
        </>
      );
      break;
    case "injection":
      body = (
        <>
          <rect x={19} y={30} width={16} height={12} rx={2} fill={PAPER_SHADE} />
          <rect x={14} y={40} width={26} height={50} rx={6} fill="rgba(255,255,255,0.85)" filter={url("shadow")} />
          <rect x={15.5} y={58} width={23} height={30.5} rx={5} fill={url("vialLiquid")} />
          <rect x={14} y={40} width={26} height={50} rx={6} fill="none" stroke={SLATE_LIGHT} strokeWidth={0.9} />
          <rect x={16} y={21} width={22} height={12} rx={3} fill={url("metal")} />
          <rect x={20} y={16} width={14} height={6} rx={2} fill={p.deep} />
          <rect x={14} y={64} width={26} height={12} fill="rgba(255,255,255,0.92)" />
          <line x1={18} y1={70} x2={36} y2={70} stroke={p.main} strokeWidth={1.6} strokeLinecap="round" />
          <rect x={18} y={44} width={3} height={42} rx={1.5} fill="rgba(255,255,255,0.9)" />
          <g transform="translate(70 52) rotate(-57.3)">
            <rect x={-22} y={-7} width={37} height={14} rx={2.5} fill="rgba(255,255,255,0.92)" filter={url("shadow")} />
            <rect x={-40} y={-2.2} width={19} height={4.4} rx={1} fill={SLATE_LIGHT} />
            <rect x={-43} y={-9} width={4.5} height={18} rx={1.6} fill={url("mainDeep")} />
            <rect x={-4} y={-5.6} width={17.6} height={11.2} rx={1.6} fill={p.main} fillOpacity={0.55} />
            <rect x={-6} y={-6.4} width={3} height={12.8} rx={1} fill={p.deep} />
            <rect x={-22} y={-7} width={37} height={14} rx={2.5} fill="none" stroke={SLATE} strokeWidth={0.9} />
            {ticks(range(-18, 10, 4), -7, -3.4, SLATE, 0.7)}
            <rect x={-25} y={-12} width={3.5} height={24} rx={1.4} fill={SLATE_LIGHT} />
            <rect x={15} y={-3.4} width={5.5} height={6.8} rx={1} fill={SLATE} />
            <line x1={20} y1={0} x2={38} y2={0} stroke={SLATE} strokeWidth={1.3} strokeLinecap="round" />
          </g>
        </>
      );
      break;
    case "cream":
      body = (
        <g transform="translate(50 52) rotate(-28.6)">
          <path d="M-32 -18 L15 -13.5 Q24 -12.5 24 -6 L24 6 Q24 12.5 15 13.5 L-32 18 Z" fill={url("tube")} filter={url("shadow")} />
          <g clipPath={url("tubeClip")}>
            <rect x={-20} y={-20} width={26} height={40} fill={url("mainDeepDown")} />
            <rect x={9} y={-20} width={2.5} height={40} fill={p.main} />
            <rect x={-34} y={-14} width={58} height={3.5} fill="rgba(255,255,255,0.35)" />
          </g>
          {plus(-7, 0, 10, WHITE)}
          <rect x={-37} y={-19.5} width={8} height={39} rx={1.5} fill={url("crimp")} />
          {ticks([-35, -33, -31], -18, 18, "rgba(148,163,184,0.6)", 0.6)}
          <rect x={24} y={-9} width={14} height={18} rx={2.5} fill={url("capDown")} />
          {ticks(range(27, 35, 2.6), -7, 7, "rgba(255,255,255,0.3)", 0.8)}
        </g>
      );
      break;
    case "inhaler":
      body = (
        <>
          <rect x={33} y={10} width={22} height={36} rx={5} fill={url("canister")} />
          <rect x={32} y={8} width={24} height={6} rx={3} fill={SLATE} />
          <g fill={url("boot")} filter={url("shadow")}>
            <rect x={28} y={32} width={32} height={56} rx={10} />
            <rect x={42} y={66} width={42} height={22} rx={9} />
          </g>
          <rect x={32} y={38} width={4} height={42} rx={2} fill="rgba(255,255,255,0.3)" />
          <rect x={78} y={70} width={5} height={14} rx={2.5} fill={p.deep} fillOpacity={0.9} />
          <rect x={28} y={32} width={32} height={5} rx={2.5} fill={p.deep} fillOpacity={0.35} />
          {(
            [
              [90, 70, 3.6],
              [94, 62, 2.8],
              [89, 57, 2],
            ] as const
          ).map(([x, y, r]) => (
            <circle key={x + y} cx={x} cy={y} r={r} fill="rgba(255,255,255,0.85)" />
          ))}
        </>
      );
      break;
    case "sachet":
      body = (
        <>
          {sachet(60, 44, 13.75, true)}
          {sachet(42, 56, -6.9, false)}
        </>
      );
      break;
    default:
      body = (
        <>
          <rect x={26} y={34} width={40} height={56} rx={9} fill={url("bodyWhite")} filter={url("shadow")} />
          <rect x={23} y={16} width={46} height={20} rx={5} fill={url("capDown")} />
          {ticks(range(28, 64, 4), 19, 33, "rgba(255,255,255,0.25)", 1)}
          <rect x={26} y={50} width={40} height={26} fill={p.light} />
          {plus(46, 63, 12, p.deep)}
          {pill(80, 82, 9)}
        </>
      );
  }

  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{ background: `linear-gradient(135deg, ${p.bgTop}, ${p.bgBottom})` }}
      aria-hidden
    >
      <div className="absolute rounded-full bg-white/40" style={{ width: "60%", aspectRatio: "1", right: "-18%", top: "-20%" }} />
      <div className="absolute rounded-full bg-white/30" style={{ width: "40%", aspectRatio: "1", left: "-12%", bottom: "-15%" }} />
      <svg viewBox="-9.5 -9.5 119 119" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id={id("shadow")} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx={1} dy={3.5} stdDeviation={3} floodColor="#0F172A" floodOpacity={0.16} />
          </filter>
          <filter id={id("soft")} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx={0} dy={1.5} stdDeviation={1.6} floodColor="#0F172A" floodOpacity={0.15} />
          </filter>
          {grad("pill", [mix(p.light, WHITE, 0.2), p.main])}
          {grad("card", [WHITE, PAPER_SHADE])}
          {grad("capColor", [mix(p.main, WHITE, 0.25), p.main, p.deep], DOWN)}
          {grad("capWhite", [WHITE, PAPER, SLATE_LIGHT], DOWN)}
          {grad("liquid", [p.main, p.deep])}
          {grad("cap", [mix(p.main, WHITE, 0.2), p.deep])}
          {grad("capDown", [mix(p.main, WHITE, 0.15), p.deep], DOWN)}
          {grad("tip", [WHITE, SLATE_LIGHT], ACROSS)}
          {grad("mainDeep", [p.main, p.deep])}
          {grad("mainDeepDown", [p.main, p.deep], DOWN)}
          {grad("bodyWhite", [WHITE, PAPER, PAPER_SHADE], ACROSS)}
          {grad("drop", [mix(p.main, WHITE, 0.25), p.deep])}
          {grad("vialLiquid", [p.light, p.main], DOWN)}
          {grad("metal", [PAPER, SLATE_LIGHT, SLATE], DOWN)}
          {grad("tube", [WHITE, PAPER, PAPER_SHADE], DOWN)}
          {grad("crimp", [PAPER, SLATE_LIGHT])}
          {grad("canister", [SLATE_LIGHT, PAPER, SLATE], ACROSS)}
          {grad("sachetFront", [mix(p.main, WHITE, 0.1), p.deep])}
          {grad("sachetBack", [p.light, mix(p.light, p.main, 0.5)])}
          <linearGradient id={id("glass")} gradientUnits="userSpaceOnUse" x1={18} y1={0} x2={60} y2={0}>
            <stop offset={0} stopColor="#E59A3A" />
            <stop offset={0.5} stopColor="#B45309" />
            <stop offset={1} stopColor="#7C2D12" />
          </linearGradient>
          <linearGradient id={id("boot")} gradientUnits="userSpaceOnUse" x1={28} y1={32} x2={84} y2={88}>
            <stop offset={0} stopColor={mix(p.main, WHITE, 0.15)} />
            <stop offset={1} stopColor={p.deep} />
          </linearGradient>
          <clipPath id={id("cupClip")}>
            <path d="M62 64 L86 64 L83 90 Q82.5 92 80 92 L68 92 Q65.5 92 65 90 Z" />
          </clipPath>
          <clipPath id={id("labelClip")}>
            <rect x={22} y={52} width={34} height={28} rx={4} />
          </clipPath>
          <clipPath id={id("dropBodyClip")}>
            <rect x={22} y={44} width={38} height={48} rx={9} />
          </clipPath>
          <clipPath id={id("tubeClip")}>
            <path d="M-32 -18 L15 -13.5 Q24 -12.5 24 -6 L24 6 Q24 12.5 15 13.5 L-32 18 Z" />
          </clipPath>
          <clipPath id={id("sachetClip")}>
            <path d={sachetPath} />
          </clipPath>
        </defs>
        {body}
      </svg>
    </div>
  );
}
