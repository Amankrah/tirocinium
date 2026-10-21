import { browseAction, compareAction } from "../actions";
import { CompareView } from "../_kit/compare-view";

// The comparison page (decision 0101). What to compare lives in the tray, held
// by the marketplace layout, so the page itself is only the view of it.
export default function ComparePage() {
  return <CompareView compare={compareAction} browse={browseAction} />;
}
