"use client";

// Filters apply as they are ticked (decision 0107). This is the only script
// in the filter sheet: it listens for a change on the form around it, reads
// the form as the query it would have submitted, and navigates to it on the
// client with the scroll kept, so the grid updates where the student is
// looking rather than jumping to the top of a reloaded page. Without script
// the form still submits with its own Apply button, which stays rendered.
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function AutoApply() {
  const router = useRouter();
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const apply = () => {
      const data = new FormData(form);
      const params = new URLSearchParams();
      for (const [name, value] of data.entries()) {
        if (typeof value === "string" && value !== "") params.append(name, value);
      }
      const action = form.getAttribute("action") ?? "";
      const query = params.toString();
      router.replace(query ? `${action}?${query}` : action, { scroll: false });
    };
    form.addEventListener("change", apply);
    return () => form.removeEventListener("change", apply);
  }, [router]);

  return <span ref={anchor} hidden />;
}
