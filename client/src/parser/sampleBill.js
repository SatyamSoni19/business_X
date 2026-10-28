// Lets you test the parser + review screen without any OCR. One line has low confidence on purpose.
export const SAMPLE_BILL_LINES = [
    { text: 'SHREE GANESH TRADERS - INDORE', confidence: 96 },
    { text: 'GSTIN 23ABCDE1234F1Z5   Invoice No: 482', confidence: 94 },
    { text: 'Sr  Description   HSN  Qty  MRP  Rate  GST%  Amount', confidence: 93 },
    { text: '1 FORTUNE SUNFLOWER OIL 1 LTR 15121990 20 165.00 140.00 5% 2800.00', confidence: 91 },
    { text: '2 FORTUNE SUNFLOWER OIL 500ML 15121990 24 90.00 76.00 5% 1824.00', confidence: 90 },
    { text: '3 PARLE-G BISCUIT 100G 19053100 48 10.00 8.40 18% 403.20', confidence: 88 },
    { text: '4 TATA SALT 1KG 25010010 30 28.00 22.50 0% 675.00', confidence: 92 },
    { text: '5 SUGAR LOOSE 17019990 50 KG 44.00 2200.00', confidence: 89 },
    { text: '6 SURF EXCEL EASY WASH 1KG 34022090 12 130.00 110.00 18% 1320.00', confidence: 58 },
    { text: '7 MAGGI 2 MIN NOODLES 70G 19023090 60 14.00 11.20 12% 999.00', confidence: 86 },
    { text: 'Sub Total   7250.20', confidence: 95 },
    { text: 'Grand Total   7250.00', confidence: 95 },
];