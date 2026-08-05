import PDFDocument from "pdfkit";
import sharp from "sharp";

export type PublicTerms = {
  name: string;
  description: string;
  assetClassName: string;
  currency: string;
  purchaseAmountMinor: bigint;
  faceValueMinor: bigint;
  expectedInterestMinor: bigint;
  annualYieldBps: number;
  effectiveDate: number;
  maturityDate: number;
  publicId: string;
  termsHash: string;
};
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c] as string,
  );
const amount = (currency: string, minor: bigint) =>
  `${currency} ${(minor / 100n).toLocaleString("en-US")}.${(minor % 100n).toString().padStart(2, "0")}`;
const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export async function certificatePng(terms: PublicTerms): Promise<Buffer> {
  const svg = `<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#071b2f"/><rect x="55" y="55" width="1490" height="790" rx="28" fill="#0d2c48" stroke="#d9ae62" stroke-width="3"/><text x="120" y="165" fill="#d9ae62" font-size="48" font-family="Arial">VESTRA</text><text x="120" y="260" fill="white" font-size="58" font-family="Arial">${esc(terms.assetClassName)} Receipt</text><text x="120" y="395" fill="white" font-size="88" font-family="Arial">${amount(terms.currency, terms.purchaseAmountMinor)}</text><text x="120" y="480" fill="#d8e4ee" font-size="42" font-family="Arial">${(terms.annualYieldBps / 100).toFixed(2)}% p.a. · Matures ${date(terms.maturityDate)}</text><line x1="120" y1="590" x2="1480" y2="590" stroke="#42627a"/><text x="120" y="680" fill="#d8e4ee" font-size="32" font-family="Arial">Non-transferable · Hedera verified</text><text x="120" y="750" fill="#94adc0" font-size="26" font-family="Arial">Receipt ${esc(terms.publicId)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
export async function certificatePdf(terms: PublicTerms): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(28).fillColor("#0d2c48").text("VESTRA");
    doc.moveDown().fontSize(22).text(`${terms.assetClassName} Receipt`);
    doc
      .moveDown()
      .fontSize(30)
      .text(amount(terms.currency, terms.purchaseAmountMinor));
    doc
      .moveDown()
      .fontSize(12)
      .fillColor("#333")
      .text(`Annual yield: ${(terms.annualYieldBps / 100).toFixed(2)}%`);
    doc.text(`Effective date: ${date(terms.effectiveDate)}`);
    doc.text(`Maturity date: ${date(terms.maturityDate)}`);
    doc.text(`Receipt: ${terms.publicId}`);
    doc
      .moveDown()
      .fillColor("#666")
      .text(
        "Non-transferable digital receipt for a custodially held asset. This certificate contains public display terms only.",
      );
    doc.end();
  });
}
export function hip412(terms: PublicTerms, imageUri: string, pdfUri: string) {
  return {
    name: terms.name,
    description: terms.description,
    format: "HIP412@2.0.0",
    type: "image/png",
    image: imageUri,
    attributes: [
      { trait_type: "Asset Class", value: terms.assetClassName },
      { trait_type: "Currency", value: terms.currency },
      {
        trait_type: "Purchase Amount",
        value: amount(terms.currency, terms.purchaseAmountMinor),
      },
      {
        trait_type: "Face Value",
        value: amount(terms.currency, terms.faceValueMinor),
      },
      {
        trait_type: "Expected Interest",
        value: amount(terms.currency, terms.expectedInterestMinor),
      },
      {
        trait_type: "Annual Yield",
        value: `${(terms.annualYieldBps / 100).toFixed(2)}%`,
      },
      { trait_type: "Effective Date", value: date(terms.effectiveDate) },
      { trait_type: "Maturity Date", value: date(terms.maturityDate) },
      { trait_type: "Receipt Status", value: "Issued" },
    ],
    files: [{ uri: pdfUri, type: "application/pdf", is_default_file: false }],
    properties: {
      schema: "vestra.receipt/v1",
      receipt_id: terms.publicId,
      terms_hash: terms.termsHash,
      issuer: "Vestra",
    },
  };
}
