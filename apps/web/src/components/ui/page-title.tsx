import { forwardRef, useId } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageTitleProps extends React.ComponentPropsWithoutRef<"div"> {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}

const GRADIENT = "linear-gradient(90deg, #002ABD, #00D4FF)";

export const PageTitle = forwardRef<HTMLDivElement, PageTitleProps>(
  ({ title, subtitle, icon: Icon, className, ...rest }, ref) => {
    const uid = useId();
    const gradientId = `pt-grad-${uid}`;

    return (
      <div ref={ref} className={cn("flex items-start gap-2.5", className)} {...rest}>
        {Icon && (
          <>
            <svg width="0" height="0" className="absolute" aria-hidden="true">
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#002ABD" />
                  <stop offset="100%" stopColor="#00D4FF" />
                </linearGradient>
              </defs>
            </svg>
            <Icon
              aria-hidden="true"
              focusable="false"
              className="mt-0.5 h-5 w-5 shrink-0 md:h-5 md:w-5 max-md:h-4 max-md:w-4"
              style={{ stroke: `url(#${gradientId})` }}
            />
          </>
        )}

        <div>
          {/* Title + underline wrapper: inline-flex so underline matches title width */}
          <div className="inline-flex flex-col">
            <h1 className="text-[22px] font-bold leading-tight text-white md:text-[28px]">
              {title}
            </h1>
            {/* 2px gradient underline, 8px below title */}
            <div
              className="mt-2 h-0.5 w-full rounded-full"
              style={{ background: GRADIENT }}
            />
          </div>

          {/* Subtitle: 4px below underline */}
          {subtitle && (
            <p className="mt-1 text-xs font-normal" style={{ color: "#3F4754" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }
);

PageTitle.displayName = "PageTitle";
