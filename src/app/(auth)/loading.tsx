import LoaderOneDemo from "@/components/loader-one-demo";

export default function AuthLoading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center">
        <LoaderOneDemo />
        <span role="status" className="sr-only">
          Loading
        </span>
      </div>
    </div>
  );
}
