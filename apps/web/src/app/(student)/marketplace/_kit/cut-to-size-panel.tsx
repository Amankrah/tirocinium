"use client";

// The cut-to-size panel bound to the project marketplace (decision 0114):
// previews through the same pricing action the basket uses, and adds the
// pieces to the basket held in the marketplace layout.
import type { LineDetail } from "@/lib/api/marketplace";
import { CutToSize } from "../../_marketplace/cut-to-size";
import { priceAction } from "../actions";
import { useMarket } from "./market-state";

export function CutToSizePanel({ line }: { line: LineDetail }) {
  const market = useMarket();
  return (
    <CutToSize
      line={line}
      preview={priceAction}
      onAdd={(pieces) => market.addPieces({ sku: line.sku, moq: line.moq, name: line.name }, pieces)}
    />
  );
}
