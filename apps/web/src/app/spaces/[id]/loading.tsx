import { ArinovaSpinner } from "@/components/ui/arinova-spinner";

export default function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <ArinovaSpinner />
    </div>
  );
}
