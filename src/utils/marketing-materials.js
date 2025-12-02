// /js/utils/marketing-materials.js - Generate partner marketing PDFs with QR codes

/* ------------------- Generate QR Code as Data URL ------------------- */
function generateQRCodeDataURL(url) {
  return new Promise((resolve) => {
    // Create temporary container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    // Generate QR code
    const qr = new QRCode(container, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#1a3a4a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    // Wait for QR code to render
    setTimeout(() => {
      const canvas = container.querySelector('canvas');
      const dataURL = canvas ? canvas.toDataURL('image/png') : null;
      document.body.removeChild(container);
      resolve(dataURL);
    }, 100);
  });
}

/* ------------------- Generate Brochure PDF ------------------- */
export async function generatePartnerBrochure(partner) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  const referralUrl = `${window.location.origin}/?ref=${partner.referral_code}`;
  const qrDataURL = await generateQRCodeDataURL(referralUrl);

  // Colors
  const primaryColor = [26, 58, 74];    // #1a3a4a - dark teal
  const accentColor = [184, 157, 102];  // #b89d66 - gold
  const lightBg = [250, 248, 245];      // #faf8f5 - warm white

  // Page dimensions
  const pageWidth = 8.5;
  const pageHeight = 11;
  const margin = 0.5;

  // --- Header Section ---
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 2.2, 'F');

  // Logo text (since we don't have the actual logo image)
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text('HEADSTONE', pageWidth / 2, 0.9, { align: 'center' });
  doc.setFontSize(22);
  doc.setFont('helvetica', 'normal');
  doc.text('LEGACY', pageWidth / 2, 1.3, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(...accentColor);
  doc.text('Preserve Their Story Forever', pageWidth / 2, 1.7, { align: 'center' });

  // --- Main Content ---
  let y = 2.6;

  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Digital Memorials for Headstones', pageWidth / 2, y, { align: 'center' });

  y += 0.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);

  const intro = [
    'A weatherproof QR code tag attaches to any headstone.',
    'Visitors scan to see photos, stories, and family history.',
    'Keep their memory alive for generations.'
  ];

  intro.forEach(line => {
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += 0.3;
  });

  // --- Features Section ---
  y += 0.3;
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 2.2, 0.1, 0.1, 'F');

  y += 0.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...primaryColor);
  doc.text('What You Get:', margin + 0.3, y);

  y += 0.35;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  const features = [
    'Unlimited photos, videos & audio recordings',
    'Family tree with connections across memorials',
    'Guest book for visitors to share memories',
    'Timeline of important life events',
    'Weatherproof tag lasts 10+ years outdoors'
  ];

  features.forEach(feature => {
    doc.setFillColor(...accentColor);
    doc.circle(margin + 0.45, y - 0.05, 0.05, 'F');
    doc.text(feature, margin + 0.6, y);
    y += 0.3;
  });

  // --- QR Code Section ---
  y += 0.5;
  doc.setFillColor(...primaryColor);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 2.8, 0.1, 0.1, 'F');

  y += 0.4;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Scan to Get Started', pageWidth / 2, y, { align: 'center' });

  y += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Create your loved one\'s memorial today', pageWidth / 2, y, { align: 'center' });

  // QR Code
  if (qrDataURL) {
    const qrSize = 1.8;
    doc.addImage(qrDataURL, 'PNG', (pageWidth - qrSize) / 2, y + 0.2, qrSize, qrSize);
  }

  y += 2.2;
  doc.setFontSize(9);
  doc.setTextColor(...accentColor);
  doc.text(referralUrl.replace('https://', '').replace('http://', ''), pageWidth / 2, y, { align: 'center' });

  // --- Pricing Section ---
  y += 0.6;
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Simple Pricing', pageWidth / 2, y, { align: 'center' });

  y += 0.35;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text('Starting at $39 - one-time purchase, no subscriptions', pageWidth / 2, y, { align: 'center' });

  // --- Footer ---
  doc.setFillColor(...accentColor);
  doc.rect(0, pageHeight - 0.6, pageWidth, 0.6, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('www.headstonelegacy.com', pageWidth / 2, pageHeight - 0.25, { align: 'center' });

  // Partner attribution (small, bottom corner)
  if (partner.business_name) {
    doc.setFontSize(7);
    doc.setTextColor(200, 200, 200);
    doc.text(`Partner: ${partner.business_name}`, pageWidth - margin, pageHeight - 0.7, { align: 'right' });
  }

  // Download the PDF
  const filename = `HeadstoneLegacy-Brochure-${partner.referral_code}.pdf`;
  doc.save(filename);

  return filename;
}

/* ------------------- Generate Business Card PDF ------------------- */
export async function generatePartnerBusinessCards(partner) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'in',
    format: 'letter'
  });

  const referralUrl = `${window.location.origin}/?ref=${partner.referral_code}`;
  const qrDataURL = await generateQRCodeDataURL(referralUrl);

  // Colors
  const primaryColor = [26, 58, 74];
  const accentColor = [184, 157, 102];

  // Business card dimensions (standard 3.5 x 2 inches)
  const cardWidth = 3.5;
  const cardHeight = 2;
  const cardsPerRow = 2;
  const cardsPerCol = 4;
  const marginX = (11 - (cardsPerRow * cardWidth)) / 2;
  const marginY = (8.5 - (cardsPerCol * cardHeight)) / 2;

  // Draw 8 business cards per page
  for (let row = 0; row < cardsPerCol; row++) {
    for (let col = 0; col < cardsPerRow; col++) {
      const x = marginX + col * cardWidth;
      const y = marginY + row * cardHeight;

      // Card background
      doc.setFillColor(...primaryColor);
      doc.rect(x, y, cardWidth, cardHeight, 'F');

      // Gold accent line
      doc.setFillColor(...accentColor);
      doc.rect(x, y + cardHeight - 0.15, cardWidth, 0.15, 'F');

      // Logo text
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('HEADSTONE', x + 0.15, y + 0.4);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('LEGACY', x + 0.15, y + 0.6);

      // Tagline
      doc.setFontSize(6);
      doc.setTextColor(...accentColor);
      doc.text('Digital Memorials for Headstones', x + 0.15, y + 0.85);

      // QR Code
      if (qrDataURL) {
        const qrSize = 0.9;
        doc.addImage(qrDataURL, 'PNG', x + cardWidth - qrSize - 0.15, y + 0.15, qrSize, qrSize);
      }

      // URL
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(5);
      doc.text('Scan or visit:', x + 0.15, y + 1.15);
      doc.setFontSize(6);
      doc.text(referralUrl.replace('https://', '').replace('http://', ''), x + 0.15, y + 1.35);

      // Partner name
      if (partner.business_name) {
        doc.setFontSize(5);
        doc.setTextColor(...accentColor);
        doc.text(partner.business_name, x + 0.15, y + cardHeight - 0.25);
      }
    }
  }

  // Cut lines (light gray dashed)
  doc.setDrawColor(200, 200, 200);
  doc.setLineDashPattern([0.05, 0.05], 0);
  doc.setLineWidth(0.005);

  // Vertical cut lines
  for (let col = 0; col <= cardsPerRow; col++) {
    const x = marginX + col * cardWidth;
    doc.line(x, marginY - 0.1, x, marginY + cardsPerCol * cardHeight + 0.1);
  }

  // Horizontal cut lines
  for (let row = 0; row <= cardsPerCol; row++) {
    const y = marginY + row * cardHeight;
    doc.line(marginX - 0.1, y, marginX + cardsPerRow * cardWidth + 0.1, y);
  }

  const filename = `HeadstoneLegacy-BusinessCards-${partner.referral_code}.pdf`;
  doc.save(filename);

  return filename;
}

/* ------------------- Generate Rack Card PDF (4x9 inches) ------------------- */
export async function generatePartnerRackCard(partner) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [4, 9]
  });

  const referralUrl = `${window.location.origin}/?ref=${partner.referral_code}`;
  const qrDataURL = await generateQRCodeDataURL(referralUrl);

  // Colors
  const primaryColor = [26, 58, 74];
  const accentColor = [184, 157, 102];

  const width = 4;
  const height = 9;

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, width, 1.8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('HEADSTONE', width / 2, 0.7, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('LEGACY', width / 2, 1.0, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(...accentColor);
  doc.text('Preserve Their Story Forever', width / 2, 1.4, { align: 'center' });

  // Main content
  let y = 2.2;
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Digital Memorials', width / 2, y, { align: 'center' });
  y += 0.25;
  doc.text('for Headstones', width / 2, y, { align: 'center' });

  y += 0.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);

  const lines = [
    'A weatherproof QR code tag',
    'attaches to any headstone.',
    '',
    'Visitors scan to see photos,',
    'stories, and family history.',
    '',
    'Keep their memory alive',
    'for generations.'
  ];

  lines.forEach(line => {
    doc.text(line, width / 2, y, { align: 'center' });
    y += 0.28;
  });

  // Features box
  y += 0.2;
  doc.setFillColor(250, 248, 245);
  doc.roundedRect(0.2, y, width - 0.4, 1.6, 0.1, 0.1, 'F');

  y += 0.3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...primaryColor);
  doc.text('Includes:', 0.35, y);

  y += 0.25;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);

  const features = [
    'Unlimited photos & videos',
    'Family tree connections',
    'Guest book for visitors',
    'Lasts 10+ years outdoors'
  ];

  features.forEach(f => {
    doc.setFillColor(...accentColor);
    doc.circle(0.45, y - 0.03, 0.03, 'F');
    doc.text(f, 0.55, y);
    y += 0.25;
  });

  // QR Section
  y += 0.3;
  doc.setFillColor(...primaryColor);
  doc.roundedRect(0.2, y, width - 0.4, 2.4, 0.1, 0.1, 'F');

  y += 0.35;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Scan to Get Started', width / 2, y, { align: 'center' });

  if (qrDataURL) {
    const qrSize = 1.4;
    doc.addImage(qrDataURL, 'PNG', (width - qrSize) / 2, y + 0.15, qrSize, qrSize);
  }

  y += 1.7;
  doc.setFontSize(7);
  doc.setTextColor(...accentColor);
  doc.text(referralUrl.replace('https://', '').replace('http://', ''), width / 2, y, { align: 'center' });

  // Footer
  doc.setFillColor(...accentColor);
  doc.rect(0, height - 0.5, width, 0.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Starting at $39', width / 2, height - 0.2, { align: 'center' });

  const filename = `HeadstoneLegacy-RackCard-${partner.referral_code}.pdf`;
  doc.save(filename);

  return filename;
}
