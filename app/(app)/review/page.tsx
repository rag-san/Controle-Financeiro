import { Suspense } from "react";
import { ReviewPage } from "@/src/features/review/ReviewPage";

export default function ReviewRoutePage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando revisão...</div>}>
      <ReviewPage />
    </Suspense>
  );
}
