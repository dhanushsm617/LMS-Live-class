import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';

const INK = '#1f2a44';
const GOLD = '#b8893a';
const MUTED = '#5b6478';

/** Stream a landscape A4 certificate straight into `res` (generated on demand, nothing stored). */
export function streamCertificatePdf(cert, res) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Certificate – ${cert.courseTitle}`, Author: 'LMS' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${cert.code}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width; // 841.89
  const H = doc.page.height; // 595.28

  // Frame
  doc.rect(0, 0, W, H).fill('#fffdf8');
  doc.lineWidth(6).strokeColor(INK).rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(1.5).strokeColor(GOLD).rect(38, 38, W - 76, H - 76).stroke();

  // Header
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(13).text('LEARNING MANAGEMENT SYSTEM', 0, 78, { align: 'center', characterSpacing: 4 });
  doc.fillColor(INK).font('Times-Bold').fontSize(46).text('Certificate of Completion', 0, 108, { align: 'center' });
  doc.moveTo(W / 2 - 70, 175).lineTo(W / 2 + 70, 175).lineWidth(2).strokeColor(GOLD).stroke();

  doc.fillColor(MUTED).font('Helvetica').fontSize(14).text('This is to certify that', 0, 200, { align: 'center' });
  doc.fillColor(INK).font('Times-BoldItalic').fontSize(40).text(cert.studentName, 60, 228, { align: 'center', width: W - 120 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(14).text('has successfully completed the course', 0, 292, { align: 'center' });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(24).text(cert.courseTitle, 80, 318, { align: 'center', width: W - 160 });

  // Footer: date / code / instructor
  const y = H - 130;
  const issued = new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const col = (x, label, value) => {
    doc.moveTo(x, y).lineTo(x + 200, y).lineWidth(1).strokeColor(MUTED).stroke();
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(value, x, y + 8, { width: 200, align: 'center' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(label, x, y + 28, { width: 200, align: 'center' });
  };
  col(80, 'Date of issue', issued);
  col(W / 2 - 100, 'Certificate ID', cert.code);
  col(W - 280, 'Instructor', cert.instructorName);

  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(`Verify at ${env.clientUrl}/verify/${cert.code}`, 0, H - 62, { align: 'center' });
  doc.end();
}
