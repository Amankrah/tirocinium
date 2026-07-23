// Student route group strings (guide 3.4: sentence case, one job per string,
// errors state what happened and what to do next). The failure line is the
// generic copy of guide 4.0: it never distinguishes wrong, revoked, or
// malformed, because the backend will not tell us and the copy should not
// pretend to know.
export const strings = {
  shell: {
    wordmark: "Tirocinium",
    // The seat number kept quietly present so a student always knows which
    // identity their work is filed under (guide 4.0). Never a name.
    seat: (seatNumber: string) => `Seat ${seatNumber}`,
  },
  enter: {
    title: "Enter your course",
    codeLabel: "Course code",
    action: "Enter course",
    failure: "That code did not work. Check it against the card from your professor.",
  },
  course: {
    // The resolve-into-course greeting by seat number (guide 4.0).
    greeting: (seatNumber: string, courseTitle: string) =>
      `Seat ${seatNumber}, welcome to ${courseTitle}.`,
    empty: "Your case studies will appear here as your professor publishes them.",
    // A neutral activity stub, not a mastery label: real per-concept mastery,
    // with its always-expandable evidence, is Phase 6 (mastery spec, constraint
    // that a label is never shown bare).
    notAttempted: "Not attempted yet",
  },
  problem: {
    backToCourse: "Back to course",
    concepts: "Concepts",
    // The action rail (guide 4.1). New variant waits on the Phase 5 pool; upload
    // is live, but needs a variant to file against, which is also Phase 5, so
    // the rail stays quiet until then (decision 0019).
    newVariant: "New variant",
    upload: "Upload solution",
    soon: "Coming soon",
  },
  // The upload flow (guide 4.1): the most engineered student surface. Copy is
  // plain and honest; the client checks catch the obvious, and the server stays
  // the authority on a page's readability, so blur is a retake prompt, not a
  // refusal.
  upload: {
    title: "Upload your solution",
    back: "Back to the problem",
    intro:
      "Add clear photos of each handwritten page. You can reorder them before you send.",
    dropPrompt: "Drag your pages here, or",
    choose: "Choose photos",
    capture: "Take a photo",
    // Rejections that never reach the page list, one honest line each.
    rejectedType: (name: string) =>
      `${name} is not a photo or PDF, so it was left out.`,
    rejectedTooLarge: (name: string) => `${name} is over 15 MB, so it was left out.`,
    rejectedEmpty: (name: string) => `${name} is empty, so it was left out.`,
    // A soft warning on a page that stays in the list.
    blurry: "This page looks blurry. Retake it, or send it and we will try.",
    pageLabel: (index: number) => `Page ${index}`,
    remove: (index: number) => `Remove page ${index}`,
    moveUp: (index: number) => `Move page ${index} up`,
    moveDown: (index: number) => `Move page ${index} down`,
    retry: (index: number) => `Retry page ${index}`,
    empty: "No pages yet. Add photos of your handwritten work.",
    submit: (count: number) =>
      count === 1 ? "Send 1 page" : `Send ${count} pages`,
    statusUploading: "Sending your pages…",
    statusFailed: "Some pages did not send. Retry them, then send again.",
    statusProcessing: "Sent. We are reading your pages now.",
    statusError: "That did not go through. Check your connection and try again.",
  },
} as const;
