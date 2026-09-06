"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Menu,
  MenuCreateHandle,
  MenuGroup,
  MenuGroupLabel,
  MenuLinkItem,
  MenuPopup,
  MenuTrigger,
} from "@/components/ui/menu";
import { NAV } from "@/lib/marketing/copy";
import { marketingNavLink } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

type Product = (typeof NAV.products)[number];

function hashHref(hash: string, onPage: boolean) {
  return onPage ? hash : `/${hash}`;
}

function useActiveProduct(onPage: boolean) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!onPage) return;

    const regions = NAV.products.flatMap((product) =>
      product.regionIds.map((id) => ({ id, productId: product.id })),
    );
    const productByRegion = new Map(regions.map((region) => [region.id, region.productId]));
    const nodes = regions
      .map((region) => document.getElementById(region.id))
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) {
          setActiveId(null);
          return;
        }
        visible.sort(
          (a, b) => Math.abs(a.boundingClientRect.top - 140) - Math.abs(b.boundingClientRect.top - 140),
        );
        const id = visible[0]?.target.id;
        setActiveId(id ? (productByRegion.get(id) ?? null) : null);
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: [0, 0.2, 0.5, 1] },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [onPage]);

  return activeId;
}

function ProductDropdown({
  product,
  onPage,
  active,
  handle,
}: {
  product: Product;
  onPage: boolean;
  active: boolean;
  handle: ReturnType<typeof MenuCreateHandle>;
}) {
  return (
    <Menu handle={handle}>
      <MenuTrigger
        openOnHover
        delay={75}
        closeDelay={180}
        className={cn(
          marketingNavLink,
          "inline-flex items-center gap-1",
          active && "text-white",
        )}
        aria-current={active ? "true" : undefined}
      >
        {product.label}
        <ChevronDown className="size-3.5 opacity-70 transition-transform duration-200 in-data-popup-open:rotate-180" />
      </MenuTrigger>
      <MenuPopup
        align="start"
        sideOffset={10}
        className="w-[22rem] border-white/10 bg-ink-900 text-white shadow-[0_24px_80px_-28px_rgba(0,0,0,0.95)]"
      >
        <MenuGroup>
          <MenuGroupLabel className="px-3 pt-2 pb-1 text-xs font-medium text-silver">
            {product.header}
          </MenuGroupLabel>
          {product.items.map((item) => (
            <MenuLinkItem
              key={item.href}
              href={hashHref(item.href, onPage)}
              label={item.label}
              className="min-h-0 cursor-pointer items-start px-3 py-2.5 text-white data-highlighted:bg-white/[0.06] data-highlighted:text-white"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-[13px] leading-snug font-normal text-silver">
                  {item.description}
                </span>
              </span>
            </MenuLinkItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

export function MarketingNav({ onPage }: { onPage: boolean }) {
  const activeId = useActiveProduct(onPage);
  const salesHandle = useMemo(() => MenuCreateHandle(), []);
  const forsightHandle = useMemo(() => MenuCreateHandle(), []);

  useEffect(() => {
    function close() {
      salesHandle.close();
      forsightHandle.close();
    }
    window.addEventListener("scroll", close, { passive: true });
    return () => window.removeEventListener("scroll", close);
  }, [salesHandle, forsightHandle]);

  return (
    <ul className="flex items-center gap-1">
      {NAV.products.map((product) => (
        <li key={product.id}>
          <ProductDropdown
            product={product}
            onPage={onPage}
            active={activeId === product.id}
            handle={product.id === "sales-os" ? salesHandle : forsightHandle}
          />
        </li>
      ))}
    </ul>
  );
}

export function MarketingMobileNav({
  onPage,
  onNavigate,
}: {
  onPage: boolean;
  onNavigate: () => void;
}) {
  return (
    <Accordion className="w-full">
      {NAV.products.map((product) => (
        <AccordionItem key={product.id} value={product.id} className="border-white/[0.08]">
          <AccordionTrigger className="py-3 text-base font-medium text-white">
            {product.label}
          </AccordionTrigger>
          <AccordionPanel>
            <p className="text-xs font-medium text-silver">{product.header}</p>
            <ul className="mt-3 space-y-1">
              {product.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={hashHref(item.href, onPage)}
                    className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5 hover:bg-white/[0.04]"
                    onClick={onNavigate}
                  >
                    <span className="text-base font-medium text-white">{item.label}</span>
                    <span className="text-sm leading-snug text-silver">{item.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
