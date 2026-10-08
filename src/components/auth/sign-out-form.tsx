export const SIGN_OUT_PATH = "/auth/signout";

export function SignOutForm({
  children,
  className,
  ref,
}: {
  children?: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLFormElement>;
}) {
  return (
    <form ref={ref} method="post" action={SIGN_OUT_PATH} className={className}>
      {children}
    </form>
  );
}
