import { requireAccess } from "@/core/auth/access";
import { getCurrentProfile } from "@/core/auth/session";
import { listPendingReviews, listRejectionReasons } from "@/modules/review/queries";
import { ReviewClient } from "@/modules/review/components/review-client";

export default async function ReviewPage() {
  await requireAccess("review");
  const [reviews, rejectionReasons, profile] = await Promise.all([
    listPendingReviews(),
    listRejectionReasons(),
    getCurrentProfile(),
  ]);
  return (
    <ReviewClient
      reviews={reviews}
      rejectionReasons={rejectionReasons}
      isAdmin={!!profile?.is_admin}
    />
  );
}
