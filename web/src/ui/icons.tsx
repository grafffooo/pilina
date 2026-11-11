// Stroke icons (24 × 24 grid), decorative unless given a label by the parent.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
export const UndoIcon = (p: IconProps) => (
  <Icon data-flip-rtl {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
);
export const RedoIcon = (p: IconProps) => (
  <Icon data-flip-rtl {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon strokeWidth={2.4} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
export const MoreIcon = (p: IconProps) => (
  <Icon fill="currentColor" stroke="none" {...p}>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </Icon>
);
export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </Icon>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon data-flip-rtl strokeWidth={2} {...p}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon data-flip-rtl strokeWidth={2} {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
export const MinusIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M5 12h14" />
  </Icon>
);
export const ExpandIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
);
export const CollapseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </Icon>
);
export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);
export const WarningIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);
export const PartsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Icon>
);
export const SheetIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M10 3v18M10 10h10" />
  </Icon>
);
/** A circular saw blade: ten teeth around a disc with an arbor hole. */
export const SawIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M12.00 3.60L13.53 1.11L14.32 3.93A8.4 8.4 0 0 1 16.94 5.20L16.94 5.20L19.64 4.09L18.62 6.83A8.4 8.4 0 0 1 19.99 9.40L19.99 9.40L22.83 10.09L20.39 11.71A8.4 8.4 0 0 1 19.99 14.60L19.99 14.60L21.89 16.82L18.96 16.70A8.4 8.4 0 0 1 16.94 18.80L16.94 18.80L17.16 21.71L14.87 19.89A8.4 8.4 0 0 1 12.00 20.40L12.00 20.40L10.47 22.89L9.68 20.07A8.4 8.4 0 0 1 7.06 18.80L7.06 18.80L4.36 19.91L5.38 17.17A8.4 8.4 0 0 1 4.01 14.60L4.01 14.60L1.17 13.91L3.61 12.29A8.4 8.4 0 0 1 4.01 9.40L4.01 9.40L2.11 7.18L5.04 7.30A8.4 8.4 0 0 1 7.06 5.20L7.06 5.20L6.84 2.29L9.13 4.11A8.4 8.4 0 0 1 12.00 3.60Z"
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="2.2" strokeWidth={1.6} />
  </Icon>
);
export const LogoIcon = ({ size = 28 }: { size?: number }) => (
  <img src={`${import.meta.env.BASE_URL}icon.svg`} width={size} height={size} alt="" />
);
export const PriceIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </Icon>
);
export const ScanIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h3v3H8zM13 13h3v3h-3zM13 9h3M8 15h2" />
  </Icon>
);
export const CloudIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />
  </Icon>
);
export const ShareIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15V3M8 7l4-4 4 4M7 11H5v10h14V11h-2" />
  </Icon>
);
export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.3 1.3" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3" />
  </Icon>
);
export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6" />
  </Icon>
);
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </Icon>
);
export const ImportIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
    <path d="M14 3v5h5M12 11v6M9 14l3 3 3-3" />
  </Icon>
);
export const OffcutsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="11" height="7" rx="1" />
    <rect x="3" y="14" width="18" height="6" rx="1" />
    <rect x="16" y="4" width="5" height="7" rx="1" />
  </Icon>
);
export const PlayIcon = (p: IconProps) => (
  <Icon fill="currentColor" stroke="none" {...p}>
    <path d="M7 4v16l13-8z" />
  </Icon>
);
export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);
