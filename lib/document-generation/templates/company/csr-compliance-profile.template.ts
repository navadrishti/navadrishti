// CSR COMPLIANCE PROFILE TEMPLATE 

type CsrComplianceProfileData = {
  companyName: string
  cin: string
  pan: string
  netWorth: number        // in crores
  turnover: number        // in crores
  netProfit: number       // in crores
  csrApplicable: boolean
}

export function csrComplianceProfileTemplate(data: CsrComplianceProfileData): string {
  const formatCrore = (val: number) =>
    `₹${val.toLocaleString("en-IN")} Cr`

  const applicabilityReason = () => {
    const reasons: string[] = []
    if (data.netProfit >= 5) reasons.push("Net Profit ≥ ₹5 Cr")
    if (data.netWorth >= 500) reasons.push("Net Worth ≥ ₹500 Cr")
    if (data.turnover >= 1000) reasons.push("Turnover ≥ ₹1000 Cr")
    return reasons.join(", ")
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }

          body {
            font-family: 'Georgia', serif;
            background: #ffffff;
            color: #1a1a2e;
            padding: 60px 72px;
            font-size: 13px;
            line-height: 1.6;
          }

          .header {
            border-bottom: 3px solid #1a1a2e;
            padding-bottom: 20px;
            margin-bottom: 36px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }

          .header-left h1 {
            font-size: 22px;
            font-weight: bold;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }

          .header-left p {
            font-size: 11px;
            color: #555;
            margin-top: 4px;
          }

          .header-right {
            text-align: right;
            font-size: 11px;
            color: #555;
          }

          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 2px;
            font-size: 11px;
            font-weight: bold;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-top: 6px;
          }

          .badge-applicable {
            background: #e8f5e9;
            color: #2e7d32;
            border: 1px solid #a5d6a7;
          }

          .badge-not-applicable {
            background: #fce4ec;
            color: #c62828;
            border: 1px solid #ef9a9a;
          }

          .section {
            margin-bottom: 32px;
          }

          .section-title {
            font-size: 10px;
            font-weight: bold;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #888;
            margin-bottom: 12px;
            padding-bottom: 4px;
            border-bottom: 1px solid #e0e0e0;
          }

          .field-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px 32px;
          }

          .field {
            display: flex;
            flex-direction: column;
            gap: 3px;
          }

          .field-label {
            font-size: 10px;
            font-weight: bold;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: #888;
          }

          .field-value {
            font-size: 14px;
            color: #1a1a2e;
            font-weight: 500;
          }

          .financials-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
            margin-top: 8px;
          }

          .financial-card {
            background: #f7f8fc;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 16px;
          }

          .financial-card .field-label {
            margin-bottom: 6px;
          }

          .financial-card .field-value {
            font-size: 16px;
            font-weight: bold;
          }

          .applicability-box {
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 20px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: ${data.csrApplicable ? "#f1f8f1" : "#fff8f8"};
            border-color: ${data.csrApplicable ? "#a5d6a7" : "#ef9a9a"};
          }

          .applicability-label {
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #444;
          }

          .applicability-reason {
            font-size: 11px;
            color: #666;
            margin-top: 4px;
          }

          .footer {
            margin-top: 60px;
            padding-top: 16px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #aaa;
          }
        </style>
      </head>
      <body>

        <div class="header">
          <div class="header-left">
            <h1>CSR Compliance Profile</h1>
            <p>Auto-generated by Navadrishti — Companies Act 2013, Section 135</p>
          </div>
          <div class="header-right">
            <div>Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</div>
            <span class="badge ${data.csrApplicable ? "badge-applicable" : "badge-not-applicable"}">
              CSR ${data.csrApplicable ? "Applicable" : "Not Applicable"}
            </span>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Company Identification</div>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">Company Name</span>
              <span class="field-value">${data.companyName}</span>
            </div>
            <div class="field">
              <span class="field-label">CIN</span>
              <span class="field-value">${data.cin}</span>
            </div>
            <div class="field">
              <span class="field-label">PAN</span>
              <span class="field-value">${data.pan}</span>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Financial Summary (Preceding Financial Year)</div>
          <div class="financials-grid">
            <div class="financial-card">
              <div class="field-label">Net Worth</div>
              <div class="field-value">${formatCrore(data.netWorth)}</div>
            </div>
            <div class="financial-card">
              <div class="field-label">Turnover</div>
              <div class="field-value">${formatCrore(data.turnover)}</div>
            </div>
            <div class="financial-card">
              <div class="field-label">Net Profit</div>
              <div class="field-value">${formatCrore(data.netProfit)}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">CSR Applicability</div>
          <div class="applicability-box">
            <div>
              <div class="applicability-label">
                CSR Obligation: ${data.csrApplicable ? "Yes" : "No"}
              </div>
              ${data.csrApplicable
                ? `<div class="applicability-reason">Criteria met — ${applicabilityReason()}</div>`
                : `<div class="applicability-reason">No threshold criteria met under Section 135</div>`
              }
            </div>
            <span class="badge ${data.csrApplicable ? "badge-applicable" : "badge-not-applicable"}">
              ${data.csrApplicable ? "Applicable" : "Not Applicable"}
            </span>
          </div>
        </div>

        <div class="footer">
          <span>Navadrishti Document Generation System</span>
          <span>CSR_COMPLIANCE_PROFILE — ${data.cin}</span>
        </div>

      </body>
    </html>
  `
}