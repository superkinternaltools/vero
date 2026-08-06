import { requireAccess } from "@/core/auth/access";
import { getCurrentProfile } from "@/core/auth/session";
import { listPendingReviews, listRejectionReasons } from "@/modules/review/queries";
import { ReviewClient } from "@/modules/review/components/review-client";

export default async function ReviewPage() {
  await requireAccess("review");
  const profile = await getCurrentProfile();
  const [reviews, rejectionReasons] = await Promise.all([
    listPendingReviews({ userId: profile?.id ?? "", isAdmin: !!profile?.is_admin }),
    listRejectionReasons(),
  ]);
  return (
    <ReviewClient
      reviews={reviews}
      rejectionReasons={rejectionReasons}
      isAdmin={!!profile?.is_admin}
    />
  );
}
