import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Rfq, RfqRequest } from "@/lib/api/marketplace";
import { RfqPanel, type RfqAnswer } from "./rfq-panel";

// The supplier desk's reply (decision 0108). What these hold to account: the
// form sends the two fields a real request carries and still asks for no
// person; a desk reply renders as a letter around the server's priced table,
// with the footer saying a model wrote the words; a rules reply renders the
// authored notes and says no model was involved; and no figure on the page is
// computed here, every one is the server's cents divided once.

const priced: NonNullable<Rfq["priced"]> = {
  lines: [
    {
      position: 1,
      sku: "LMS-A36-PL06",
      supplier_id: "LMS",
      supplier_name: "Laurentian Metal Supply",
      name: "ASTM A36 / CSA 44W hot-rolled plate",
      spec: "6 mm",
      unit: "kg",
      unit_label: "kg",
      requested_quantity: 40,
      quantity: 40,
      list_price_cents: 520,
      unit_price_cents: 520,
      break_percent: 0,
      extended_cents: 20800,
      cut_to_length: false,
      cut_count: 1,
      cut_fee_cents: 0,
      mass_grams: 40000,
      lead_days: 2,
    },
  ],
  totals: {
    line_count: 1,
    supplier_count: 1,
    goods_cents: 20800,
    discount_cents: 0,
    cut_fee_cents: 0,
    freight_cents: 7900,
    taxes: [
      { code: "GST", rate: 0.05, amount_cents: 1435 },
      { code: "QST", rate: 0.09975, amount_cents: 2863 },
    ],
    tax_cents: 4298,
    total_cents: 32998,
    total_mass_grams: 40000,
    longest_lead_days: 2,
    cost_per_kg_cents: 520,
  },
  notices: ["LMS-A36-PL06: quantity raised to the 25 kg minimum order."],
};

const advice: Rfq["advice"] = {
  notes: [{ rule: "env-chemical", text: "Zinc is consumed rapidly by ammonia." }],
  missing: [],
};

const desk: RfqAnswer = {
  advice,
  priced,
  reply: {
    subject: "Re: auger trough, A36 plate, 40 kg",
    opening: "You need 40 kg of 6 mm A36 plate for an auger trough.",
    offer: "We can supply 40 kg at $5.20 per kg.\n\nFreight is estimated at $79.00.",
    questions: ["Please send the cut sizes."],
    notes: ["Silage effluent will consume galvanising."],
    alternatives: [{ sku: "BSA-316L-2B", reason: "316L resists the organic acids." }],
    closing: "Send the drawing and we will firm this up. Laurentian Metal Supply, sales.",
  },
};

describe("the request form", () => {
  it("sends what a supplier needs and asks for no person", () => {
    const onSend = vi.fn<(request: RfqRequest) => void>();
    render(<RfqPanel sku="LMS-A36-PL06" pending={false} answer={null} onSend={onSend} />);

    expect(screen.queryByLabelText(/name/i)).toBeNull();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/How many/), { target: { value: "40 kg" } });
    fireEvent.change(screen.getByLabelText("When do you need it?"), {
      target: { value: "three weeks" },
    });
    fireEvent.change(screen.getByLabelText("Ship to"), { target: { value: "Lachine" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: "LMS-A36-PL06",
        quantity: "40 kg",
        needed_by: "three weeks",
        ship_to: "Lachine",
      }),
    );
  });
});

describe("the reply", () => {
  it("renders the desk's letter around the server's figures and says a model wrote it", () => {
    render(<RfqPanel sku="LMS-A36-PL06" pending={false} answer={desk} onSend={vi.fn()} />);
    const reply = screen.getByRole("region", { name: "Their reply" });

    expect(within(reply).getByRole("heading", { name: desk.reply!.subject })).toBeTruthy();
    expect(within(reply).getByText(desk.reply!.opening)).toBeTruthy();
    // Two paragraphs from one field with a blank line in it.
    expect(within(reply).getByText("We can supply 40 kg at $5.20 per kg.")).toBeTruthy();
    expect(within(reply).getByText("Freight is estimated at $79.00.")).toBeTruthy();
    expect(within(reply).getByText("Please send the cut sizes.")).toBeTruthy();
    expect(within(reply).getByText("BSA-316L-2B")).toBeTruthy();

    const table = within(reply).getByRole("table");
    expect(within(table).getByText("$208.00")).toBeTruthy();
    expect(within(table).getByText("$79.00")).toBeTruthy();
    expect(within(table).getByText("$329.98")).toBeTruthy();
    expect(within(reply).getByText(/2 working days/)).toBeTruthy();
    expect(within(reply).getByText(/raised to the 25 kg minimum/)).toBeTruthy();

    expect(screen.getByText(/The wording is a model's/)).toBeTruthy();
    // The authored notes are not shown twice: the desk folded them in.
    expect(within(reply).queryByText("Zinc is consumed rapidly by ammonia.")).toBeNull();
  });

  it("renders the authored notes when no desk answered and says no model was involved", () => {
    render(
      <RfqPanel
        sku="LMS-A36-PL06"
        pending={false}
        answer={{ advice, priced, reply: null }}
        onSend={vi.fn()}
      />,
    );
    const reply = screen.getByRole("region", { name: "Their reply" });
    expect(within(reply).getByText("Zinc is consumed rapidly by ammonia.")).toBeTruthy();
    expect(within(reply).getByText("$329.98")).toBeTruthy();
    expect(screen.getByText(/nothing here was written by a model/)).toBeTruthy();
    expect(screen.queryByText(/The wording is a model's/)).toBeNull();
  });

  it("names what was missing when nothing could be priced", () => {
    render(
      <RfqPanel
        sku={null}
        pending={false}
        answer={{
          advice: { notes: [{ rule: "unmatched-line", text: "Quote a SKU." }], missing: ["a quantity and unit"] },
          priced: null,
          reply: null,
        }}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByText("a quantity and unit")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
