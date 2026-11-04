// scripts/demo/documents.mjs
// 시연 영상용 PDF 내용. 가상의 회사 "Fernway Labs"의 보고서, 임대차 계약서, 인보이스, 매뉴얼 등이다.
// render-document.swift가 이 구조를 실제 문서처럼 그린다.

const accent = [0.15, 0.39, 0.92];

const report2025 = {
  header: "Fernway Labs · Annual Report 2025",
  accent,
  pages: [
    {
      blocks: [
        { kind: "eyebrow", text: "Annual Report 2025" },
        { kind: "title", text: "A year of building what our customers asked for" },
        { kind: "subtitle", text: "Fernway Labs makes scheduling and inventory software for independent retailers in 27 countries." },
        {
          kind: "kpis",
          kpis: [
            { label: "Revenue", value: "$182.4M", delta: "+14% YoY" },
            { label: "Active customers", value: "38,200", delta: "+21% YoY" },
            { label: "Overseas revenue", value: "$48.2M", delta: "+35% YoY" },
            { label: "Net retention", value: "118%", delta: "+6 pts" },
          ],
        },
        { kind: "heading", text: "Letter from the CEO" },
        { kind: "paragraph", text: "2025 was the year we stopped chasing features and started finishing them. We shipped offline mode, rebuilt reporting from the ground up, and cut median support response time from nine hours to under two. Customers noticed: retention reached its highest level since we started measuring it." },
        { kind: "paragraph", text: "We also learned that growth outside our home market was no longer an experiment. Overseas sales grew faster than any other part of the business, and for the first time more than a quarter of new customers signed up in a language other than English." },
        { kind: "paragraph", text: "None of this happens without the 640 people at Fernway and the shop owners who trust us with their busiest days. Thank you." },
      ],
    },
    {
      blocks: [
        { kind: "heading", text: "Domestic Business" },
        { kind: "paragraph", text: "Domestic revenue grew 8% to $134.2 million. Growth came mostly from existing customers adding locations and upgrading to the Pro plan, while new-customer acquisition stayed flat as we reduced paid marketing in saturated regions." },
        {
          kind: "table",
          columns: ["Segment", "2024", "2025", "Change"],
          rows: [
            ["Scheduling", "$61.0M", "$65.8M", "+8%"],
            ["Inventory", "$43.5M", "$47.9M", "+10%"],
            ["Payments", "$19.8M", "$20.5M", "+4%"],
            ["Total domestic", "$124.3M", "$134.2M", "+8%"],
          ],
        },
        {
          kind: "bullets",
          items: [
            "Opened 12 new partner stores and three regional support hubs.",
            "Pro plan adoption rose from 31% to 44% of domestic accounts.",
            "Average implementation time fell from 11 days to 4 days.",
          ],
        },
      ],
    },
    {
      blocks: [
        { kind: "eyebrow", text: "Section 3" },
        { kind: "heading", text: "International Sales" },
        { kind: "callout", text: "Overseas revenue grew 35% year over year to $48.2 million, the fastest growth of any segment." },
        { kind: "paragraph", text: "Overseas sales grew 35% last year, led by Southeast Asia and Europe. Localized onboarding in six new languages and local payment methods lowered the time to first value for new shops, and partner resellers brought in 40% of new international accounts." },
        {
          kind: "bars",
          bars: [
            { label: "Southeast Asia", value: 17.6, display: "$17.6M" },
            { label: "Europe", value: 14.9, display: "$14.9M" },
            { label: "Japan", value: 9.8, display: "$9.8M" },
            { label: "North America", value: 5.9, display: "$5.9M" },
          ],
        },
        {
          kind: "table",
          columns: ["Region", "2024", "2025", "Growth"],
          rows: [
            ["Southeast Asia", "$11.2M", "$17.6M", "+57%"],
            ["Europe", "$11.0M", "$14.9M", "+35%"],
            ["Japan", "$8.7M", "$9.8M", "+13%"],
            ["North America", "$4.8M", "$5.9M", "+23%"],
          ],
        },
      ],
    },
    {
      blocks: [
        { kind: "heading", text: "Outlook for 2026" },
        { kind: "paragraph", text: "We expect revenue growth of 15–18% in 2026, with international markets contributing roughly half of new revenue. Our priorities are deliberately few." },
        {
          kind: "bullets",
          items: [
            "Launch the inventory forecasting module to all Pro customers in Q2.",
            "Open a fulfillment and support center in Singapore.",
            "Invest in logistics automation to keep gross margin above 70%.",
          ],
        },
        { kind: "heading", text: "Risks We Are Watching" },
        {
          kind: "bullets",
          items: [
            "Currency swings in Southeast Asian markets.",
            "Rising cloud infrastructure costs.",
            "Competition from bundled point-of-sale vendors.",
          ],
        },
      ],
    },
  ],
};

const report2024 = {
  header: "Fernway Labs · Annual Report 2024",
  accent: [0.42, 0.33, 0.85],
  pages: [
    {
      blocks: [
        { kind: "eyebrow", text: "Annual Report 2024" },
        { kind: "title", text: "Laying the groundwork" },
        { kind: "subtitle", text: "A year of steady progress and harder choices." },
        {
          kind: "kpis",
          kpis: [
            { label: "Revenue", value: "$160.0M", delta: "+9% YoY" },
            { label: "Active customers", value: "31,600", delta: "+12% YoY" },
            { label: "Overseas revenue", value: "$35.7M", delta: "+12% YoY" },
            { label: "Net retention", value: "112%", delta: "+2 pts" },
          ],
        },
        { kind: "heading", text: "Letter from the CEO" },
        { kind: "paragraph", text: "2024 tested our discipline. We paused two product lines to focus on reliability and spent the second half rebuilding the foundations that let us move faster this year." },
      ],
    },
    {
      blocks: [
        { kind: "heading", text: "Domestic Business" },
        { kind: "paragraph", text: "Domestic revenue was $124.3 million, roughly flat in the second half as we retired legacy plans." },
      ],
    },
    {
      blocks: [
        { kind: "heading", text: "International Sales" },
        { kind: "callout", text: "Overseas revenue grew 12% year over year to $35.7 million." },
        { kind: "paragraph", text: "Japan remained our largest overseas market. Growth slowed in Europe while we rebuilt our reseller program." },
      ],
    },
  ],
};

const lease = {
  header: "Residential Lease Agreement · 14 Harbor Lane, Unit 3B",
  accent: [0.13, 0.55, 0.42],
  pages: [
    {
      blocks: [
        { kind: "eyebrow", text: "Lease Agreement" },
        { kind: "title", text: "Residential Lease Agreement" },
        { kind: "subtitle", text: "Between Harbor Lane Properties LLC (Landlord) and Alex Morgan (Tenant)." },
        {
          kind: "facts",
          items: [
            "Premises|14 Harbor Lane, Unit 3B",
            "Lease term|24 months from March 1, 2026",
            "Monthly rent|$2,450, due on the 1st",
            "Security deposit|$4,900",
          ],
        },
        { kind: "heading", text: "1. Use of Premises" },
        { kind: "paragraph", text: "The Tenant will use the premises only as a private residence. Subletting requires the Landlord's written consent." },
        { kind: "heading", text: "2. Maintenance" },
        { kind: "paragraph", text: "The Landlord handles heating, plumbing and electrical repairs. The Tenant keeps the unit clean and reports any damage within seven days." },
      ],
    },
    {
      blocks: [
        { kind: "heading", text: "3. Security Deposit" },
        { kind: "paragraph", text: "The Landlord will return the full security deposit within 14 days after the lease ends, minus any unpaid rent, utilities, or repair costs beyond normal wear and tear, with an itemized statement." },
        { kind: "heading", text: "4. Pets" },
        { kind: "paragraph", text: "One cat or dog under 25 kg is permitted with a one-time pet fee of $300." },
        { kind: "heading", text: "5. Signatures" },
        { kind: "paragraph", text: "Signed on February 12, 2026 by both parties." },
      ],
    },
  ],
};

// 아래 문서는 검색 결과 목록이 비어 보이지 않도록 둔다. "sales", "budget" 같은 질문에 함께 걸린다.
const quarterly = {
  header: "Fernway Labs · Q3 2025 Quarterly Update",
  accent,
  pages: [
    {
      blocks: [
        { kind: "eyebrow", text: "Quarterly Update" },
        { kind: "title", text: "Q3 2025 at a glance" },
        { kind: "subtitle", text: "Results for July through September 2025, shared with all employees." },
        {
          kind: "kpis",
          kpis: [
            { label: "Revenue", value: "$47.1M", delta: "+15% YoY" },
            { label: "New customers", value: "2,140", delta: "+18% YoY" },
            { label: "Overseas share", value: "27%", delta: "+4 pts" },
            { label: "Churn", value: "1.9%", delta: "−0.3 pts" },
          ],
        },
        { kind: "heading", text: "Sales" },
        { kind: "paragraph", text: "Sales grew in every region this quarter. The reseller program in Europe signed 31 new partners, and the self-serve plan now brings in a third of new accounts." },
        { kind: "heading", text: "Marketing" },
        { kind: "paragraph", text: "The \"Open Late\" fall campaign launched on September 2. Spend stayed within the approved Q3 marketing budget, and cost per sign-up came in at $34." },
      ],
    },
  ],
};

const invoice = {
  header: "Northwind Studio · Invoice #2026-0418",
  accent: [0.85, 0.42, 0.18],
  pages: [
    {
      blocks: [
        { kind: "eyebrow", text: "Invoice" },
        { kind: "title", text: "Invoice #2026-0418" },
        { kind: "subtitle", text: "Northwind Studio, billed to Fernway Labs. Due within 30 days." },
        {
          kind: "facts",
          items: ["Issued|April 18, 2026", "Due|May 18, 2026", "Project|Website redesign, phase 2", "Total due|$12,800.00"],
        },
        {
          kind: "table",
          columns: ["Item", "Hours", "Rate", "Amount"],
          rows: [
            ["Design system update", "40", "$120", "$4,800"],
            ["Landing page build", "50", "$120", "$6,000"],
            ["Accessibility review", "16", "$125", "$2,000"],
          ],
        },
        { kind: "paragraph", text: "Please pay by bank transfer and include the invoice number as the reference. Late payments are charged 1.5% per month." },
      ],
    },
  ],
};

const espressoManual = {
  header: "Brava One Espresso Machine · User Manual",
  accent: [0.45, 0.3, 0.2],
  pages: [
    {
      blocks: [
        { kind: "eyebrow", text: "User Manual" },
        { kind: "title", text: "Brava One Espresso Machine" },
        { kind: "subtitle", text: "Read these instructions before first use and keep them for later." },
        { kind: "heading", text: "Making an espresso" },
        {
          kind: "bullets",
          items: [
            "Fill the water tank and wait until the ready light stops blinking.",
            "Use 18 g of finely ground coffee and tamp it evenly.",
            "Press the single-cup button. A good shot takes 25 to 30 seconds.",
          ],
        },
      ],
    },
    {
      blocks: [
        { kind: "heading", text: "Descaling" },
        { kind: "callout", text: "Descale the machine every 3 months, or when the orange light turns on." },
        { kind: "paragraph", text: "Mix one sachet of descaler with 1 liter of water, run it through the steam wand and the group head, then rinse twice with clean water." },
        { kind: "heading", text: "Troubleshooting" },
        { kind: "paragraph", text: "If coffee runs too fast, grind finer. If it drips slowly or not at all, grind coarser or tamp more lightly." },
      ],
    },
  ],
};

const travelInsurance = {
  header: "Bluepeak Travel Insurance · Policy Summary",
  accent: [0.13, 0.55, 0.42],
  pages: [
    {
      blocks: [
        { kind: "eyebrow", text: "Policy Summary" },
        { kind: "title", text: "Travel Insurance for Lisbon, May 2026" },
        { kind: "facts", items: ["Insured|Alex Morgan", "Trip|May 12 – May 16, 2026", "Medical cover|Up to $250,000", "Baggage|Up to $2,000"] },
        { kind: "heading", text: "Flight delays" },
        { kind: "paragraph", text: "If your flight is delayed by more than 6 hours, you can claim up to $300 for meals and a hotel. Keep your receipts and the airline's delay confirmation." },
        { kind: "heading", text: "Making a claim" },
        { kind: "paragraph", text: "Submit claims online within 30 days of returning home." },
      ],
    },
  ],
};

export const documents = {
  "Reports/Annual Report 2025.pdf": report2025,
  "Reports/Annual Report 2024.pdf": report2024,
  "Reports/Q3 2025 Quarterly Update.pdf": quarterly,
  "Contracts/Apartment Lease.pdf": lease,
  "Finance/Invoice 2026-0418.pdf": invoice,
  "Manuals/Espresso Machine Manual.pdf": espressoManual,
  "Travel/Travel Insurance Policy.pdf": travelInsurance,
};
