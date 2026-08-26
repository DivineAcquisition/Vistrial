import { isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * Maps the Radix `asChild` pattern onto Base UI's `render` prop.
 * The child element becomes the rendered node; its children stay as content.
 */
export function resolveAsChild<T>({
  asChild,
  children,
  render,
}: {
  asChild?: boolean;
  children?: ReactNode;
  render?: T;
}): { children?: ReactNode; render?: T | ReactElement } {
  if (render) {
    return { children, render };
  }
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ children?: ReactNode }>;
    return {
      render: child,
      children: child.props.children,
    };
  }
  return { children, render };
}

/**
 * Base UI treats `render` as a native button unless told otherwise.
 * Links and other non-button children must set `nativeButton={false}`.
 */
export function inferNativeButton(
  asChild: boolean | undefined,
  children: ReactNode,
  nativeButton?: boolean,
): boolean | undefined {
  if (nativeButton !== undefined) return nativeButton;
  if (!asChild || !isValidElement(children)) return nativeButton;
  const type = children.type;
  const props = children.props as { href?: unknown };
  if (typeof type === "string" && type !== "button") return false;
  if (props.href != null) return false;
  return nativeButton;
}
