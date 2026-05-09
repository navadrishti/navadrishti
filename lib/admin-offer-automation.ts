import { supabase } from '@/lib/db';
import { emailService } from '@/lib/email';

export async function autoRejectExpiredServiceOffers() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 5);

  const { data: expiredOffers, error: fetchError } = await supabase
    .from('service_offers')
    .select(`
      *,
      organization:creator_id (
        id,
        name,
        email
      )
    `)
    .eq('admin_status', 'pending')
    .lt('submitted_for_review_at', cutoffDate.toISOString());

  if (fetchError) {
    throw fetchError;
  }

  const rejectedOffers: any[] = [];

  for (const offer of expiredOffers || []) {
    const { error: updateError } = await supabase
      .from('service_offers')
      .update({
        admin_status: 'rejected',
        admin_reviewed_at: new Date().toISOString(),
        admin_comments: 'Automatically rejected after 5 days without review.'
      })
      .eq('id', offer.id);

    if (updateError) {
      console.error(`Error auto-rejecting offer ${offer.id}:`, updateError);
      continue;
    }

    rejectedOffers.push(offer);

    if (offer.organization?.email) {
      try {
        await emailService.sendEmail({
          to: offer.organization.email,
          subject: 'Service Offer Rejected After 5 Days',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0f172a;">Service Offer Status Update</h2>
              <p>Dear ${offer.organization.name},</p>
              <p>Your service offer <strong>${offer.title}</strong> was automatically rejected because it remained pending for more than 5 days.</p>
              <p>You can submit a revised offer if the opportunity is still active.</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error(`Error sending auto-rejection email for offer ${offer.id}:`, emailError);
      }
    }
  }

  return {
    rejectedCount: rejectedOffers.length,
    rejectedOffers: rejectedOffers.map((offer) => ({
      id: offer.id,
      title: offer.title,
      organization: offer.organization?.name || null,
    })),
  };
}