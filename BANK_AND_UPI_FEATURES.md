# Bank & UPI Payment Features

## Overview
The BananaStack Billing App has been enhanced with support for displaying bank details and generating UPI payment QR codes on bills. This allows customers to easily scan and make payments via UPI.

## New Features

### 1. **Business Profile - Bank Details**
Added the following fields to the Business Settings (Business Details):
- **Bank Name**: Name of your bank
- **Account Holder Name**: Name on the bank account
- **Account Number**: Your bank account number
- **IFSC Code**: IFSC code of your bank
- **UPI ID**: Your UPI identifier (e.g., yourname@upi or yourname@paytm)

### 2. **Bill PDF Features**

#### Bank Details Display
- Bank details are displayed in the "PAYMENT DETAILS" section of the bill PDF
- Includes:
  - Bank name
  - Account holder name
  - Account number
  - IFSC code
  - UPI ID

#### UPI QR Code Generation
- A QR code is automatically generated for each bill based on:
  - Your UPI ID
  - Account holder name
  - Bill amount
  - Bill number
- The QR code follows the standard UPI payment format
- QR code is displayed in a dedicated box on the bill PDF for easy scanning

### 3. **Manual Bill Display**
When creating a manual bill in the app, bank details are shown on the generated PDF in the payment section, making it easy for clients to identify payment methods.

## How to Use

### Step 1: Configure Bank & UPI Details
1. Open the BananaStack Billing App
2. Click on the **Settings** button (gear icon) in the navigation
3. Fill in your bank details:
   - Bank Name
   - Account Holder Name
   - Account Number
   - IFSC Code
   - UPI ID
4. Click **Save**

### Step 2: Generate Bills with QR Codes
1. Create a new bill from the "Manual Bills" section
2. Fill in the bill details as usual
3. Click **Download PDF**
4. The generated PDF will include:
   - Your bank details in the payment section
   - A scannable UPI QR code (if UPI ID is configured)

### Step 3: Share with Customers
- Customers can scan the UPI QR code to initiate a payment through their UPI app
- The QR code is encoded with:
  - Your UPI ID
  - Payment amount
  - Bill reference number
  - Payee name

## Technical Details

### QR Code Format
The UPI QR code follows the standard UPI Deep Link format:
```
upi://pay?pa=<UPI_ID>&pn=<NAME>&am=<AMOUNT>&tn=Bill%20<BILL_NUMBER>
```

### Libraries Used
- **qrcode.js**: For generating QR codes
- **jsPDF**: For PDF generation
- **jsPDF AutoTable**: For table layouts in PDFs

### Data Storage
- Bank and UPI details are stored in the profile JSON file
- They are included in data backups when you export backup
- No sensitive data is uploaded; everything is stored locally

## Features

✅ Bank account details display on bills  
✅ Automatic UPI QR code generation  
✅ QR code embedded in PDF invoices  
✅ Supports all UPI apps (Google Pay, PhonePe, Paytm, etc.)  
✅ Secure - all data stored locally  
✅ Professional PDF formatting  
✅ Easy configuration via settings modal  

## Notes

- Bank details are optional. If not configured, the payment section will not appear.
- UPI QR code is only generated if a UPI ID is configured.
- The QR code is dynamically generated based on the bill amount.
- QR codes work with all major UPI-enabled payment apps in India.
- All data remains on your local device; nothing is sent to any server.

## Browser Compatibility

Works best in:
- Chrome/Chromium
- Firefox
- Safari
- Edge

## Future Enhancements

Potential features for future versions:
- Multiple bank account support
- Different QR codes for different payment methods
- Payment reminder automation
- Transaction tracking integration
- Mobile app version
