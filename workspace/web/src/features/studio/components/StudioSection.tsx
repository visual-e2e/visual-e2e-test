import type { ReactNode } from "react";

type SectionVariant = "config" | "steps" | "detail" | "json";

interface StudioSectionProps {
  title: string;
  variant: SectionVariant;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function StudioSection({ title, variant, extra, className, children }: StudioSectionProps) {
  return (
    <section className={`studio-section studio-section--${variant} ${className ?? ""}`}>
      <div className="studio-section__head">
        <span>{title}</span>
        {extra}
      </div>
      <div className="studio-section__body">{children}</div>
    </section>
  );
}
