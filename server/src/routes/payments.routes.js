import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Payment from '../models/Payment.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler, validate } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { refreshCourseStats } from '../services/courseStats.js';

const router = Router();

const stripe = env.payments.stripeSecretKey ? new Stripe(env.payments.stripeSecretKey) : null;

/**
 * Idempotent: flips pending -> paid atomically, then grants access.
 * Safe to call from the webhook AND from the success-page verification at the same time.
 */
export async function fulfilPayment(paymentId, extra = {}) {
  const paid = await Payment.findOneAndUpdate(
    { _id: paymentId, status: 'pending' },
    { status: 'paid', paidAt: new Date(), ...extra },
    { new: true }
  );
  const payment = paid || (await Payment.findById(paymentId));
  if (payment?.status === 'paid') {
    try {
      await Enrollment.updateOne(
        { student: payment.student, course: payment.course },
        { $setOnInsert: { source: 'paid', payment: payment._id } },
        { upsert: true }
      );
    } catch (error) {
      // The webhook and success-page poll can fulfil the same payment together.
      // The unique (student, course) index makes one upsert win; treat the other
      // request as success when that enrollment now exists.
      if (error.code !== 11000) throw error;
      const enrollmentExists = await Enrollment.exists({ student: payment.student, course: payment.course });
      if (!enrollmentExists) throw error;
    }
    if (paid) await refreshCourseStats(payment.course);
  }
  return payment;
}

/* ------------------------------ Stripe webhook (mounted with a raw body in app.js) ------------------------------ */

export const stripeWebhook = asyncHandler(async (req, res) => {
  if (!stripe || !env.payments.stripeWebhookSecret) throw new ApiError(503, 'Stripe webhook not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], env.payments.stripeWebhookSecret);
  } catch (e) {
    throw new ApiError(400, `Webhook signature verification failed: ${e.message}`);
  }

  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (obj.payment_status === 'paid') await fulfilPayment(obj.metadata?.paymentId, { providerPaymentIntentId: obj.payment_intent });
      break;
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      await Payment.updateOne({ _id: obj.metadata?.paymentId, status: 'pending' }, { status: 'failed' });
      break;
    case 'charge.refunded':
      await Payment.updateOne({ providerPaymentIntentId: obj.payment_intent }, { status: 'refunded' });
      break;
    default:
      break;
  }
  res.json({ received: true });
});

/* ------------------------------ checkout ------------------------------ */

router.post(
  '/checkout',
  requireAuth,
  validate(z.object({ courseId: z.string().regex(/^[a-f\d]{24}$/i) })),
  asyncHandler(async (req, res) => {
    if (!['mock', 'stripe'].includes(env.payments.mode)) {
      throw new ApiError(503, 'Payments are not configured. Set PAYMENT_MODE to "mock" or "stripe".');
    }
    if (env.payments.mode === 'stripe' && !stripe) {
      throw new ApiError(503, 'Stripe checkout is selected but STRIPE_SECRET_KEY is missing.');
    }

    const course = await Course.findOne({ _id: req.body.courseId, status: 'published' });
    if (!course) throw new ApiError(404, 'Course not found');
    if (course.price <= 0) throw new ApiError(400, 'This course is free – enroll directly');
    if (String(course.instructor) === String(req.user._id)) throw new ApiError(400, 'You cannot buy your own course');
    if (await Enrollment.exists({ student: req.user._id, course: course._id })) throw new ApiError(409, 'You are already enrolled');

    const platformFee = Math.round((course.price * env.payments.platformFeePercent) / 100);
    const payment = await Payment.create({
      student: req.user._id,
      course: course._id,
      instructor: course.instructor,
      amount: course.price,
      currency: course.currency,
      platformFee,
      instructorEarnings: course.price - platformFee,
      provider: env.payments.mode,
    });

    if (env.payments.mode === 'mock') {
      return res.status(201).json({ mode: 'mock', paymentId: payment._id, amount: payment.amount, currency: payment.currency, courseTitle: course.title });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: req.user.email,
        client_reference_id: String(payment._id),
        line_items: [
          {
            quantity: 1,
            price_data: { currency: course.currency, unit_amount: course.price, product_data: { name: course.title, description: course.subtitle || undefined } },
          },
        ],
        metadata: { paymentId: String(payment._id), courseId: String(course._id), studentId: String(req.user._id) },
        success_url: `${env.clientUrl}/checkout/success?payment=${payment._id}`,
        cancel_url: `${env.clientUrl}/courses/${course.slug}`,
      });
      payment.providerSessionId = session.id;
      await payment.save();
      return res.status(201).json({ mode: 'stripe', paymentId: payment._id, url: session.url });
    } catch (error) {
      // Do not leave an unusable pending payment behind if Stripe rejects the request.
      await Payment.updateOne({ _id: payment._id, status: 'pending' }, { status: 'failed' });
      throw new ApiError(502, 'Could not create a Stripe checkout session. Check the Stripe key, currency, and course price.');
    }
  })
);

/** Dev/demo only: "pay" without Stripe keys. Disabled in stripe mode. */
router.post(
  '/:id/mock-confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (env.payments.mode !== 'mock') throw new ApiError(404, 'Not found');
    const payment = await Payment.findOne({ _id: req.params.id, student: req.user._id });
    if (!payment) throw new ApiError(404, 'Payment not found');
    let done;
    try {
      done = await fulfilPayment(payment._id);
    } catch (error) {
      // Confirmation is safe to retry if another request already granted access.
      if (error.code !== 11000) throw error;
      const [confirmedPayment, enrollment] = await Promise.all([
        Payment.findOne({ _id: payment._id, student: req.user._id }),
        Enrollment.exists({ student: payment.student, course: payment.course }),
      ]);
      if (confirmedPayment?.status !== 'paid' || !enrollment) throw error;
      done = confirmedPayment;
    }
    res.json({ status: done.status });
  })
);

/** Success page polls this. In Stripe mode it also verifies directly with Stripe, so local dev works without a webhook tunnel. */
router.get(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    let payment = await Payment.findOne({ _id: req.params.id, student: req.user._id }).populate('course', 'title slug');
    if (!payment) throw new ApiError(404, 'Payment not found');
    if (payment.status === 'pending' && payment.provider === 'stripe' && payment.providerSessionId && stripe) {
      const session = await stripe.checkout.sessions.retrieve(payment.providerSessionId);
      if (session.payment_status === 'paid') {
        await fulfilPayment(payment._id, { providerPaymentIntentId: session.payment_intent });
        payment = await Payment.findById(payment._id).populate('course', 'title slug');
      }
    }
    res.json({ status: payment.status, course: payment.course });
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await Payment.find({ student: req.user._id, status: { $in: ['paid', 'refunded'] } }).sort('-paidAt').populate('course', 'title slug');
    res.json({ items });
  })
);

export default router;
