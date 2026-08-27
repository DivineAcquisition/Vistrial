import { type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  className?: string;
}

interface BentoCardProps {
  name: string;
  className: string;
  background: ReactNode;
  Icon: ElementType;
  description: string;
  href: string;
  cta: string;
}

function BentoGrid({ children, className, ...props }: BentoGridProps) {
  return (
    <div
      className={cn("grid w-full auto-rows-[22rem] grid-cols-3 gap-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function BentoCard({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta,
}: BentoCardProps) {
  return (
    <Card
      className={cn(
        "group relative col-span-3 flex flex-col justify-between overflow-hidden",
        className,
      )}
    >
      <div>{background}</div>
      <div className="p-4">
        <div className="pointer-events-none z-10 flex transform-gpu flex-col gap-1 transition-all duration-300 lg:group-hover:-translate-y-10">
          <Icon
            aria-hidden="true"
            className="size-10 origin-left text-primary transition-all duration-300 ease-in-out group-hover:scale-75"
          />
          <h3 className="font-heading text-xl font-semibold text-card-foreground">{name}</h3>
          <p className="max-w-lg text-muted-foreground">{description}</p>
        </div>

        <div className="pointer-events-none flex w-full flex-row items-center lg:hidden">
          <Button
            variant="link"
            size="sm"
            className="pointer-events-auto p-0"
            render={<a href={href} />}
          >
            {cta}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 hidden w-full translate-y-10 transform-gpu flex-row items-center p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 lg:flex">
        <Button
          variant="link"
          size="sm"
          className="pointer-events-auto p-0"
          render={<a href={href} />}
        >
          {cta}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}

export { BentoCard, BentoGrid };
