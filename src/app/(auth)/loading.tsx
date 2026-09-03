import { AuthLoader } from "@/components/auth/auth-loader";

export default function AuthLoading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <AuthLoader label="Loading" />
    </div>
  );
}
