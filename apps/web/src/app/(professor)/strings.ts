// Professor route group strings (guide 3.4: sentence case, one job per string).
// The sign-in failure is the backend's one generic line, which never says
// whether the email or the password was the problem (backend 7.1).
export const strings = {
  shell: {
    wordmark: "Tirocinium",
    signOut: "Sign out",
  },
  signIn: {
    title: "Sign in",
    emailLabel: "Email",
    passwordLabel: "Password",
    action: "Sign in",
    failure: "Email or password is incorrect.",
  },
  dashboard: {
    greeting: (email: string) => `Signed in as ${email}.`,
    heading: "Your courses",
    empty: "Your courses will appear here once you create one.",
    newCourseLabel: "New course title",
    newCourseAction: "Create course",
  },
  course: {
    back: "All courses",
    heading: "Case studies",
    empty: "No case studies yet. Write your first one below.",
    draft: "Draft",
    published: "Published",
    open: "Open",
    publish: "Publish",
    unpublish: "Unpublish",
    newTitleLabel: "Title",
    newBodyLabel: "Body (Markdown, with $math$)",
    newAction: "Create case study",
    seatsLink: "Seats",
    importLink: "Import from PDF",
  },
  // The import-from-PDF door (guide 4.3). Decode reads the pages; the review
  // step where a professor confirms each detected problem and its figures is
  // Phase 4.4 proper and comes next, so this surface stops at "read".
  import: {
    title: "Import from PDF",
    back: "Back to course",
    intro:
      "Drop a PDF of problems with their solutions. We read it into drafts you confirm before anything reaches students.",
    dropPrompt: "Drag a PDF here, or",
    choose: "Choose a PDF",
    rejectedType: "That file is not a PDF.",
    rejectedTooLarge: "That PDF is over 60 MB.",
    rejectedEmpty: "That file is empty.",
    start: "Import this PDF",
    uploading: "Uploading your PDF…",
    reading: "Reading your PDF…",
    ready: (count: number) =>
      count === 1 ? "Read 1 page." : `Read ${count} pages.`,
    error: "That did not work. Check your connection and try again.",
    another: "Import another PDF",
    review: "Review the extracted problems",
  },
  // The import confirmation surface (guide 4.3): each detected problem beside its
  // source pages, confirmed into a draft before anything reaches students. The
  // AI proposes and the professor disposes.
  confirm: {
    title: "Review and confirm",
    back: "Back to course",
    progress: (confirmed: number, total: number) =>
      `${confirmed} of ${total} confirmed`,
    empty: "This import produced nothing to review.",
    allDone: "Every item is confirmed. They are drafts in your course now.",
    note: "Confirmed problems become drafts in your course. The rest are discarded after 30 days.",
    sourcePages: "Source pages",
    pageSpan: (span: string) => `Pages ${span}`,
    lowConfidence: "Low confidence",
    question: "Question",
    solution: "Solution",
    noSolution: "No solution was found for this problem.",
    edit: "Edit text",
    done: "Done editing",
    confirm: "Confirm",
    confirmed: "Confirmed",
    openDraft: "Open the draft",
    discard: "Discard",
    error: "That did not go through. Try again.",
    // Figure verbs, on a selected box (guide 4.3). Re-crop needs a server crop
    // endpoint that does not exist yet, so adjusting a crop is remove then redraw.
    figureHint:
      "Drag on a page to capture a figure the detector missed. Select a box to change or remove it.",
    markDecorative: "Mark decorative",
    markEssential: "Mark essential",
    removeFigure: "Remove figure",
    // Merge folds the next detected problem into this one (a question the
    // segmenter split); split is deferred until the corpus lands.
    mergeNext: "Merge with next",
  },
  seats: {
    back: "Back to course",
    heading: "Seats",
    // Honest about the one rule that shapes this whole surface.
    note: "A code is shown once, in the files a batch produces. Download them, hand them out, and keep them somewhere safe: we cannot show a code again.",
    countLabel: "How many seats",
    generateAction: "Generate seats",
    csvLink: "Download codes (CSV)",
    pdfLink: "Download cards (PDF)",
    batchReady: (count: number) =>
      `${count} ${count === 1 ? "seat" : "seats"} added. The codes are in these files, this once.`,
    empty: "No seats yet. Generate a batch to hand out codes.",
    colSeat: "Seat",
    colStatus: "Status",
    colLastUsed: "Last used",
    colSubmissions: "Submissions",
    active: "Active",
    revoked: "Revoked",
    neverUsed: "Not yet used",
    revoke: "Revoke",
    reissue: "Reissue",
    reissued: (seat: string) => `New code for ${seat}, shown once:`,
    copy: "Copy",
    copied: "Copied",
  },
} as const;
