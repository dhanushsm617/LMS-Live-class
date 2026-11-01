import { Router } from 'express';
import Certificate from '../models/Certificate.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { streamCertificatePdf } from '../services/certificatePdf.js';

const router = Router();

/** Public: anyone (e.g. an employer) can verify a certificate code. */
router.get(
  '/verify/:code',
  asyncHandler(async (req, res) => {
    const cert = await Certificate.findOne({ code: req.params.code.toUpperCase() });
    if (!cert) return res.status(404).json({ valid: false, message: 'No certificate found with that code' });
    res.json({ valid: true, code: cert.code, studentName: cert.studentName, courseTitle: cert.courseTitle, instructorName: cert.instructorName, issuedAt: cert.issuedAt });
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await Certificate.find({ student: req.user._id }).sort('-issuedAt');
    res.json({ items: items.map((c) => ({ id: c._id, code: c.code, courseTitle: c.courseTitle, instructorName: c.instructorName, issuedAt: c.issuedAt })) });
  })
);

router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const cert = await Certificate.findById(req.params.id);
    if (!cert) throw new ApiError(404, 'Certificate not found');
    if (String(cert.student) !== String(req.user._id) && req.user.role !== 'admin') throw new ApiError(403, 'Not your certificate');
    streamCertificatePdf(cert, res);
  })
);

export default router;
