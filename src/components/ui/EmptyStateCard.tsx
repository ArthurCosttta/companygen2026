import * as React from "react";
import { cn } from "@/lib/utils";
import { ActionButton, type ActionButtonProps } from "./ActionButton";

export interface EmptyStateCardProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaIcon?: React.ReactNode;
  ctaVariant?: ActionButtonProps["variant"];
  ctaSize?: ActionButtonProps["size"];
  ctaLoading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryIcon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyStateCard({
  icon,
  title,
  description,
  ctaLabel,
  onCta,
  ctaIcon,
  ctaVariant = "primary",
  ctaSize = 48,
  ctaLoading = false,
  secondaryLabel,
  onSecondary,
  secondaryIcon,
  children,
  className,
}: EmptyStateCardProps) {
  return (
    <section
      className={cn(
        "mx-auto flex w-full max-w-lg flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm",
        className
      )}
    >
      {icon ? (
        <div
          className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}

      <h3 className="text-lg font-semibold tracking-tight text-[#0F172A]">
        {title}
      </h3>

      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      ) : null}

      {ctaLabel && onCta ? (
        <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
          <ActionButton
            variant={ctaVariant}
            size={ctaSize}
            leftIcon={ctaIcon}
            isLoading={ctaLoading}
            fullWidth
            onClick={onCta}
          >
            {ctaLabel}
          </ActionButton>

          {secondaryLabel && onSecondary ? (
            <ActionButton
              variant="secondary"
              size={44}
              leftIcon={secondaryIcon}
              fullWidth
              onClick={onSecondary}
            >
              {secondaryLabel}
            </ActionButton>
          ) : null}
        </div>
      ) : secondaryLabel && onSecondary ? (
        <div className="mt-6 w-full max-w-sm">
          <ActionButton
            variant="secondary"
            size={44}
            leftIcon={secondaryIcon}
            fullWidth
            onClick={onSecondary}
          >
            {secondaryLabel}
          </ActionButton>
        </div>
      ) : null}

      {children ? <div className="mt-4 w-full">{children}</div> : null}
    </section>
  );
}

export interface SkeletonBlockProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}

const ROUNDED_MAP: Record<NonNullable<SkeletonBlockProps["rounded"]>, string> = {
  sm: "rounded",
  md: "rounded-lg",
  lg: "rounded-xl",
  xl: "rounded-2xl",
  full: "rounded-full",
};

export function SkeletonBlock({
  className,
  width,
  height,
  rounded = "lg",
}: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
      className={cn(
        "animate-pulse bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80",
        ROUNDED_MAP[rounded],
        className
      )}
    />
  );
}

export interface SkeletonTableRowsProps {
  rows?: number;
  columns?: number;
  rowHeight?: number;
  className?: string;
}

export function SkeletonTableRows({
  rows = 4,
  columns = 4,
  rowHeight = 56,
  className,
}: SkeletonTableRowsProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando dados"
      className={cn("w-full space-y-2.5", className)}
    >
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          style={{ minHeight: `${rowHeight}px` }}
          className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3"
        >
          {Array.from({ length: columns }).map((__, colIdx) => (
            <SkeletonBlock
              key={colIdx}
              className={cn(
                "h-4",
                colIdx === 0 ? "flex-[2]" : "flex-1"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
