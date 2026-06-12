import { requireAccess } from "@/core/auth/access";
import { listPendingReviews, listRejectionReasons } from "@/modules/review/queries";
import { ReviewClient } from "@/modules/review/components/review-client";

export default async function ReviewPage() {
  await requireAccess("review");
  const [reviews, rejectionReasons] = await Promise.all([
    listPendingReviews(),
    listRejectionReasons(),
  ]);
  return <ReviewClient reviews={reviews} rejectionReasons={rejectionReasons} />;
}
